-- =========================================================
-- NEXO · Editar y eliminar ventas (pedidos)
-- Ejecutar una sola vez en Supabase → SQL Editor.
--  - Un vendedor solo puede editar/eliminar SUS propias ventas.
--  - El administrador puede con todas.
--  - El stock se ajusta de forma atómica (todo o nada).
-- =========================================================

-- ---------- EDITAR: cambia cliente y/o productos de una venta ----------
create or replace function public.editar_pedido(p_order_id uuid, p_cliente_id uuid, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders%rowtype;
  v_old     record;
  v_line    record;
  v_product record;
  v_price   numeric(10,2);
  v_total   numeric(10,2) := 0;
  v_new     jsonb := '[]'::jsonb;
begin
  if public.current_role() not in ('vendedor','administrador') then
    raise exception 'Solo un vendedor o administrador puede editar ventas.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'La venta no existe.';
  end if;

  if public.current_role() = 'vendedor' and v_order.vendedor_id is distinct from auth.uid() then
    raise exception 'Solo puedes editar tus propias ventas.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe tener al menos un producto.';
  end if;

  if not exists (select 1 from public.profiles where id = p_cliente_id and rol = 'cliente') then
    raise exception 'El cliente seleccionado no es válido.';
  end if;

  if exists (select 1 from public.order_items where order_id = p_order_id and product_id is null) then
    raise exception 'Esta venta incluye un producto que ya no existe y no se puede editar. Puedes eliminarla.';
  end if;

  -- 1) Devuelve al inventario lo que se había vendido
  for v_old in select product_id, cantidad from public.order_items where order_id = p_order_id loop
    update public.products set stock = stock + v_old.cantidad where id = v_old.product_id;
  end loop;

  -- 2) Descuenta los productos nuevos (agrupa productos repetidos)
  for v_line in
    select (e->>'product_id')::uuid as pid, sum((e->>'cantidad')::integer)::integer as qty
    from jsonb_array_elements(p_items) e
    group by 1
  loop
    if v_line.qty is null or v_line.qty <= 0 then
      raise exception 'La cantidad de cada producto debe ser mayor que cero.';
    end if;

    select * into v_product from public.products where id = v_line.pid for update;
    if not found then
      raise exception 'Producto no encontrado.';
    end if;
    if v_product.stock < v_line.qty then
      raise exception 'Stock insuficiente para "%"', v_product.nombre;
    end if;

    -- Conserva el precio original si el producto ya estaba en la venta
    select precio_unit into v_price from public.order_items
      where order_id = p_order_id and product_id = v_line.pid limit 1;
    v_price := coalesce(v_price, v_product.precio);

    update public.products set stock = stock - v_line.qty where id = v_product.id;
    v_total := v_total + (v_price * v_line.qty);
    v_new := v_new || jsonb_build_object(
      'product_id', v_product.id, 'nombre', v_product.nombre, 'cantidad', v_line.qty, 'precio_unit', v_price
    );
  end loop;

  -- 3) Reemplaza el detalle y actualiza la venta
  delete from public.order_items where order_id = p_order_id;
  insert into public.order_items (order_id, product_id, nombre, cantidad, precio_unit)
  select p_order_id, (e->>'product_id')::uuid, e->>'nombre', (e->>'cantidad')::integer, (e->>'precio_unit')::numeric
  from jsonb_array_elements(v_new) e;

  update public.orders set cliente_id = p_cliente_id, total = v_total where id = p_order_id;

  return p_order_id;
end;
$$;

-- ---------- ELIMINAR: borra la venta y devuelve el stock ----------
create or replace function public.eliminar_pedido(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_old   record;
begin
  if public.current_role() not in ('vendedor','administrador') then
    raise exception 'Solo un vendedor o administrador puede eliminar ventas.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'La venta no existe.';
  end if;

  if public.current_role() = 'vendedor' and v_order.vendedor_id is distinct from auth.uid() then
    raise exception 'Solo puedes eliminar tus propias ventas.';
  end if;

  for v_old in select product_id, cantidad from public.order_items where order_id = p_order_id and product_id is not null loop
    update public.products set stock = stock + v_old.cantidad where id = v_old.product_id;
  end loop;

  delete from public.orders where id = p_order_id;  -- order_items se borra en cascada
  return p_order_id;
end;
$$;

revoke all on function public.editar_pedido(uuid, uuid, jsonb) from public, anon;
revoke all on function public.eliminar_pedido(uuid) from public, anon;
grant execute on function public.editar_pedido(uuid, uuid, jsonb) to authenticated;
grant execute on function public.eliminar_pedido(uuid) to authenticated;

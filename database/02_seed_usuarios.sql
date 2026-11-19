-- =========================================================
-- NEXO · Usuarios iniciales (administrador y vendedor)
-- Crea un administrador y un vendedor de ejemplo.
-- ANTES de ejecutarlo en Supabase, reemplaza los textos CAMBIAR_* por contraseñas
-- propias (mínimo 12 caracteres). NO guardes contraseñas reales en este archivo
-- ni lo subas a GitHub con ellas escritas.
-- El trigger handle_new_user() crea el perfil leyendo el rol de raw_app_meta_data.
-- =========================================================
do $$
declare
  v_id uuid;
  r record;
begin
  for r in
    select * from (values
      ('admin@nexo.com',    'CAMBIAR_CONTRASEÑA_ADMIN',    'Ana Rivas',   'administrador'),
      ('vendedor@nexo.com', 'CAMBIAR_CONTRASEÑA_VENDEDOR', 'Luis Campos', 'vendedor')
    ) as t(email, pass, nombre, rol)
  loop
    if not exists (select 1 from auth.users where email = r.email) then
      v_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        r.email, extensions.crypt(r.pass, extensions.gen_salt('bf')), now(),
        jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'rol', r.rol),
        jsonb_build_object('nombre', r.nombre),
        now(), now(), '', '', '', ''
      );

      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_id, v_id::text,
        jsonb_build_object('sub', v_id::text, 'email', r.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;
  end loop;
end $$;

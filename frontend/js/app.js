/* =========================================================================
   NEXO · Sistema de Ventas e Inventario — FRONTEND
   -------------------------------------------------------------------------
   Interfaz web (HTML + CSS + JS). No habla con la base de datos:
   - Autenticación: Supabase Auth (js/api.js) — correo/contraseña y Google
     (Google es exclusivo para clientes).
   - Datos y reglas de negocio: backend PHP (API REST) — ver /backend.
   - El menú por rol es solo comodidad de interfaz: la autoridad real está en
     el backend (valida rol en cada ruta) y en las políticas RLS de Supabase.
   ========================================================================= */


const ROLES = {
  ADMIN: 'administrador',
  VENDEDOR: 'vendedor',
  CLIENTE: 'cliente'
};

function money(n){ return 'S/ ' + Number(n || 0).toFixed(2); }
function formatDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric' }) + ' · ' +
         d.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
}

/* ================ CONTROL DE ACCESO BASADO EN ROLES (RBAC) ================
   El menú y las rutas del lado del cliente son solo una conveniencia de UI:
   la autoridad real está en las políticas de Row Level Security de
   Supabase, así que aunque alguien manipule el front-end no puede leer ni
   escribir datos fuera de lo que su rol permite. */

const NAV_BY_ROLE = {
  [ROLES.ADMIN]: [
    { id:'dashboard',  label:'Panel general',        icon:'◧' },
    { id:'catalogo',   label:'Catálogo de productos', icon:'▣' },
    { id:'inventario', label:'Stock e inventario',    icon:'▤' },
    { id:'usuarios',   label:'Usuarios y clientes',   icon:'◍' },
    { id:'reportes',   label:'Reportes comerciales',  icon:'▦' },
  ],
  [ROLES.VENDEDOR]: [
    // Sin "Panel general": ese módulo es exclusivo del administrador.
    { id:'nuevo-pedido', label:'Nuevo pedido',        icon:'＋' },
    { id:'mis-ventas', label:'Mis ventas',            icon:'▤' },
    { id:'clientes',   label:'Historial de clientes', icon:'◍' },
  ],
  [ROLES.CLIENTE]: [
    { id:'catalogo-cliente', label:'Catálogo',        icon:'▣' },
    { id:'mis-pedidos',      label:'Mis pedidos',     icon:'▤' },
    { id:'perfil',           label:'Mi perfil',       icon:'◍' },
  ],
};

let state = { view:null, cart:[] };
let currentSession = null; // { id, nombre, email, rol }

/* ============================== CAPA DE DATOS ============================== */
/* Cada método llama a la API del backend PHP. El backend valida la sesión y
   el rol; si no hay permiso responde 401/403 y aquí se muestra el mensaje. */

async function safe(promise, fallback){
  try { return await promise; }
  catch (e) { toast(e.message, 'error'); return fallback; }
}

const Data = {
  getProducts(){ return safe(Api.get('/products'), []); },
  createProduct(payload){ return Api.post('/products', payload); },
  updateProduct(id, payload){ return Api.put('/products/' + id, payload); },
  deleteProduct(id){ return Api.del('/products/' + id); },
  setStock(id, stock){ return Api.patch('/products/' + id + '/stock', { stock }); },

  getProfiles(){ return safe(Api.get('/users'), []); },
  createUser(payload){ return Api.post('/users', payload); },
  updateProfileRol(id, rol){ return Api.patch('/users/' + id + '/rol', { rol }); },
  deleteProfile(id){ return Api.del('/users/' + id); },

  getOrders(){ return safe(Api.get('/orders').then(l => l.map(mapOrder)), []); },
  getOrdersByCliente(clienteId){
    return safe(Api.get('/orders?cliente_id=' + encodeURIComponent(clienteId)).then(l => l.map(mapOrder)), []);
  },
  getOrdersByVendedor(vendedorId){
    return safe(Api.get('/orders?vendedor_id=' + encodeURIComponent(vendedorId)).then(l => l.map(mapOrder)), []);
  },
  async crearPedido(clienteId, items){
    // La verificación final de stock y el descuento ocurren de forma atómica
    // dentro de la función crear_pedido() de la base de datos.
    const order = await Api.post('/orders', {
      cliente_id: clienteId,
      items: items.map(i => ({ product_id: i.productId, cantidad: i.cantidad }))
    });
    return order.id;
  },
};

function mapOrder(o){
  return {
    id: o.id,
    clienteId: o.cliente_id,
    clienteNombre: o.cliente_nombre || '—',
    vendedorId: o.vendedor_id,
    vendedorNombre: o.vendedor_nombre || null,
    total: o.total,
    estado: o.estado,
    fecha: o.fecha,
    items: (o.items || []).map(it => ({ productId: it.product_id, nombre: it.nombre, cantidad: it.cantidad, precioUnit: it.precio_unit })),
  };
}

/* ============================== AUTENTICACIÓN ============================== */

const Auth = {
  async loginPassword(email, password){
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok:false, error: traducirErrorAuth(error.message) };
    return { ok:true };
  },

  async register(nombre, email, password){
    // Registro público: el backend solo crea cuentas de CLIENTE.
    try { await Api.post('/auth/register', { nombre, email, password }, null); return { ok:true }; }
    catch (e) { return { ok:false, error: e.message }; }
  },

  async loginGoogle(){
    // Exclusivo para clientes: el trigger de la base de datos asigna el rol
    // "cliente" automáticamente a toda cuenta nueva creada por este proveedor,
    // y handleSessionObtained() vuelve a validarlo por seguridad.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    if (error) toast(traducirErrorAuth(error.message), 'error');
  },

  async logout(){
    await supabase.auth.signOut();
  }
};

function traducirErrorAuth(msg){
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese correo.';
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('email not confirmed')) return 'Debes confirmar tu correo antes de ingresar.';
  return msg;
}

async function handleSessionObtained(session){
  let profile;
  try {
    profile = await Api.get('/auth/me', session.access_token);
  } catch (e) {
    toast(e.message, 'error');
    await supabase.auth.signOut();
    return;
  }

  const provider = session.user.app_metadata?.provider;
  if (provider === 'google' && profile.rol !== ROLES.CLIENTE) {
    toast('El acceso con Google es exclusivo para clientes.', 'error');
    await supabase.auth.signOut();
    return;
  }

  currentSession = { id: profile.id, nombre: profile.nombre, email: profile.email, rol: profile.rol };
  state.view = null;
  renderApp();
}

supabase.auth.onAuthStateChange((event, session) => {
  // setTimeout evita bloqueos de supabase-js al hacer llamadas dentro del callback.
  setTimeout(() => {
    if (event === 'TOKEN_REFRESHED') return;
    if (session) {
      if (currentSession && currentSession.id === session.user.id) return;
      handleSessionObtained(session);
    } else {
      currentSession = null;
      renderApp();
    }
  }, 0);
});

/* ============================== RENDER RAÍZ ============================== */

function renderApp(){
  const authScreen = document.getElementById('auth-screen');
  const app = document.getElementById('app');

  if (!currentSession) {
    authScreen.classList.remove('hidden');
    app.classList.add('hidden');
    return;
  }

  authScreen.classList.add('hidden');
  app.classList.remove('hidden');

  document.getElementById('user-avatar').textContent = currentSession.nombre.charAt(0).toUpperCase();
  document.getElementById('user-name').textContent = currentSession.nombre;
  document.getElementById('user-role').textContent = currentSession.rol;

  const nav = NAV_BY_ROLE[currentSession.rol] || [];
  const navEl = document.getElementById('sidebar-nav');
  navEl.innerHTML = nav.map(item => `
    <button class="nav-btn" data-view="${item.id}">
      <span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span>
    </button>`).join('');

  navEl.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => goTo(btn.dataset.view));
  });

  if (!state.view || !nav.some(n => n.id === state.view)) {
    state.view = nav[0]?.id || null;
  }
  goTo(state.view);
}

function loading(){
  return `<div class="loading-state"><span class="spinner"></span> Cargando información...</div>`;
}

async function goTo(viewId){
  state.view = viewId;
  if (!currentSession) return renderApp();

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));

  const routes = {
    'dashboard':         renderDashboard,
    'catalogo':          renderCatalogoAdmin,
    'inventario':        renderInventario,
    'usuarios':          renderUsuarios,
    'reportes':          renderReportes,
    'nuevo-pedido':      renderNuevoPedido,
    'mis-ventas':        renderMisVentas,
    'clientes':          renderHistorialClientes,
    'catalogo-cliente':  renderCatalogoCliente,
    'mis-pedidos':       renderMisPedidos,
    'perfil':            renderPerfil,
  };

  const allowed = (NAV_BY_ROLE[currentSession.rol] || []).some(n => n.id === viewId);
  if (!allowed || !routes[viewId]) {
    setTitle('Acceso no disponible', '');
    document.getElementById('view-content').innerHTML = `
      <div class="empty-state"><div class="empty-icon">⛔</div><p>No tienes permisos para ver esta sección.</p></div>`;
    return;
  }
  document.getElementById('view-content').innerHTML = loading();
  await routes[viewId]();
}

function setTitle(title, subtitle){
  document.getElementById('view-title').textContent = title;
  document.getElementById('view-subtitle').textContent = subtitle || '';
}

/* ================================ UTILIDADES UI ================================ */

function toast(msg, type=''){
  const el = document.createElement('div');
  el.className = `toast ${type ? 'toast-'+type : ''}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function openModal(title, bodyHTML){
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal(){ document.getElementById('modal-overlay').classList.add('hidden'); }
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });

function stockBadge(stock){
  if (stock <= 0) return `<span class="badge badge-bad">Sin stock</span>`;
  if (stock <= 5) return `<span class="badge badge-warn">Stock bajo · ${stock}</span>`;
  return `<span class="badge badge-good">Disponible · ${stock}</span>`;
}
function estadoBadge(estado){
  const map = { completado:'badge-good', pendiente:'badge-warn', cancelado:'badge-bad' };
  return `<span class="badge ${map[estado]||'badge-neutral'}">${estado}</span>`;
}
function productImg(p, size='normal'){
  const cls = size === 'sm' ? 'product-img-sm' : 'product-img';
  return p.imagen_url
    ? `<div class="${cls}"><img src="${p.imagen_url}" alt="${p.nombre}" loading="lazy" onerror="this.parentElement.innerHTML='<span>Sin imagen</span>'"></div>`
    : `<div class="${cls}"><span class="${size==='sm' ? '' : 'product-img-placeholder'}">Sin imagen</span></div>`;
}

/* =========================================================================
   VISTAS — ADMINISTRADOR
   ========================================================================= */

async function renderDashboard(){
  setTitle('Panel general', `Bienvenido, ${currentSession.nombre}`);
  let d;
  try { d = await Api.get('/dashboard'); }
  catch (e) { toast(e.message, 'error'); return; }
  const content = document.getElementById('view-content');

  content.innerHTML = `
    <div class="grid-cards">
      <div class="stat-card"><p class="stat-label">Productos en catálogo</p><p class="stat-value">${d.productos}</p><p class="stat-sub">${d.stock_bajo} con stock bajo o agotado</p></div>
      <div class="stat-card"><p class="stat-label">Ventas registradas</p><p class="stat-value">${d.ventas}</p><p class="stat-sub">${money(d.ingresos)} en ingresos totales</p></div>
      <div class="stat-card"><p class="stat-label">Usuarios del sistema</p><p class="stat-value">${d.usuarios}</p><p class="stat-sub">${d.clientes} clientes registrados</p></div>
      <div class="stat-card"><p class="stat-label">Vendedores activos</p><p class="stat-value">${d.vendedores}</p><p class="stat-sub">Procesando pedidos</p></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Últimas ventas</h3></div>
      <div class="panel-body">${renderOrdersTable((d.ultimas || []).map(mapOrder))}</div>
    </div>`;
}

async function renderCatalogoAdmin(){
  setTitle('Catálogo de productos', 'Alta, edición y baja de productos');
  const content = document.getElementById('view-content');
  let allProducts = await Data.getProducts();

  content.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>Productos</h3>
        <div style="display:flex;gap:10px;">
          <input id="search-prod" class="search-input" placeholder="Buscar producto...">
          <button class="btn-accent" id="btn-new-product">＋ Nuevo producto</button>
        </div>
      </div>
      <div class="panel-body" id="product-table-wrap"></div>
    </div>`;

  const draw = (filter='') => {
    const items = allProducts.filter(p => p.nombre.toLowerCase().includes(filter.toLowerCase()));
    document.getElementById('product-table-wrap').innerHTML = items.length ? `
      <table>
        <thead><tr><th></th><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th></th></tr></thead>
        <tbody>${items.map(p => `
          <tr>
            <td>${productImg(p, 'sm')}</td>
            <td><span class="cell-strong">${p.nombre}</span><br><span class="cell-muted">${p.descripcion}</span></td>
            <td class="cell-muted">${p.categoria}</td>
            <td>${money(p.precio)}</td>
            <td>${stockBadge(p.stock)}</td>
            <td class="row-actions">
              <button class="btn-ghost btn-small" data-edit="${p.id}">Editar</button>
              <button class="btn-danger btn-small" data-del="${p.id}">Eliminar</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>` : `<div class="empty-state"><div class="empty-icon">▣</div><p>No se encontraron productos.</p></div>`;

    content.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => productForm(allProducts.find(p=>p.id===b.dataset.edit))));
    content.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este producto del catálogo?')) return;
      try { await Data.deleteProduct(b.dataset.del); toast('Producto eliminado', 'success'); allProducts = await Data.getProducts(); draw(document.getElementById('search-prod').value); }
      catch(e){ toast(e.message, 'error'); }
    }));
  };

  draw();
  document.getElementById('search-prod').addEventListener('input', e => draw(e.target.value));
  document.getElementById('btn-new-product').addEventListener('click', () => productForm());

  function productForm(existing){
    openModal(existing ? 'Editar producto' : 'Nuevo producto', `
      <form id="product-form" class="form-grid">
        <label class="full">Nombre
          <input name="nombre" required value="${existing?.nombre || ''}">
        </label>
        <label class="full">Descripción
          <textarea name="descripcion">${existing?.descripcion || ''}</textarea>
        </label>
        <label class="full">URL de imagen <span class="cell-muted">(opcional, puedes dejarla vacía por ahora)</span>
          <input name="imagen_url" type="url" placeholder="https://..." value="${existing?.imagen_url || ''}">
        </label>
        <label>Categoría
          <input name="categoria" required value="${existing?.categoria || ''}">
        </label>
        <label>Precio (S/)
          <input name="precio" type="number" step="0.01" min="0" required value="${existing?.precio ?? ''}">
        </label>
        <label>Stock inicial
          <input name="stock" type="number" min="0" required value="${existing?.stock ?? 0}">
        </label>
        <div class="full modal-footer">
          <button type="button" class="btn-ghost" id="cancel-form">Cancelar</button>
          <button type="submit" class="btn-primary">${existing ? 'Guardar cambios' : 'Crear producto'}</button>
        </div>
      </form>`);

    document.getElementById('cancel-form').addEventListener('click', closeModal);
    document.getElementById('product-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const payload = {
        nombre: f.nombre.value.trim(),
        descripcion: f.descripcion.value.trim(),
        categoria: f.categoria.value.trim(),
        precio: parseFloat(f.precio.value),
        stock: parseInt(f.stock.value, 10),
        imagen_url: f.imagen_url.value.trim() || null,
      };
      try {
        if (existing) { await Data.updateProduct(existing.id, payload); toast('Producto actualizado', 'success'); }
        else { await Data.createProduct(payload); toast('Producto creado', 'success'); }
        closeModal();
        allProducts = await Data.getProducts();
        draw(document.getElementById('search-prod')?.value || '');
      } catch(err){ toast(err.message, 'error'); }
    });
  }
}

async function renderInventario(){
  setTitle('Stock e inventario', 'Supervisión y ajuste de existencias');
  const content = document.getElementById('view-content');
  const products = await Data.getProducts();
  const bajo = products.filter(p => p.stock <= 5 && p.stock > 0).length;
  const agotado = products.filter(p => p.stock <= 0).length;

  content.innerHTML = `
    <div class="grid-cards">
      <div class="stat-card"><p class="stat-label">Total de ítems</p><p class="stat-value">${products.reduce((s,p)=>s+p.stock,0)}</p><p class="stat-sub">Unidades en inventario</p></div>
      <div class="stat-card"><p class="stat-label">Stock bajo</p><p class="stat-value">${bajo}</p><p class="stat-sub">Productos con 5 o menos unidades</p></div>
      <div class="stat-card"><p class="stat-label">Agotados</p><p class="stat-value">${agotado}</p><p class="stat-sub">Requieren reposición urgente</p></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Existencias por producto</h3></div>
      <div class="panel-body">
        <table>
          <thead><tr><th>Producto</th><th>Categoría</th><th>Estado</th><th>Ajustar stock</th></tr></thead>
          <tbody>${products.map(p => `
            <tr>
              <td class="cell-strong">${p.nombre}</td>
              <td class="cell-muted">${p.categoria}</td>
              <td id="badge-${p.id}">${stockBadge(p.stock)}</td>
              <td>
                <div class="qty-stepper">
                  <button data-adj="${p.id}" data-delta="-1">−</button>
                  <span id="qty-${p.id}">${p.stock}</span>
                  <button data-adj="${p.id}" data-delta="1">+</button>
                </div>
              </td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;

  content.querySelectorAll('[data-adj]').forEach(btn => btn.addEventListener('click', async () => {
    const product = products.find(p => p.id === btn.dataset.adj);
    const next = Math.max(0, product.stock + parseInt(btn.dataset.delta, 10));
    try {
      await Data.setStock(product.id, next);
      product.stock = next;
      document.getElementById(`qty-${product.id}`).textContent = next;
      document.getElementById(`badge-${product.id}`).innerHTML = stockBadge(next);
    } catch(e){ toast(e.message, 'error'); }
  }));
}

async function renderUsuarios(){
  setTitle('Usuarios y clientes', 'Administración de cuentas del sistema');
  const content = document.getElementById('view-content');
  let allUsers = await Data.getProfiles();
  let filter = '';

  content.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3 id="users-count"></h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <input id="search-user" class="search-input" placeholder="Buscar por nombre o correo...">
          <button class="btn-accent" id="btn-new-user">＋ Nuevo usuario</button>
        </div>
      </div>
      <div class="panel-body" id="users-table-wrap"></div>
    </div>`;

  const draw = () => {
    const q = filter.toLowerCase();
    const users = allUsers.filter(u => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    document.getElementById('users-count').textContent = `Cuentas registradas (${allUsers.length})`;
    const wrap = document.getElementById('users-table-wrap');
    wrap.innerHTML = users.length ? `
      <table>
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th></th></tr></thead>
        <tbody>${users.map(u => `
          <tr>
            <td class="cell-strong">${u.nombre}</td>
            <td class="cell-muted">${u.email}</td>
            <td>
              <select data-role="${u.id}" ${u.id === currentSession.id ? 'disabled' : ''}>
                ${Object.values(ROLES).map(r => `<option value="${r}" ${r===u.rol?'selected':''}>${r}</option>`).join('')}
              </select>
            </td>
            <td class="row-actions">
              ${u.id === currentSession.id ? '<span class="cell-muted">Tú</span>' : `<button class="btn-danger btn-small" data-deluser="${u.id}">Eliminar</button>`}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : `<div class="empty-state"><div class="empty-icon">◍</div><p>No se encontraron usuarios.</p></div>`;

    wrap.querySelectorAll('[data-role]').forEach(sel => sel.addEventListener('change', async () => {
      try { await Data.updateProfileRol(sel.dataset.role, sel.value); toast('Rol actualizado', 'success'); }
      catch (e) { toast(e.message, 'error'); }
      allUsers = await Data.getProfiles(); draw();
    }));
    wrap.querySelectorAll('[data-deluser]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta cuenta del sistema? Esta acción no se puede deshacer.')) return;
      try { await Data.deleteProfile(btn.dataset.deluser); toast('Usuario eliminado', 'success'); allUsers = await Data.getProfiles(); draw(); }
      catch (e) { toast(e.message, 'error'); }
    }));
  };

  document.getElementById('search-user').addEventListener('input', e => { filter = e.target.value; draw(); });
  document.getElementById('btn-new-user').addEventListener('click', () => {
    openModal('Nuevo usuario', `
      <form id="user-form" class="form-grid">
        <label class="full">Nombre completo
          <input name="nombre" required maxlength="80" placeholder="Nombre y apellido">
        </label>
        <label class="full">Correo electrónico
          <input name="email" type="email" required placeholder="usuario@empresa.com">
        </label>
        <label>Contraseña inicial
          <input name="password" type="text" required minlength="6" maxlength="72" placeholder="Mínimo 6 caracteres">
        </label>
        <label>Rol
          <select name="rol">
            <option value="vendedor">Vendedor</option>
            <option value="administrador">Administrador</option>
            <option value="cliente">Cliente</option>
          </select>
        </label>
        <p class="cell-muted full" style="margin:0;font-size:12.5px;">La cuenta queda activa de inmediato. Comparte la contraseña con la persona por un canal seguro y pídele que la cambie.</p>
        <p class="form-error full" id="user-form-error"></p>
        <div class="full modal-footer">
          <button type="button" class="btn-ghost" id="cancel-user">Cancelar</button>
          <button type="submit" class="btn-primary">Crear usuario</button>
        </div>
      </form>`);
    document.getElementById('cancel-user').addEventListener('click', closeModal);
    document.getElementById('user-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const btn = f.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Creando...';
      try {
        await Data.createUser({
          nombre: f.nombre.value.trim(),
          email: f.email.value.trim(),
          password: f.password.value,
          rol: f.rol.value
        });
        toast('Usuario creado', 'success');
        closeModal();
        allUsers = await Data.getProfiles();
        draw();
      } catch (err) {
        document.getElementById('user-form-error').textContent = err.message;
        btn.disabled = false; btn.textContent = 'Crear usuario';
      }
    });
  });

  draw();
}

async function renderReportes(){
  setTitle('Reportes comerciales', 'Panorama de ventas en tiempo real');
  const content = document.getElementById('view-content');
  let r;
  try { r = await Api.get('/reports/summary'); }
  catch (e) { toast(e.message, 'error'); return; }

  const top = r.top || [];
  const maxTop = Math.max(1, ...top.map(t => t.cantidad));

  content.innerHTML = `
    <div class="grid-cards">
      <div class="stat-card"><p class="stat-label">Ingresos totales</p><p class="stat-value">${money(r.ingresos)}</p><p class="stat-sub">${r.pedidos} pedidos registrados</p></div>
      <div class="stat-card"><p class="stat-label">Ticket promedio</p><p class="stat-value">${money(r.ticket_promedio)}</p><p class="stat-sub">Por pedido</p></div>
      <div class="stat-card"><p class="stat-label">Productos vendidos</p><p class="stat-value">${r.unidades}</p><p class="stat-sub">Unidades totales</p></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Productos más vendidos</h3></div>
      <div class="panel-body">
        ${top.length ? top.map(t => `
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;"><span class="cell-strong">${t.nombre}</span><span class="cell-muted">${t.cantidad} und.</span></div>
            <div style="background:var(--bg);border-radius:6px;height:8px;overflow:hidden;">
              <div style="width:${(t.cantidad/maxTop)*100}%;background:var(--accent);height:100%;"></div>
            </div>
          </div>`).join('') : `<div class="empty-state"><p>Aún no hay ventas registradas.</p></div>`}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Historial completo de ventas</h3></div>
      <div class="panel-body">${renderOrdersTable((r.ventas || []).map(mapOrder))}</div>
    </div>`;
}

function renderOrdersTable(orders){
  if (!orders.length) return `<div class="empty-state"><div class="empty-icon">▤</div><p>Sin registros todavía.</p></div>`;
  return `<table>
    <thead><tr><th>Cliente</th><th>Vendedor</th><th>Fecha</th><th>Total</th><th>Estado</th></tr></thead>
    <tbody>${orders.map(o => `
      <tr>
        <td class="cell-strong">${o.clienteNombre}</td>
        <td class="cell-muted">${o.vendedorNombre || '—'}</td>
        <td class="cell-muted">${formatDate(o.fecha)}</td>
        <td>${money(o.total)}</td>
        <td>${estadoBadge(o.estado)}</td>
      </tr>`).join('')}</tbody>
  </table>`;
}

/* =========================================================================
   VISTAS — VENDEDOR
   ========================================================================= */

async function renderNuevoPedido(){
  setTitle('Nuevo pedido', 'Registra una venta verificando disponibilidad de stock');
  const content = document.getElementById('view-content');
  const [clientes, products] = await Promise.all([
    Data.getProfiles().then(list => list.filter(u => u.rol === ROLES.CLIENTE)),
    Data.getProducts()
  ]);

  content.innerHTML = `
    <div class="panel">
      <div class="panel-body">
        <div class="form-grid">
          <label class="full">Cliente
            <select id="sel-cliente">
              <option value="">Selecciona un cliente...</option>
              ${clientes.map(c => `<option value="${c.id}">${c.nombre} — ${c.email}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Productos disponibles</h3><input id="search-pedido" class="search-input" placeholder="Buscar producto..."></div>
      <div class="panel-body product-grid" id="pedido-products"></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Carrito del pedido</h3></div>
      <div class="panel-body">
        <div id="cart-lines"></div>
        <div class="cart-total"><span>Total</span><span id="cart-total-value">${money(0)}</span></div>
        <div class="modal-footer">
          <button class="btn-primary" id="btn-confirm-order">Confirmar venta y generar comprobante</button>
        </div>
      </div>
    </div>`;

  state.cart = [];

  const drawProducts = (filter='') => {
    document.getElementById('pedido-products').innerHTML = products
      .filter(p => p.nombre.toLowerCase().includes(filter.toLowerCase()))
      .map(p => `
        <div class="product-card">
          ${productImg(p)}
          <h4>${p.nombre}</h4>
          <p class="desc">${p.descripcion}</p>
          <div class="price-row"><span class="price">${money(p.precio)}</span>${stockBadge(p.stock)}</div>
          <button class="btn-accent btn-small" data-add="${p.id}" ${p.stock<=0?'disabled':''}>Agregar al pedido</button>
        </div>`).join('');

    document.getElementById('pedido-products').querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => addToCart(b.dataset.add)));
  };

  const drawCart = () => {
    const lines = document.getElementById('cart-lines');
    lines.innerHTML = state.cart.length ? state.cart.map(line => `
      <div class="cart-line">
        <span>${line.nombre}</span>
        <div class="qty-stepper">
          <button data-dec="${line.productId}">−</button>
          <span>${line.cantidad}</span>
          <button data-inc="${line.productId}">+</button>
        </div>
        <span class="cell-strong">${money(line.precioUnit * line.cantidad)}</span>
      </div>`).join('') : `<p class="cell-muted">Aún no agregaste productos.</p>`;
    const total = state.cart.reduce((s,l)=> s + l.precioUnit*l.cantidad, 0);
    document.getElementById('cart-total-value').textContent = money(total);

    lines.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.inc, 1)));
    lines.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.dec, -1)));
  };

  function addToCart(productId){
    const product = products.find(p => p.id === productId);
    const inCart = state.cart.find(l => l.productId === productId);
    const currentQty = inCart ? inCart.cantidad : 0;
    if (currentQty + 1 > product.stock) { toast('No hay suficiente stock disponible', 'error'); return; }
    if (inCart) inCart.cantidad += 1;
    else state.cart.push({ productId, nombre: product.nombre, precioUnit: Number(product.precio), cantidad: 1 });
    drawCart();
  }

  function changeQty(productId, delta){
    const line = state.cart.find(l => l.productId === productId);
    const product = products.find(p => p.id === productId);
    const next = line.cantidad + delta;
    if (next <= 0) { state.cart = state.cart.filter(l => l.productId !== productId); drawCart(); return; }
    if (next > product.stock) { toast('No hay suficiente stock disponible', 'error'); return; }
    line.cantidad = next;
    drawCart();
  }

  document.getElementById('search-pedido').addEventListener('input', e => drawProducts(e.target.value));
  document.getElementById('btn-confirm-order').addEventListener('click', async () => {
    const clienteId = document.getElementById('sel-cliente').value;
    if (!clienteId) { toast('Selecciona un cliente para continuar', 'error'); return; }
    if (!state.cart.length) { toast('Agrega al menos un producto', 'error'); return; }

    const btn = document.getElementById('btn-confirm-order');
    btn.disabled = true; btn.textContent = 'Procesando...';
    try {
      // La verificación final de stock y el descuento de inventario ocurren
      // de forma atómica dentro de la función crear_pedido() en Supabase.
      const orderId = await Data.crearPedido(clienteId, state.cart);
      const cliente = clientes.find(c => c.id === clienteId);
      const total = state.cart.reduce((s,l)=> s + l.precioUnit*l.cantidad, 0);
      showReceipt({ id: orderId, clienteNombre: cliente.nombre, vendedorNombre: currentSession.nombre, fecha: new Date().toISOString(), items: state.cart, total });
      state.cart = [];
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Confirmar venta y generar comprobante';
    }
  });

  drawProducts();
  drawCart();
}

function showReceipt(order){
  openModal('Comprobante de venta', `
    <div class="receipt">
      <div class="r-row"><strong>NEXO · Comprobante</strong><span>#${order.id.slice(0,8).toUpperCase()}</span></div>
      <div class="r-row"><span>Fecha</span><span>${formatDate(order.fecha)}</span></div>
      <div class="r-row"><span>Cliente</span><span>${order.clienteNombre}</span></div>
      <div class="r-row"><span>Atendido por</span><span>${order.vendedorNombre}</span></div>
      <hr>
      ${order.items.map(it => `<div class="r-row"><span>${it.cantidad} × ${it.nombre}</span><span>${money(it.precioUnit*it.cantidad)}</span></div>`).join('')}
      <hr>
      <div class="r-row"><strong>TOTAL</strong><strong>${money(order.total)}</strong></div>
    </div>
    <div class="modal-footer"><button class="btn-primary" id="btn-close-receipt">Listo</button></div>`);
  document.getElementById('btn-close-receipt').addEventListener('click', () => { closeModal(); goTo('mis-ventas'); });
}

async function renderMisVentas(){
  setTitle('Mis ventas', 'Pedidos que has registrado');
  const content = document.getElementById('view-content');
  const orders = await Data.getOrdersByVendedor(currentSession.id);
  content.innerHTML = `<div class="panel"><div class="panel-body">${renderOrdersTable(orders)}</div></div>`;
}

async function renderHistorialClientes(){
  setTitle('Historial de clientes', 'Consulta las compras previas antes de atender');
  const content = document.getElementById('view-content');
  const clientes = (await Data.getProfiles()).filter(u => u.rol === ROLES.CLIENTE);
  content.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Selecciona un cliente</h3>
        <select id="sel-hist-cliente">
          <option value="">Elige un cliente...</option>
          ${clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="panel-body" id="hist-cliente-body"><div class="empty-state"><p>Selecciona un cliente para ver su historial.</p></div></div>
    </div>`;
  document.getElementById('sel-hist-cliente').addEventListener('change', async e => {
    if (!e.target.value) return;
    document.getElementById('hist-cliente-body').innerHTML = loading();
    const orders = await Data.getOrdersByCliente(e.target.value);
    document.getElementById('hist-cliente-body').innerHTML = renderOrdersTable(orders);
  });
}

/* =========================================================================
   VISTAS — CLIENTE
   ========================================================================= */

async function renderCatalogoCliente(){
  setTitle('Catálogo de productos', 'Explora lo que tenemos disponible');
  const content = document.getElementById('view-content');
  const allProducts = await Data.getProducts();

  const draw = (filter='') => {
    const items = allProducts.filter(p => p.nombre.toLowerCase().includes(filter.toLowerCase()));
    content.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Productos</h3><input id="search-cat" class="search-input" placeholder="Buscar producto..." value="${filter}"></div>
        <div class="panel-body product-grid">
          ${items.map(p => `
            <div class="product-card">
              ${productImg(p)}
              <h4>${p.nombre}</h4>
              <p class="desc">${p.descripcion}</p>
              <div class="price-row"><span class="price">${money(p.precio)}</span>${stockBadge(p.stock)}</div>
            </div>`).join('')}
        </div>
      </div>`;
    document.getElementById('search-cat').addEventListener('input', e => draw(e.target.value));
  };
  draw();
}

async function renderMisPedidos(){
  setTitle('Mis pedidos', 'Historial y estado de tus compras');
  const content = document.getElementById('view-content');
  const orders = await Data.getOrdersByCliente(currentSession.id);
  content.innerHTML = `
    <div class="panel">
      <div class="panel-body">
        ${orders.length ? orders.map(o => `
          <div class="panel" style="box-shadow:none;margin-bottom:14px;">
            <div class="panel-head">
              <h3>Pedido #${o.id.slice(0,8).toUpperCase()}</h3>
              ${estadoBadge(o.estado)}
            </div>
            <div class="panel-body">
              <p class="cell-muted" style="margin:0 0 10px;">${formatDate(o.fecha)} · Atendido por ${o.vendedorNombre || 'autogestión'}</p>
              ${o.items.map(it => `<div class="cart-line"><span>${it.cantidad} × ${it.nombre}</span><span>${money(it.precioUnit*it.cantidad)}</span></div>`).join('')}
              <div class="cart-total"><span>Total</span><span>${money(o.total)}</span></div>
            </div>
          </div>`).join('') : `<div class="empty-state"><div class="empty-icon">▤</div><p>Todavía no realizaste ningún pedido.</p></div>`}
      </div>
    </div>`;
}

async function renderPerfil(){
  setTitle('Mi perfil', 'Información de tu cuenta');
  const content = document.getElementById('view-content');
  const orders = await Data.getOrdersByCliente(currentSession.id);
  content.innerHTML = `
    <div class="panel">
      <div class="panel-body form-grid">
        <label>Nombre<input value="${currentSession.nombre}" disabled></label>
        <label>Correo<input value="${currentSession.email}" disabled></label>
        <label>Rol<input value="${currentSession.rol}" disabled></label>
        <label>Pedidos realizados<input value="${orders.length}" disabled></label>
      </div>
    </div>`;
}

/* =========================================================================
   EVENTOS GLOBALES — AUTENTICACIÓN
   ========================================================================= */

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('login-form').classList.toggle('hidden', tab.dataset.tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', tab.dataset.tab !== 'register');
  });
});

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Ingresando...';
  const result = await Auth.loginPassword(email, password);
  btn.disabled = false; btn.textContent = 'Ingresar';
  if (!result.ok) { errorEl.textContent = result.error; return; }
  errorEl.textContent = '';
  // onAuthStateChange se encarga de cargar el perfil y renderizar la app.
});

document.getElementById('register-form').addEventListener('submit', async e => {
  e.preventDefault();
  const nombre = document.getElementById('reg-nombre').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errorEl = document.getElementById('register-error');
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Creando cuenta...';
  const result = await Auth.register(nombre, email, password);
  btn.disabled = false; btn.textContent = 'Crear cuenta de cliente';
  if (!result.ok) { errorEl.textContent = result.error; return; }
  errorEl.textContent = '';
  e.target.reset();
  toast('Cuenta creada. Ya puedes iniciar sesión (revisa tu correo si te pedimos confirmarlo).', 'success');
  document.querySelector('.auth-tab[data-tab="login"]').click();
});

document.getElementById('google-login-btn').addEventListener('click', () => Auth.loginGoogle());

document.getElementById('logout-btn').addEventListener('click', async () => {
  await Auth.logout();
  state = { view:null, cart:[] };
});

/* ================================== INICIO ================================== */
/* onAuthStateChange (arriba) dispara el primer render en cuanto Supabase
   resuelve la sesión existente (o confirma que no hay ninguna). */

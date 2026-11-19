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

/* Iconos de línea (SVG) para el menú y los estados vacíos */
const svgIcon = d => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  panel:    svgIcon('<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 8h6V4h-6z"/>'),
  box:      svgIcon('<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9"/>'),
  layers:   svgIcon('<path d="m12 3 9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5"/>'),
  users:    svgIcon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.7 2.8 2.3 3 5"/>'),
  chart:    svgIcon('<path d="M4 4v16h16M8 16v-5M12 16V8M16 16v-3"/>'),
  plus:     svgIcon('<path d="M12 5v14M5 12h14"/>'),
  receipt:  svgIcon('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>'),
  user:     svgIcon('<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>'),
};

function money(n){ return 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
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
    { id:'dashboard',  label:'Panel general',        icon:ICON.panel },
    { id:'catalogo',   label:'Catálogo de productos', icon:ICON.box },
    { id:'inventario', label:'Stock e inventario',    icon:ICON.layers },
    { id:'usuarios',   label:'Usuarios y clientes',   icon:ICON.users },
    { id:'reportes',   label:'Reportes comerciales',  icon:ICON.chart },
    { id:'perfil',     label:'Mi perfil',             icon:ICON.user },
  ],
  [ROLES.VENDEDOR]: [
    // Sin "Panel general": ese módulo es exclusivo del administrador.
    { id:'nuevo-pedido', label:'Nuevo pedido',        icon:ICON.plus },
    { id:'mis-ventas', label:'Mis ventas',            icon:ICON.receipt },
    { id:'clientes',   label:'Historial de clientes', icon:ICON.users },
    { id:'perfil',     label:'Mi perfil',             icon:ICON.user },
  ],
  [ROLES.CLIENTE]: [
    { id:'catalogo-cliente', label:'Catálogo',        icon:ICON.box },
    { id:'mis-pedidos',      label:'Mis pedidos',     icon:ICON.receipt },
    { id:'perfil',           label:'Mi perfil',       icon:ICON.user },
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
  updateOrder(id, clienteId, items){
    return Api.put('/orders/' + id, {
      cliente_id: clienteId,
      items: items.map(i => ({ product_id: i.productId, cantidad: i.cantidad }))
    });
  },
  deleteOrder(id){ return Api.del('/orders/' + id); },
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
    // Sirve para iniciar sesión y para crear la cuenta: el trigger de la base de
    // datos asigna el rol "cliente" a toda cuenta nueva creada con este proveedor.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) toast(traducirErrorAuth(error.message), 'error');
  },

  async logout(){
    await supabase.auth.signOut();
  }
};

function traducirErrorAuth(msg){
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos. Revisa tus datos e inténtalo otra vez.';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('ya existe') || m.includes('duplicate'))
    return 'Ya existe una cuenta con ese correo. Inicia sesión o usa otro correo.';
  if (m.includes('password should be at least') || m.includes('contraseña debe'))
    return 'La contraseña es muy corta: necesita al menos 6 caracteres.';
  if (m.includes('email not confirmed')) return 'Falta confirmar tu correo. Revisa tu bandeja de entrada y abre el enlace que te enviamos.';
  if (m.includes('different from the old password') || m.includes('same password')) return 'La nueva contraseña debe ser distinta a la actual.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'El correo no es válido. Revisa que esté bien escrito.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'No se pudo conectar. Revisa tu conexión a internet.';
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
      <div class="empty-state"><div class="empty-icon">${ICON.box}</div><p>No tienes permisos para ver esta sección.</p></div>`;
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
  return `<span class="badge ${map[estado]||'badge-neutral'}">${estado.charAt(0).toUpperCase() + estado.slice(1)}</span>`;
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
      </table>` : `<div class="empty-state"><div class="empty-icon">${ICON.box}</div><p>No se encontraron productos.</p></div>`;

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
      </table>` : `<div class="empty-state"><div class="empty-icon">${ICON.box}</div><p>No se encontraron usuarios.</p></div>`;

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

function renderOrdersTable(orders, opts = {}){
  if (!orders.length) return `<div class="empty-state"><div class="empty-icon">${ICON.box}</div><p>Sin registros todavía.</p></div>`;
  return `<table>
    <thead><tr><th>Cliente</th><th>Vendedor</th><th>Fecha</th><th>Total</th><th>Estado</th>${opts.actions ? '<th></th>' : ''}</tr></thead>
    <tbody>${orders.map(o => `
      <tr>
        <td class="cell-strong">${o.clienteNombre}</td>
        <td class="cell-muted">${o.vendedorNombre || '—'}</td>
        <td class="cell-muted">${formatDate(o.fecha)}</td>
        <td>${money(o.total)}</td>
        <td>${estadoBadge(o.estado)}</td>
        ${opts.actions ? `<td class="row-actions">
          <button class="btn-ghost btn-small" data-edit-order="${o.id}">Editar</button>
          <button class="btn-danger btn-small" data-del-order="${o.id}">Eliminar</button>
        </td>` : ''}
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
  setTitle('Mis ventas', 'Pedidos que has registrado. Si te equivocaste, puedes corregirlos o eliminarlos.');
  const content = document.getElementById('view-content');
  const orders = await Data.getOrdersByVendedor(currentSession.id);
  content.innerHTML = `<div class="panel"><div class="panel-body">${renderOrdersTable(orders, { actions: true })}</div></div>`;

  content.querySelectorAll('[data-edit-order]').forEach(b => b.addEventListener('click', () => {
    openEditOrder(orders.find(o => o.id === b.dataset.editOrder));
  }));
  content.querySelectorAll('[data-del-order]').forEach(b => b.addEventListener('click', () => {
    confirmDeleteOrder(orders.find(o => o.id === b.dataset.delOrder));
  }));
}

function confirmDeleteOrder(order){
  openModal('Eliminar venta', `
    <p>Vas a eliminar la venta de <strong>${order.clienteNombre}</strong> por <strong>${money(order.total)}</strong>.</p>
    <p class="cell-muted">Los productos de esta venta volverán al inventario. Esta acción no se puede deshacer.</p>
    <div class="modal-footer">
      <button class="btn-ghost" id="btn-del-cancel">Cancelar</button>
      <button class="btn-primary" id="btn-del-confirm">Eliminar venta</button>
    </div>`);
  document.getElementById('btn-del-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-del-confirm').addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Eliminando...';
    try {
      await Data.deleteOrder(order.id);
      closeModal();
      toast('Venta eliminada. El stock fue devuelto al inventario.', 'success');
      renderMisVentas();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Eliminar venta';
      toast(err.message, 'error');
    }
  });
}

async function openEditOrder(order){
  if (order.items.some(i => !i.productId)) {
    toast('Esta venta incluye un producto que ya no existe y no se puede editar. Puedes eliminarla.', 'error');
    return;
  }
  const [clientes, products] = await Promise.all([
    Data.getProfiles().then(list => list.filter(u => u.rol === ROLES.CLIENTE)),
    Data.getProducts()
  ]);

  // Lo que ya estaba en la venta vuelve al inventario al guardar, por eso cuenta como disponible.
  const original = {};
  order.items.forEach(i => { original[i.productId] = i.cantidad; });
  const available = id => {
    const p = products.find(x => x.id === id);
    return (p ? p.stock : 0) + (original[id] || 0);
  };
  let lines = order.items.map(i => ({ productId: i.productId, nombre: i.nombre, precioUnit: Number(i.precioUnit), cantidad: i.cantidad }));

  openModal('Editar venta', `
    <div class="form-grid">
      <label class="full">Cliente
        <select id="edit-cliente">
          ${clientes.map(c => `<option value="${c.id}" ${c.id === order.clienteId ? 'selected' : ''}>${c.nombre} — ${c.email}</option>`).join('')}
        </select>
      </label>
      <label class="full">Agregar producto
        <select id="edit-add"></select>
      </label>
    </div>
    <div id="edit-lines" style="margin-top:14px;"></div>
    <div class="cart-total"><span>Total</span><span id="edit-total">${money(0)}</span></div>
    <div class="modal-footer">
      <button class="btn-ghost" id="btn-edit-cancel">Cancelar</button>
      <button class="btn-primary" id="btn-edit-save">Guardar cambios</button>
    </div>`);

  const draw = () => {
    const addSel = document.getElementById('edit-add');
    const addable = products.filter(p => !lines.some(l => l.productId === p.id) && available(p.id) > 0);
    addSel.innerHTML = `<option value="">Selecciona un producto...</option>` +
      addable.map(p => `<option value="${p.id}">${p.nombre} — ${money(p.precio)} (${available(p.id)} disp.)</option>`).join('');

    document.getElementById('edit-lines').innerHTML = lines.length ? lines.map(l => `
      <div class="cart-line">
        <span>${l.nombre}</span>
        <div class="qty-stepper">
          <button type="button" data-dec="${l.productId}" aria-label="Quitar uno">−</button>
          <span>${l.cantidad}</span>
          <button type="button" data-inc="${l.productId}" aria-label="Agregar uno">+</button>
        </div>
        <span class="cell-strong">${money(l.precioUnit * l.cantidad)}</span>
      </div>`).join('') : `<p class="cell-muted">La venta no tiene productos. Agrega al menos uno.</p>`;
    document.getElementById('edit-total').textContent = money(lines.reduce((s, l) => s + l.precioUnit * l.cantidad, 0));

    document.querySelectorAll('#edit-lines [data-inc]').forEach(b => b.addEventListener('click', () => {
      const l = lines.find(x => x.productId === b.dataset.inc);
      if (l.cantidad + 1 > available(l.productId)) { toast('No hay suficiente stock disponible', 'error'); return; }
      l.cantidad += 1; draw();
    }));
    document.querySelectorAll('#edit-lines [data-dec]').forEach(b => b.addEventListener('click', () => {
      const l = lines.find(x => x.productId === b.dataset.dec);
      l.cantidad -= 1;
      if (l.cantidad <= 0) lines = lines.filter(x => x !== l);
      draw();
    }));
    addSel.addEventListener('change', () => {
      const p = products.find(x => x.id === addSel.value);
      if (!p) return;
      lines.push({ productId: p.id, nombre: p.nombre, precioUnit: Number(p.precio), cantidad: 1 });
      draw();
    });
  };
  draw();

  document.getElementById('btn-edit-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-edit-save').addEventListener('click', async e => {
    if (!lines.length) { toast('Agrega al menos un producto', 'error'); return; }
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
      await Data.updateOrder(order.id, document.getElementById('edit-cliente').value, lines);
      closeModal();
      toast('Venta actualizada', 'success');
      renderMisVentas();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Guardar cambios';
      toast(err.message, 'error');
    }
  });
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
          </div>`).join('') : `<div class="empty-state"><div class="empty-icon">${ICON.box}</div><p>Todavía no realizaste ningún pedido.</p></div>`}
      </div>
    </div>`;
}

function refreshSidebarUser(){
  document.getElementById('user-avatar').textContent = currentSession.nombre.charAt(0).toUpperCase();
  document.getElementById('user-name').textContent = currentSession.nombre;
}

async function renderPerfil(){
  setTitle('Mi perfil', 'Consulta y actualiza tus datos');
  const content = document.getElementById('view-content');
  const esCliente = currentSession.rol === ROLES.CLIENTE;
  const orders = esCliente ? await Data.getOrdersByCliente(currentSession.id) : [];
  const { data: sessionData } = await supabase.auth.getSession();
  const provider = sessionData.session?.user?.app_metadata?.provider || 'email';
  const escapeAttr = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  content.innerHTML = `
    <div class="profile-grid">
      <div class="panel">
        <div class="panel-head"><h3>Datos personales</h3></div>
        <div class="panel-body">
          <form id="profile-form" class="profile-form" novalidate>
            <div class="field">
              <label for="pf-nombre">Nombre completo</label>
              <input id="pf-nombre" maxlength="80" autocomplete="name" value="${escapeAttr(currentSession.nombre)}">
              <p class="field-msg" id="pf-nombre-msg" role="alert"></p>
            </div>
            <div class="field">
              <label for="pf-email">Correo electrónico</label>
              <input id="pf-email" value="${escapeAttr(currentSession.email)}" disabled>
              <p class="field-msg" data-state="hint">El correo no se puede cambiar desde aquí.</p>
            </div>
            ${esCliente ? `
            <div class="field">
              <label for="pf-pedidos">Pedidos realizados</label>
              <input id="pf-pedidos" value="${orders.length}" disabled>
            </div>` : ''}
            <div class="form-actions">
              <button type="submit" class="btn-primary">Guardar cambios</button>
            </div>
          </form>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Contraseña</h3></div>
        <div class="panel-body">
          ${provider === 'email' ? `
          <form id="password-form" class="profile-form" novalidate>
            <div class="field">
              <label for="pw-new">Nueva contraseña</label>
              <input id="pw-new" type="password" autocomplete="new-password" maxlength="72" placeholder="Mínimo 6 caracteres">
              <p class="field-msg" id="pw-new-msg" role="alert"></p>
            </div>
            <div class="field">
              <label for="pw-new2">Repite la nueva contraseña</label>
              <input id="pw-new2" type="password" autocomplete="new-password" maxlength="72">
              <p class="field-msg" id="pw-new2-msg" role="alert"></p>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-primary">Cambiar contraseña</button>
            </div>
          </form>` : `
          <p class="profile-note">Iniciaste sesión con Google, por eso tu contraseña se administra desde tu cuenta de Google.</p>`}
        </div>
      </div>
    </div>`;

  const setMsg = (inputId, text) => {
    const input = document.getElementById(inputId), msg = document.getElementById(inputId + '-msg');
    msg.textContent = text; msg.dataset.state = text ? 'error' : '';
    input.setAttribute('aria-invalid', text ? 'true' : 'false');
    return !text;
  };

  document.getElementById('profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const nombre = document.getElementById('pf-nombre').value.trim().replace(/\s+/g, ' ');
    const err = !nombre ? 'Escribe tu nombre completo.' : (nombre.length < 3 ? 'El nombre es muy corto: escribe al menos 3 letras.' : '');
    if (!setMsg('pf-nombre', err)) { document.getElementById('pf-nombre').focus(); return; }
    if (nombre === currentSession.nombre) { toast('No hay cambios para guardar.'); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    // Cada usuario puede actualizar solo su propio perfil (política RLS de Supabase);
    // el rol está protegido por un trigger y no se puede modificar desde aquí.
    const { data, error } = await supabase.from('profiles').update({ nombre }).eq('id', currentSession.id).select('id');
    btn.disabled = false; btn.textContent = 'Guardar cambios';
    if (error || !data || !data.length) {
      toast('No se pudo guardar el cambio. Inténtalo de nuevo.', 'error');
      return;
    }
    supabase.auth.updateUser({ data: { nombre } }).catch(() => {});
    currentSession.nombre = nombre;
    refreshSidebarUser();
    toast('Perfil actualizado', 'success');
  });

  const pwForm = document.getElementById('password-form');
  if (pwForm) {
    pwForm.addEventListener('submit', async e => {
      e.preventDefault();
      const p1 = document.getElementById('pw-new').value;
      const p2 = document.getElementById('pw-new2').value;
      let e1 = '';
      if (!p1) e1 = 'Escribe la nueva contraseña.';
      else if (p1.length < MIN_PASSWORD) {
        const f = MIN_PASSWORD - p1.length;
        e1 = `Te ${plural(f, 'falta', 'faltan')} ${f} ${plural(f, 'carácter', 'caracteres')} (mínimo ${MIN_PASSWORD}).`;
      }
      const e2 = !p2 ? 'Repite la nueva contraseña.' : (p1 !== p2 ? 'Las contraseñas no coinciden.' : '');
      const ok1 = setMsg('pw-new', e1), ok2 = setMsg('pw-new2', e1 ? '' : e2);
      if (!ok1) { document.getElementById('pw-new').focus(); return; }
      if (!ok2) { document.getElementById('pw-new2').focus(); return; }

      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Cambiando...';
      const { error } = await supabase.auth.updateUser({ password: p1 });
      btn.disabled = false; btn.textContent = 'Cambiar contraseña';
      if (error) { setMsg('pw-new', traducirErrorAuth(error.message)); return; }
      e.target.reset();
      toast('Contraseña actualizada', 'success');
    });
  }
}

/* =========================================================================
   AUTENTICACIÓN — validación de formularios y eventos
   Los mensajes se muestran debajo de cada campo: al salir del campo, al
   escribir (una vez tocado) y al enviar el formulario.
   ========================================================================= */

const MIN_PASSWORD = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const $ = id => document.getElementById(id);
const plural = (n, uno, varios) => (n === 1 ? uno : varios);

function passwordStrength(v){
  let score = 0;
  if (v.length >= 8) score++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
  if (/\d/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  if (v.length < MIN_PASSWORD) return 0;
  return score <= 1 ? 1 : (score === 2 ? 2 : 3);
}

const Check = {
  email(v){
    v = v.trim();
    if (!v) return { state:'error', text:'Escribe tu correo electrónico.' };
    if (!v.includes('@')) return { state:'error', text:'Al correo le falta el @. Ejemplo: nombre@correo.com' };
    if (!EMAIL_RE.test(v)) return { state:'error', text:'Al correo le falta el dominio. Ejemplo: nombre@correo.com' };
    return { state:'ok' };
  },
  nombre(v){
    v = v.trim().replace(/\s+/g, ' ');
    if (!v) return { state:'error', text:'Escribe tu nombre completo.' };
    if (v.length < 3) return { state:'error', text:'El nombre es muy corto: escribe al menos 3 letras.' };
    return { state:'ok' };
  },
  passwordLogin(v){
    if (!v) return { state:'error', text:'Escribe tu contraseña.' };
    if (v.length < MIN_PASSWORD) {
      return { state:'error', text:`La contraseña es muy corta: tiene ${v.length} ${plural(v.length, 'carácter', 'caracteres')} y necesita al menos ${MIN_PASSWORD}.` };
    }
    return { state:'ok' };
  },
  passwordNew(v){
    if (!v) return { state:'error', text:`Crea una contraseña de al menos ${MIN_PASSWORD} caracteres.` };
    if (v.length < MIN_PASSWORD) {
      const f = MIN_PASSWORD - v.length;
      return { state:'short', text:`Te ${plural(f, 'falta', 'faltan')} ${f} ${plural(f, 'carácter', 'caracteres')} (mínimo ${MIN_PASSWORD}).` };
    }
    const lvl = ['', 'básica', 'media', 'fuerte'][passwordStrength(v)];
    return { state:'ok', text:`Contraseña válida. Seguridad ${lvl}.` };
  },
  confirm(v){
    if (!v) return { state:'error', text:'Repite tu contraseña.' };
    if (v !== $('reg-password').value) return { state:'error', text:'Las contraseñas no coinciden.' };
    return { state:'ok', text:'Las contraseñas coinciden.' };
  }
};

const LOGIN_FIELDS = [
  { input:'login-email',    msg:'login-email-msg',    check:Check.email },
  { input:'login-password', msg:'login-password-msg', check:Check.passwordLogin },
];
const REGISTER_FIELDS = [
  { input:'reg-nombre',    msg:'reg-nombre-msg',    check:Check.nombre },
  { input:'reg-email',     msg:'reg-email-msg',     check:Check.email },
  { input:'reg-password',  msg:'reg-password-msg',  check:Check.passwordNew, hint:`Usa al menos ${MIN_PASSWORD} caracteres.`, meter:'reg-meter' },
  { input:'reg-password2', msg:'reg-password2-msg', check:Check.confirm },
];
const ALL_FIELDS = [...LOGIN_FIELDS, ...REGISTER_FIELDS];
const touched = new Set();

/* Pinta el mensaje de un campo. Devuelve true si el valor es válido. */
function paintField(f, force = false){
  const input = $(f.input), msg = $(f.msg);
  const res = f.check(input.value);
  const show = force || touched.has(f.input);
  let state = '', text = f.hint || '';

  if (res.state === 'short') {
    // Mientras escribe muestra cuántos caracteres faltan; en rojo al salir del campo.
    text = res.text; state = show ? 'error' : 'hint';
  } else if (res.state === 'error') {
    if (show) { text = res.text; state = 'error'; }
  } else if (res.state === 'ok' && res.text && input.value) {
    text = res.text; state = 'ok';
  }

  msg.textContent = text;
  msg.dataset.state = state;
  input.setAttribute('aria-invalid', state === 'error' ? 'true' : 'false');
  if (f.meter) $(f.meter).dataset.level = String(passwordStrength(input.value));
  return res.state === 'ok';
}

/* Valida todos los campos de un formulario; enfoca el primero con error. */
function validateForm(fields){
  let firstBad = null;
  fields.forEach(f => {
    touched.add(f.input);
    if (!paintField(f, true) && !firstBad) firstBad = f.input;
  });
  if (firstBad) $(firstBad).focus();
  return !firstBad;
}

ALL_FIELDS.forEach(f => {
  const input = $(f.input);
  paintField(f);
  input.addEventListener('input', () => {
    paintField(f);
    if (f.input === 'reg-password' && touched.has('reg-password2')) paintField(REGISTER_FIELDS[3]);
    $('login-error').textContent = ''; $('register-error').textContent = '';
  });
  input.addEventListener('blur', () => { touched.add(f.input); paintField(f); });
});

/* Mostrar / ocultar contraseña */
document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.toggle);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Ocultar' : 'Mostrar';
    btn.setAttribute('aria-pressed', String(show));
  });
});

/* Cambio entre "Iniciar sesión" y "Crear cuenta" */
function showAuthTab(name){
  document.querySelectorAll('.auth-tab').forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });
  $('login-form').classList.toggle('hidden', name !== 'login');
  $('register-form').classList.toggle('hidden', name !== 'register');
  $('login-error').textContent = ''; $('register-error').textContent = '';
}
document.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => showAuthTab(tab.dataset.tab)));
document.querySelectorAll('[data-switch]').forEach(btn => btn.addEventListener('click', () => {
  showAuthTab(btn.dataset.switch);
  $(btn.dataset.switch === 'login' ? 'login-email' : 'reg-nombre').focus();
}));

/* Iniciar sesión */
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errorEl = $('login-error');
  errorEl.textContent = '';
  if (!validateForm(LOGIN_FIELDS)) return;

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Ingresando...';
  const result = await Auth.loginPassword($('login-email').value.trim(), $('login-password').value);
  btn.disabled = false; btn.textContent = 'Iniciar sesión';
  if (!result.ok) { errorEl.textContent = result.error; return; }
  // onAuthStateChange se encarga de cargar el perfil y mostrar la aplicación.
});

/* Crear cuenta */
$('register-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errorEl = $('register-error');
  errorEl.textContent = '';
  if (!validateForm(REGISTER_FIELDS)) return;

  const nombre = $('reg-nombre').value.trim().replace(/\s+/g, ' ');
  const email = $('reg-email').value.trim();
  const password = $('reg-password').value;

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Creando cuenta...';
  const result = await Auth.register(nombre, email, password);
  if (!result.ok) {
    btn.disabled = false; btn.textContent = 'Crear cuenta';
    errorEl.textContent = traducirErrorAuth(result.error);
    return;
  }

  // Cuenta creada: se inicia sesión automáticamente.
  const login = await Auth.loginPassword(email, password);
  btn.disabled = false; btn.textContent = 'Crear cuenta';
  if (!login.ok) {
    // Por ejemplo, si el proyecto exige confirmar el correo antes de entrar.
    e.target.reset();
    ALL_FIELDS.forEach(f => { touched.delete(f.input); paintField(f); });
    showAuthTab('login');
    $('login-email').value = email;
    paintField(LOGIN_FIELDS[0]);
    $('login-password').focus();
    toast('Cuenta creada. Inicia sesión para continuar.', 'success');
  }
});

/* Google: sirve para iniciar sesión y para crear la cuenta */
['google-login-btn', 'google-register-btn'].forEach(id => {
  const btn = $(id);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await Auth.loginGoogle();       // redirige a Google; si falla, muestra el aviso
    setTimeout(() => { btn.disabled = false; }, 1500);
  });
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await Auth.logout();
  state = { view:null, cart:[] };
});

/* ================================== INICIO ================================== */
/* onAuthStateChange (arriba) dispara el primer render en cuanto Supabase
   resuelve la sesión existente (o confirma que no hay ninguna). */

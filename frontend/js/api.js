/* =========================================================================
   NEXO · Capa de comunicación
   - supabase: SOLO para autenticación (correo/contraseña, Google, sesión).
   - Api:      todas las operaciones de negocio pasan por el backend PHP,
               enviando el token de sesión en la cabecera Authorization.
   ========================================================================= */

const supabase = window.supabase.createClient(
  NEXO_CONFIG.SUPABASE_URL,
  NEXO_CONFIG.SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

const Api = {
  /**
   * tokenOverride: undefined -> usa la sesión actual; null -> sin autenticación;
   * string -> usa ese token (necesario dentro de onAuthStateChange).
   */
  async request(method, path, body, tokenOverride) {
    let token = tokenOverride;
    if (token === undefined) {
      const { data } = await supabase.auth.getSession();
      token = data.session ? data.session.access_token : null;
    }

    const headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch(NEXO_CONFIG.API_BASE_URL + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (_) {
      throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté en ejecución.');
    }

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && token) supabase.auth.signOut();
      throw new Error((payload && payload.error) || ('Error ' + res.status));
    }
    return payload ? payload.data : null;
  },

  get:   (path, token)       => Api.request('GET', path, undefined, token),
  post:  (path, body, token) => Api.request('POST', path, body, token),
  put:   (path, body, token) => Api.request('PUT', path, body, token),
  patch: (path, body, token) => Api.request('PATCH', path, body, token),
  del:   (path, token)       => Api.request('DELETE', path, undefined, token),
};

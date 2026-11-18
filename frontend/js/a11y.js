/* =========================================================================
   NEXO · Panel de accesibilidad
   Disponible en todas las pantallas (acceso y aplicación) para cualquier
   usuario. Las preferencias se guardan en este navegador.
   ========================================================================= */
(function () {
  const KEY = 'nexo_a11y';
  const SIZES = [100, 115, 130, 150];
  const DEFAULTS = { size: 100, cb: 'none', contrast: false, cursor: false, legible: false, motion: false };
  let st = Object.assign({}, DEFAULTS);

  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  if (!SIZES.includes(st.size)) st.size = 100;

  const root = document.documentElement;
  function setAttr(name, on, value) {
    if (on) root.setAttribute(name, value); else root.removeAttribute(name);
  }
  function apply() {
    root.style.setProperty('--zoom', String(st.size / 100));
    setAttr('data-cb', st.cb !== 'none', st.cb);
    setAttr('data-contrast', st.contrast, 'high');
    setAttr('data-cursor', st.cursor, 'big');
    setAttr('data-font', st.legible, 'legible');
    setAttr('data-motion', st.motion, 'reduce');
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} }
  apply(); // se aplica antes de pintar para evitar parpadeos

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'a11y-btn';
    btn.id = 'a11y-btn';
    btn.setAttribute('aria-label', 'Opciones de accesibilidad');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = 'Accesibilidad';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4.5" r="1.8" fill="currentColor"/><path d="M4.5 8.5l7.5 1.5 7.5-1.5M12 10v4.5M12 14.5l-3 6M12 14.5l3 6"/></svg>';

    const panel = document.createElement('div');
    panel.className = 'a11y-panel hidden';
    panel.id = 'a11y-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'a11y-title');
    panel.innerHTML = `
      <div class="a11y-head">
        <h2 id="a11y-title">Accesibilidad</h2>
        <button type="button" class="a11y-close" id="a11y-close" aria-label="Cerrar">&times;</button>
      </div>
      <div class="a11y-body">
        <fieldset class="a11y-group">
          <legend>Tamaño del texto</legend>
          <div class="a11y-size">
            <button type="button" id="a11y-smaller" aria-label="Reducir texto">A−</button>
            <output id="a11y-size-out" aria-live="polite"></output>
            <button type="button" id="a11y-bigger" aria-label="Aumentar texto">A+</button>
          </div>
        </fieldset>

        <fieldset class="a11y-group">
          <legend>Colores</legend>
          <label class="a11y-opt"><input type="radio" name="a11y-cb" value="none"><span>Colores normales</span></label>
          <label class="a11y-opt"><input type="radio" name="a11y-cb" value="rg"><span>Daltonismo rojo-verde<small>Azul y naranja, con símbolos en los estados</small></span></label>
          <label class="a11y-opt"><input type="radio" name="a11y-cb" value="by"><span>Daltonismo azul-amarillo<small>Rosa y naranja, con símbolos en los estados</small></span></label>
        </fieldset>

        <fieldset class="a11y-group">
          <legend>Lectura y uso</legend>
          <label class="a11y-opt"><input type="checkbox" id="a11y-contrast"><span>Alto contraste</span></label>
          <label class="a11y-opt"><input type="checkbox" id="a11y-cursor"><span>Cursor grande</span></label>
          <label class="a11y-opt"><input type="checkbox" id="a11y-legible"><span>Fuente fácil de leer<small>Letra más clara y con más espacio</small></span></label>
          <label class="a11y-opt"><input type="checkbox" id="a11y-motion"><span>Reducir animaciones</span></label>
        </fieldset>

        <button type="button" class="btn-ghost a11y-reset" id="a11y-reset">Restablecer todo</button>
      </div>`;

    document.body.appendChild(btn);
    document.body.appendChild(panel);
    const $ = id => panel.querySelector('#' + id);

    function sync() {
      $('a11y-size-out').textContent = st.size + '%';
      $('a11y-smaller').disabled = st.size === SIZES[0];
      $('a11y-bigger').disabled = st.size === SIZES[SIZES.length - 1];
      panel.querySelectorAll('input[name="a11y-cb"]').forEach(r => { r.checked = r.value === st.cb; });
      $('a11y-contrast').checked = st.contrast;
      $('a11y-cursor').checked = st.cursor;
      $('a11y-legible').checked = st.legible;
      $('a11y-motion').checked = st.motion;
    }
    function change(patch) { Object.assign(st, patch); apply(); save(); sync(); }

    function open() {
      panel.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
      $('a11y-close').focus();
    }
    function close(returnFocus = true) {
      panel.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
      if (returnFocus) btn.focus();
    }

    btn.addEventListener('click', () => (panel.classList.contains('hidden') ? open() : close()));
    $('a11y-close').addEventListener('click', () => close());
    $('a11y-smaller').addEventListener('click', () => change({ size: SIZES[Math.max(0, SIZES.indexOf(st.size) - 1)] }));
    $('a11y-bigger').addEventListener('click', () => change({ size: SIZES[Math.min(SIZES.length - 1, SIZES.indexOf(st.size) + 1)] }));
    panel.querySelectorAll('input[name="a11y-cb"]').forEach(r => r.addEventListener('change', () => change({ cb: r.value })));
    $('a11y-contrast').addEventListener('change', e => change({ contrast: e.target.checked }));
    $('a11y-cursor').addEventListener('change', e => change({ cursor: e.target.checked }));
    $('a11y-legible').addEventListener('change', e => change({ legible: e.target.checked }));
    $('a11y-motion').addEventListener('change', e => change({ motion: e.target.checked }));
    $('a11y-reset').addEventListener('click', () => change(Object.assign({}, DEFAULTS)));

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !panel.classList.contains('hidden')) close();
    });
    document.addEventListener('mousedown', e => {
      if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !btn.contains(e.target)) close(false);
    });
    sync();
  });
})();

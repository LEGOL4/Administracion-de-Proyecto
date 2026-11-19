/* =========================================================================
   NEXO · Comprobantes de venta descargables (PDF A4 y ticket de 80 mm)
   Genera el PDF directamente en el navegador, sin librerías externas ni
   envío de datos a terceros.
   ========================================================================= */
const Receipt = (() => {
  /* ---- Anchos de la fuente Helvetica (unidades de 1/1000 em) para ASCII 32–126 ---- */
  const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const HELV_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  const FONTS = { F1:'Helvetica', F2:'Helvetica-Bold', F3:'Courier', F4:'Courier-Bold' };
  const ACCENTS = { 'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n','Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ü':'U','Ñ':'N' };

  /* ---- Texto: normaliza y convierte a bytes WinAnsi (cp1252) ---- */
  function clean(s){
    return String(s ?? '').replace(/[   ]/g, ' ').replace(/[\r\n\t]+/g, ' ');
  }
  function code(ch){
    const c = ch.charCodeAt(0);
    if (c === 0x2014) return 0x97;           // —
    if (c === 0x2013) return 0x96;           // –
    if (c === 0x2018 || c === 0x2019) return 0x27;
    if (c === 0x201c || c === 0x201d) return 0x22;
    if (c >= 32 && c <= 126) return c;
    if (c >= 0xa0 && c <= 0xff) return c;
    return 63;                               // ?
  }
  function enc(s){
    let out = '';
    for (const ch of clean(s)) {
      const c = code(ch);
      const g = String.fromCharCode(c);
      out += (g === '(' || g === ')' || g === '\\') ? '\\' + g : g;
    }
    return out;
  }
  function width(s, font, size){
    const str = clean(s);
    if (font === 'F3' || font === 'F4') return [...str].length * 600 * size / 1000;
    const table = font === 'F2' ? HELV_B : HELV;
    let w = 0;
    for (const ch of str) {
      const base = ACCENTS[ch] || ch;
      const c = base.charCodeAt(0);
      w += (c >= 32 && c <= 126) ? table[c - 32] : (c === 0xd7 ? 584 : (c === 0x2014 ? 1000 : 556));
    }
    return w * size / 1000;
  }
  function wrap(s, font, size, maxW){
    const words = clean(s).split(' ').filter(Boolean);
    const lines = []; let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (width(test, font, size) <= maxW || !cur) { cur = test; }
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    // corta palabras demasiado largas
    return lines.flatMap(l => {
      if (width(l, font, size) <= maxW) return [l];
      const parts = []; let p = '';
      for (const ch of l) { if (width(p + ch, font, size) > maxW) { parts.push(p); p = ch; } else p += ch; }
      if (p) parts.push(p);
      return parts;
    });
  }

  /* ---- Mini generador de PDF ---- */
  class Pdf {
    constructor(w, h, autoHeight = false){ this.w = w; this.h = h; this.auto = autoHeight; this.pages = [[]]; this.maxY = 0; }
    get ops(){ return this.pages[this.pages.length - 1]; }
    addPage(){ this.pages.push([]); }
    text(s, x, y, o = {}){
      const font = o.font || 'F1', size = o.size || 10;
      let px = x;
      if (o.align === 'right') px = x - width(s, font, size);
      else if (o.align === 'center') px = x - width(s, font, size) / 2;
      this.ops.push({ t:'text', s, x:px, y, font, size, gray:o.gray });
      this.maxY = Math.max(this.maxY, y);
    }
    line(x1, y1, x2, y2, o = {}){ this.ops.push({ t:'line', x1, y1, x2, y2, w:o.w || .6, dash:o.dash, gray:o.gray }); this.maxY = Math.max(this.maxY, y1, y2); }
    rect(x, y, w, h, gray){ this.ops.push({ t:'rect', x, y, w, h, gray }); this.maxY = Math.max(this.maxY, y + h); }
    finish(title){
      const H = this.auto ? Math.ceil(this.maxY + 18) : this.h;
      const num = n => (Math.round(n * 100) / 100).toString();
      const streams = this.pages.map(ops => ops.map(op => {
        const gray = op.gray != null ? `${op.gray} g ` : '0 g ';
        if (op.t === 'text') return `BT ${gray}/${op.font} ${num(op.size)} Tf ${num(op.x)} ${num(H - op.y)} Td (${enc(op.s)}) Tj ET`;
        if (op.t === 'rect') return `${gray}${num(op.x)} ${num(H - op.y - op.h)} ${num(op.w)} ${num(op.h)} re f 0 g`;
        const d = op.dash ? '[2 2] 0 d ' : '';
        const sg = op.gray != null ? `${op.gray} G ` : '0 G ';
        return `q ${sg}${num(op.w)} w ${d}${num(op.x1)} ${num(H - op.y1)} m ${num(op.x2)} ${num(H - op.y2)} l S Q`;
      }).join('\n'));

      const objs = [];
      const n = streams.length;
      const pageIds = streams.map((_, i) => 7 + i * 2);
      objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
      objs[2] = `<< /Type /Pages /Count ${n} /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] >>`;
      ['F1','F2','F3','F4'].forEach((f, i) => { objs[3 + i] = `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[f]} /Encoding /WinAnsiEncoding >>`; });
      objs[7 + n * 2] = `<< /Title (${enc(title)}) /Producer (NEXO) /Creator (NEXO) >>`;
      streams.forEach((st, i) => {
        const pid = pageIds[i], cid = pid + 1;
        objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.w)} ${num(H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${cid} 0 R >>`;
        objs[cid] = `<< /Length ${st.length} >>\nstream\n${st}\nendstream`;
      });

      let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
      const offsets = [];
      const total = objs.length - 1;
      for (let i = 1; i <= total; i++) {
        offsets[i] = out.length;
        out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
      }
      const xref = out.length;
      out += `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
      for (let i = 1; i <= total; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
      out += `trailer\n<< /Size ${total + 1} /Root 1 0 R /Info ${total} 0 R >>\nstartxref\n${xref}\n%%EOF`;
      return out;
    }
  }

  /* ---- Formato ---- */
  const money = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const fecha = iso => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric' }) + ' ' +
           d.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
  };
  const nro = o => String(o.id || '').slice(0, 8).toUpperCase();

  /* ---- Ticket de 80 mm (monoespaciado, alto automático) ---- */
  function buildTicket(o){
    const W = 226.77, M = 12, SZ = 8, LH = 10.5, COLS = Math.floor((W - M * 2) / (0.6 * SZ));
    const pdf = new Pdf(W, 0, true);
    const L = M, R = W - M, C = W / 2;
    let y = 20;
    const dash = () => { pdf.text('-'.repeat(COLS), L, y, { font:'F3', size:SZ }); y += LH; };

    pdf.text('NEXO', C, y, { font:'F4', size:18, align:'center' }); y += 14;
    pdf.text('Ventas e inventario', C, y, { font:'F3', size:SZ, align:'center' }); y += LH + 4;
    pdf.text('COMPROBANTE DE VENTA', C, y, { font:'F4', size:9, align:'center' }); y += LH;
    pdf.text('N.º ' + nro(o), C, y, { font:'F3', size:SZ, align:'center' }); y += LH + 2;
    dash();
    for (const [k, v] of [['Fecha', fecha(o.fecha)], ['Cliente', o.clienteNombre], ['Atendido por', o.vendedorNombre || '-']]) {
      const lines = wrap(`${k}: ${v}`, 'F3', SZ, W - M * 2);
      lines.forEach(t => { pdf.text(t, L, y, { font:'F3', size:SZ }); y += LH; });
    }
    dash();
    pdf.text('DETALLE', L, y, { font:'F4', size:SZ }); pdf.text('IMPORTE', R, y, { font:'F4', size:SZ, align:'right' }); y += LH;
    dash();
    for (const it of o.items) {
      wrap(`${it.cantidad} x ${it.nombre}`, 'F3', SZ, W - M * 2).forEach(t => { pdf.text(t, L, y, { font:'F3', size:SZ }); y += LH; });
      pdf.text(`   ${money(it.precioUnit)} c/u`, L, y, { font:'F3', size:SZ });
      pdf.text(money(it.precioUnit * it.cantidad), R, y, { font:'F3', size:SZ, align:'right' }); y += LH + 3;
    }
    dash();
    pdf.text('TOTAL', L, y + 2, { font:'F4', size:11 });
    pdf.text(money(o.total), R, y + 2, { font:'F4', size:11, align:'right' }); y += LH + 6;
    dash();
    y += 4;
    pdf.text('Gracias por su compra', C, y, { font:'F3', size:SZ, align:'center' }); y += LH;
    pdf.text('Comprobante interno de venta', C, y, { font:'F3', size:7, align:'center' }); y += LH;
    return pdf.finish('Ticket NEXO ' + nro(o));
  }

  /* ---- Boleta en PDF A4 ---- */
  function buildA4(o){
    const W = 595.28, H = 841.89, M = 48, R = W - M;
    const pdf = new Pdf(W, H);
    const COL = { cant: M + 8, desc: M + 62, unit: R - 96, imp: R - 8 };
    let page = 1;

    const header = () => {
      pdf.text('NEXO', M, 74, { font:'F2', size:30 });
      pdf.text('Ventas e inventario', M, 92, { size:10, gray:0.35 });
      pdf.text('Comprobante de venta', R, 62, { font:'F2', size:16, align:'right' });
      pdf.text('N.º ' + nro(o), R, 80, { font:'F2', size:11, align:'right' });
      pdf.text(fecha(o.fecha), R, 96, { size:10, align:'right', gray:0.35 });
      pdf.line(M, 112, R, 112, { w:1.6 });
    };
    const tableHead = y => {
      pdf.rect(M, y, R - M, 22, 0.92);
      pdf.text('Cant.', COL.cant, y + 15, { font:'F2', size:9.5 });
      pdf.text('Descripción', COL.desc, y + 15, { font:'F2', size:9.5 });
      pdf.text('P. unitario', COL.unit, y + 15, { font:'F2', size:9.5, align:'right' });
      pdf.text('Importe', COL.imp, y + 15, { font:'F2', size:9.5, align:'right' });
      return y + 22;
    };
    const footer = () => {
      pdf.line(M, H - 58, R, H - 58, { w:.5, gray:0.6 });
      pdf.text('Gracias por su compra.', M, H - 42, { size:9, gray:0.35 });
      pdf.text('Comprobante interno de venta · Página ' + page, R, H - 42, { size:9, align:'right', gray:0.35 });
    };

    header();
    let y = 142;
    pdf.text('Cliente', M, y, { size:9, gray:0.4 }); pdf.text('Atendido por', W / 2, y, { size:9, gray:0.4 }); y += 15;
    wrap(o.clienteNombre, 'F2', 12, W / 2 - M - 20).slice(0, 2).forEach((t, i) => pdf.text(t, M, y + i * 15, { font:'F2', size:12 }));
    pdf.text(o.vendedorNombre || '—', W / 2, y, { font:'F2', size:12 });
    y += 44;
    y = tableHead(y);

    for (const it of o.items) {
      const lines = wrap(it.nombre, 'F1', 10, COL.unit - COL.desc - 70);
      const rowH = Math.max(1, lines.length) * 14 + 12;
      if (y + rowH > H - 150) { footer(); pdf.addPage(); page++; header(); y = tableHead(142); }
      pdf.text(String(it.cantidad), COL.cant, y + 17, { size:10 });
      lines.forEach((t, i) => pdf.text(t, COL.desc, y + 17 + i * 14, { size:10 }));
      pdf.text(money(it.precioUnit), COL.unit, y + 17, { size:10, align:'right' });
      pdf.text(money(it.precioUnit * it.cantidad), COL.imp, y + 17, { size:10, align:'right', font:'F2' });
      y += rowH;
      pdf.line(M, y, R, y, { w:.4, gray:0.8 });
    }

    if (y + 70 > H - 70) { footer(); pdf.addPage(); page++; header(); y = 142; }
    y += 28;
    pdf.rect(R - 220, y - 6, 220, 40, 0.92);
    pdf.text('TOTAL', R - 208, y + 20, { font:'F2', size:12 });
    pdf.text(money(o.total), R - 10, y + 21, { font:'F2', size:16, align:'right' });
    footer();
    return pdf.finish('Comprobante NEXO ' + nro(o));
  }

  /* ---- Descarga ---- */
  function download(order, kind){
    const data = kind === 'ticket' ? buildTicket(order) : buildA4(order);
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 255;
    const blob = new Blob([bytes], { type:'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind === 'ticket' ? 'ticket' : 'comprobante'}-NEXO-${nro(order)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return { download, buildTicket, buildA4 };
})();
if (typeof module !== 'undefined') module.exports = Receipt;

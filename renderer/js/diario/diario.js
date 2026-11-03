/* ═══════════════════════════════════════════════════════════════════════════
   Viper — el Diario de Fran
   Nació adentro de UmbroSys (1.20.0, 1/11/2026: diseño de Fran con Sam, la
   variante híbrida) y se mudó a esta app suelta el 2/11/2026. Las notas son
   los .md de S:\Diario (src/diario.cjs): esta ventana es solo la cara, y
   UmbroSys sigue abriendo la misma carpeta con su copia. CC las lee y
   escribe por el servidor MCP (mcp/diario.cjs), y lo de afuera entra solo.

   Tres hojas: a la izquierda la lista por fecha (con la
   búsqueda arriba), en el medio la nota (para leer o para escribir) y a la
   derecha quién la nombra (backlinks) y su grafo chico. El grafo grande
   reemplaza a la nota (Ctrl+G).

   Atajos: Ctrl+N nota nueva · Ctrl+D la de hoy · Ctrl+K buscar o saltar a una
   nota · Ctrl+E leer o escribir · Ctrl+G el grafo · Ctrl+S guardar ya. Al
   escribir [[ aparece un menú con los títulos: Enter o Tab completa.

   Se guarda sola. Si CC sumó algo al final mientras escribías, se juntan las
   dos cosas; si cambió otra parte, queda lo tuyo y lo de él en las versiones
   (.diario/versiones): nunca se pierde nada.
   ═══════════════════════════════════════════════════════════════════════════ */

import { esc, empty, attempt } from '../ui.js';
import { Icons } from '../icons.js';
import { Menu, Modal, Toast } from '../overlays.js';
import { reconcile, swap, initScrollFades } from '../motion.js';
import { md } from '../md.js';
import { cargarPrism, resaltar } from '../resaltar.js';
import { crearGrafo } from './grafo.js';

const api = window.opal?.diario;
Icons.add({
  // el grafo: tres puntos unidos
  grafo: '<circle cx="4" cy="4.2" r="1.7"/><circle cx="12" cy="6" r="1.7"/><circle cx="6.4" cy="12" r="1.7"/><path d="M5.6 4.6 10.4 5.6M11.1 7.4 7.3 10.6M4.6 5.9l1.2 4.4"/>',
});

const clave = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s));
const dos = (n) => String(n).padStart(2, '0');
const hoyEs = () => { const d = new Date(); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };
const sinFrontmatter = (t) => String(t || '').replace(/^---\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '').replace(/^\n+/, '');

/* Cómo se nombra una fecha: «hoy», «ayer», «sábado 1 de noviembre» (con el año si no es este). */
function nombreDia(f, { largo = true } = {}) {
  if (!esFecha(f)) return f;
  const hoy = hoyEs();
  const d = new Date(`${f}T12:00:00`);
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  if (f === hoy) return largo ? `Hoy, ${d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}` : 'hoy';
  if (f === `${ayer.getFullYear()}-${dos(ayer.getMonth() + 1)}-${dos(ayer.getDate())}`) return largo ? `Ayer, ${d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}` : 'ayer';
  const o = largo ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  const t = d.toLocaleDateString('es-AR', o).replace('.', '');
  return largo ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
const tituloDe = (n) => (n.dia ? nombreDia(n.dia) : n.titulo);

/**
 * Arma el Diario adentro de `raiz` (el cuerpo de su ventana).
 * @param {{ menuExtra?: () => object[] }} [opciones]  menuExtra: ítems de la app para el menú «Más»
 * @returns {{ alEnfocar(): void, alAjustar(): void, abrir(ref: string): void, destruir(): void }}
 */
export function montarDiario(raiz, { menuExtra = null } = {}) {
  raiz.classList.add('vt-diario');
  raiz.innerHTML = `
    <aside class="vt-diario__lado">
      <div class="vt-diario__barra">
        <div class="op-inputwrap vt-diario__buscar">${Icons.svg('search')}<input class="op-input" type="search" placeholder="Buscar o saltar" spellcheck="false" aria-label="Buscar en el diario"></div>
        <button type="button" class="op-iconbtn op-iconbtn--sm" data-accion="hoy" aria-label="La nota de hoy" data-tip="La nota de hoy (Ctrl+D)">${Icons.svg('calendar')}</button>
        <button type="button" class="op-iconbtn op-iconbtn--sm" data-accion="nueva" aria-label="Nota nueva" data-tip="Nota nueva (Ctrl+N)">${Icons.svg('plus')}</button>
      </div>
      <div class="vt-diario__lista op-scroll" role="listbox" aria-label="Las notas" tabindex="-1"></div>
    </aside>
    <section class="vt-diario__hoja">
      <header class="vt-diario__cab">
        <div class="vt-diario__cabtxt">
          <h2 class="vt-diario__titulo"></h2>
          <div class="vt-diario__meta"></div>
        </div>
        <span class="vt-diario__estado" aria-live="polite"></span>
        <div class="vt-diario__acciones">
          <button type="button" class="op-iconbtn op-iconbtn--sm op-iconswap vt-diario__modo" data-accion="modo" aria-label="Escribir" data-tip="Escribir (Ctrl+E)">${Icons.svg('edit')}${Icons.svg('eye')}</button>
          <button type="button" class="op-iconbtn op-iconbtn--sm" data-accion="grafo" aria-label="El grafo" data-tip="El grafo (Ctrl+G)">${Icons.svg('grafo')}</button>
          <button type="button" class="op-iconbtn op-iconbtn--sm" data-accion="mas" aria-label="Más" data-tip="Más">${Icons.svg('more')}</button>
        </div>
      </header>
      <div class="vt-diario__cuerpo">
        <div class="vt-diario__leer op-scroll" tabindex="-1"><div class="vt-md"></div></div>
        <textarea class="vt-diario__editor op-scroll" spellcheck="false" aria-label="La nota" placeholder="Escribí… Con [[ nombrás otra nota."></textarea>
        <div class="vt-diario__sugerir" role="listbox" aria-label="Notas para enlazar"></div>
        <div class="vt-diario__grande"></div>
        <div class="vt-diario__vacio"></div>
      </div>
    </section>
    <aside class="vt-diario__panel">
      <div class="vt-diario__sec">
        <div class="vt-diario__sectit">Te nombran <span class="vt-diario__cuenta"></span></div>
        <div class="vt-diario__back op-scroll"></div>
      </div>
      <div class="vt-diario__sec vt-diario__sec--grafo">
        <div class="vt-diario__sectit">Alrededor</div>
        <div class="vt-diario__mini"></div>
      </div>
    </aside>`;
  const $ = (s) => raiz.querySelector(s);
  const buscar = $('.vt-diario__buscar input');
  const lista = $('.vt-diario__lista');
  const hoja = $('.vt-diario__hoja');
  const titulo = $('.vt-diario__titulo');
  const metaEl = $('.vt-diario__meta');
  const estado = $('.vt-diario__estado');
  const leer = $('.vt-diario__leer');
  const leerMd = leer.querySelector('.vt-md');
  const editor = $('.vt-diario__editor');
  const sugerir = $('.vt-diario__sugerir');
  const vacio = $('.vt-diario__vacio');
  const back = $('.vt-diario__back');
  const cuentaBack = $('.vt-diario__cuenta');
  const modoBtn = $('.vt-diario__modo');

  let notas = [];                 // las metas, de la más nueva a la más vieja
  let existen = new Set();        // claves de títulos (y fechas) que existen, para los [[ ]]
  let grafo = { nodos: [], aristas: [] };
  /** La nota abierta: { id, titulo, dia, fecha, etiquetas, hash, base } (base: el texto de ese hash). */
  let actual = null;
  let modo = 'leer';              // 'leer' | 'escribir'
  let enGrafo = false;
  let q = '', resultados = null, creando = false;
  let sucio = false, tGuardar = 0, guardando = null;
  let pintadoVacio = null;
  let vivo = true;

  const mini = crearGrafo($('.vt-diario__mini'), { chico: true, alElegir: (n) => elegirDelGrafo(n) });
  let grande = null;

  /* ── Lo que hay ──────────────────────────────────────────────────────── */
  async function refrescar() {
    if (!api) return;
    const [l, g] = await Promise.all([api.listar().catch(() => null), api.grafo().catch(() => null)]);
    if (!vivo) return;
    if (l) {
      notas = l;
      existen = new Set(l.flatMap((n) => [clave(n.titulo), clave(n.id)]));
    }
    if (g) grafo = g;
    if (q) await correrBusqueda();
    pintarLista();
    pintarGrafos();
    if (actual) pintarBack();
  }
  const existe = (t) => existen.has(clave(t)) || (clave(t) === 'hoy' && existen.has(hoyEs()));

  /* ── La lista ────────────────────────────────────────────────────────── */
  async function correrBusqueda() {
    resultados = q ? await api.buscar(q).catch(() => []) : null;
  }
  function pintarLista() {
    const items = [];
    if (resultados) {
      const exacta = resultados.some((r) => clave(r.titulo) === clave(q)) || (clave(q) === 'hoy' && existe('hoy'));
      for (const r of resultados) items.push({ key: `b:${r.id}`, html: itemHtml(r, r.fragmento) });
      if (!exacta && q.trim()) {
        items.push({ key: 'crear', html: `<button type="button" class="vt-diario__item vt-diario__item--crear" role="option" data-crear="1">
          <span class="vt-diario__ico" aria-hidden="true">${Icons.svg('plus')}</span>
          <span class="vt-diario__txt"><span class="vt-diario__nom">Crear «${esc(q.trim())}»</span><span class="vt-diario__res">Enter</span></span></button>` });
      }
      if (!items.length) items.push({ key: 'nada', html: '<p class="vt-diario__nada">Nada por acá.</p>' });
    } else {
      let mes = '';
      for (const n of notas) {
        const m = n.fecha.slice(0, 7);
        if (m !== mes) {
          mes = m;
          const d = new Date(`${m}-15T12:00:00`);
          const t = d.toLocaleDateString('es-AR', { month: 'long', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
          items.push({ key: `m:${m}`, html: `<div class="vt-diario__mes">${esc(t.charAt(0).toUpperCase() + t.slice(1))}</div>` });
        }
        items.push({ key: n.id, html: itemHtml(n, n.resumen) });
      }
    }
    reconcile(lista, items);
  }
  function itemHtml(n, sub) {
    const activo = actual?.id === n.id;
    return `<button type="button" class="vt-diario__item${activo ? ' is-activo' : ''}${n.dia ? ' is-dia' : ''}" role="option" aria-selected="${activo}" data-id="${esc(n.id)}">
      <span class="vt-diario__ico" aria-hidden="true">${n.dia ? `<b>${esc(String(Number(n.dia.slice(8))))}</b>` : Icons.svg('file')}</span>
      <span class="vt-diario__txt">
        <span class="vt-diario__fila"><span class="vt-diario__nom">${esc(n.dia ? nombreDia(n.dia, { largo: true }).replace(/^(Hoy|Ayer), /, '$1 · ') : n.titulo)}</span>${n.dia ? '' : `<span class="vt-diario__cuando">${esc(nombreDia(n.fecha, { largo: false }))}</span>`}</span>
        ${sub ? `<span class="vt-diario__res">${esc(sub)}</span>` : n.vacia ? '<span class="vt-diario__res is-vacia">vacía</span>' : ''}
      </span>
    </button>`;
  }

  lista.addEventListener('click', (e) => {
    const b = e.target.closest('.vt-diario__item');
    if (!b) return;
    if (b.dataset.crear) crearNota(q.trim());
    else abrir(b.dataset.id);
  });
  lista.addEventListener('keydown', (e) => {
    const items = [...lista.querySelectorAll('.vt-diario__item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const sig = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (i <= 0 && e.key === 'ArrowUp') { buscar.focus(); return; }
      sig?.focus({ preventScroll: false });
    }
  });

  /* ── Buscar, saltar y crear ──────────────────────────────────────────── */
  let tBuscar = 0;
  buscar.addEventListener('input', () => {
    q = buscar.value;
    clearTimeout(tBuscar);
    tBuscar = setTimeout(async () => { await correrBusqueda(); if (vivo) pintarLista(); }, 120);
  });
  buscar.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      if (buscar.value || creando) { e.preventDefault(); e.stopPropagation(); limpiarBusqueda(); (actual ? cuerpoFoco() : lista.focus()); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); lista.querySelector('.vt-diario__item')?.focus(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const t = buscar.value.trim();
    if (!t) return;
    clearTimeout(tBuscar);
    q = buscar.value;
    await correrBusqueda();
    const exacta = resultados.find((r) => clave(r.titulo) === clave(t));
    if (exacta) return abrir(exacta.id).then(limpiarBusqueda);
    if (clave(t) === 'hoy' || esFecha(t)) return irDia(clave(t) === 'hoy' ? hoyEs() : t).then(limpiarBusqueda);
    if (creando || !resultados.length) return crearNota(t);
    abrir(resultados[0].id).then(limpiarBusqueda);
  });
  function limpiarBusqueda() {
    buscar.value = ''; q = ''; resultados = null; creando = false;
    buscar.placeholder = 'Buscar o saltar';
    pintarLista();
  }
  function nuevaConTeclado() {
    limpiarBusqueda();
    creando = true;
    buscar.placeholder = 'El título de la nota nueva, y Enter';
    buscar.focus();
  }
  async function crearNota(t) {
    const n = await attempt(() => api.crear({ titulo: t }), { errorTitle: 'No se pudo crear la nota' });
    if (!n) return;
    limpiarBusqueda();
    await refrescar();
    await abrir(n.id, { escribir: true });
  }
  async function irDia(f = hoyEs()) {
    const n = await attempt(() => api.dia(f), { errorTitle: 'No se pudo abrir el día' });
    if (!n) return;
    if (!notas.some((x) => x.id === n.id)) await refrescar();
    await abrir(n.id, { escribir: true });
  }

  /* ── La nota abierta ─────────────────────────────────────────────────── */
  async function abrir(ref, { escribir = null } = {}) {
    await guardarYa();
    const n = await api.leer(ref).catch(() => null);
    if (!vivo) return;
    if (!n) { Toast.show({ title: 'Esa nota ya no está', text: String(ref), icon: 'alert' }); refrescar(); return; }
    actual = { id: n.id, titulo: n.titulo, dia: n.dia, fecha: n.fecha, etiquetas: n.etiquetas, hash: n.hash, base: n.texto };
    sucio = false;
    editor.value = n.texto;
    // escribir: true/false lo decide quien abre; sin decir, las vacías abren para escribir
    modo = (escribir ?? n.vacia) ? 'escribir' : 'leer';
    if (enGrafo) alternarGrafo(false);
    pintarNota();
    pintarLista();
    pintarBack();
    pintarGrafos();
    if (escribir) setTimeout(() => { editor.focus({ preventScroll: true }); editor.setSelectionRange(editor.value.length, editor.value.length); editor.scrollTop = editor.scrollHeight; }, 30);
    lista.querySelector('.is-activo')?.scrollIntoView({ block: 'nearest' });
    try { localStorage.setItem('vt-diario:ultima', n.id); } catch { /* sin almacenamiento: abre la más nueva */ }
  }

  function pintarCab() {
    const t = actual ? tituloDe(actual) : '';
    if (titulo.dataset.v !== t) { titulo.dataset.v = t; swap(titulo, esc(t), { relevo: true }); }
    const m = actual ? `${actual.dia ? '' : `<span>${esc(nombreDia(actual.fecha))}</span>`}${actual.etiquetas.map((e) => `<span class="vt-diario__chip">#${esc(e)}</span>`).join('')}<span class="vt-diario__ruta">${esc(actual.id)}.md</span>` : '';
    if (metaEl.dataset.v !== m) { metaEl.dataset.v = m; swap(metaEl, m, { relevo: true }); }
  }
  function pintarNota() {
    const hay = !!actual;
    hoja.classList.toggle('is-vacia', !hay && !enGrafo);
    hoja.classList.toggle('is-escribir', hay && modo === 'escribir');
    modoBtn.classList.toggle('is-b', modo === 'escribir');
    const tipModo = modo === 'escribir' ? 'Leer (Ctrl+E)' : 'Escribir (Ctrl+E)';
    modoBtn.dataset.tip = tipModo; modoBtn.setAttribute('aria-label', tipModo.replace(/ \(.*/, ''));
    pintarCab();
    if (!hay) { pintarVacio(); return; }
    if (modo === 'leer') pintarLectura();
  }
  function pintarLectura({ relevo = true } = {}) {
    const cuerpo = sinFrontmatter(editor.value);
    const html = cuerpo.trim()
      ? md(cuerpo, { resaltar, wiki: existe })
      : `<p class="vt-diario__nada">Esta nota está vacía. Ctrl+E para escribir.</p>`;
    if (relevo) swap(leerMd, html, { relevo: true }); else leerMd.innerHTML = html;
    initScrollFades(leer);
  }
  function pintarVacio() {
    const que = notas.length ? 'elegir' : 'nada';
    if (pintadoVacio === que) return;
    pintadoVacio = que;
    swap(vacio, que === 'nada'
      ? empty({ icon: 'book', title: 'Tu diario está vacío', text: 'Ctrl+D abre la nota de hoy y Ctrl+N una nota nueva. Con [[ nombrás otra nota, y quedan enlazadas.', actions: '<button type="button" class="op-btn op-btn--secondary" data-accion="hoy">Escribir hoy</button>' })
      : empty({ icon: 'book', title: 'Elegí una nota', text: 'O escribí la de hoy con Ctrl+D.' }), { relevo: true });
  }
  const cuerpoFoco = () => (modo === 'escribir' ? editor : leer).focus({ preventScroll: true });

  function alternarModo(a = modo === 'leer' ? 'escribir' : 'leer') {
    if (!actual) return;
    if (enGrafo) alternarGrafo(false);
    modo = a;
    if (modo === 'leer') { guardarYa(); cerrarSugerir(); }
    pintarNota();
    cuerpoFoco();
  }

  /* Un [[enlace]] en la lectura: abre la nota, o la crea si todavía no existe. */
  leer.addEventListener('click', (e) => {
    const a = e.target.closest('.md-wiki');
    if (!a) return;
    e.preventDefault();
    irANota(a.dataset.nota);
  });
  async function irANota(t) {
    if (clave(t) === 'hoy' || esFecha(t)) return irDia(clave(t) === 'hoy' ? hoyEs() : t);
    const n = await api.leer(t).catch(() => null);
    if (n) return abrir(n.id);
    crearNota(t);
  }
  function elegirDelGrafo(n) {
    if (n.fantasma) crearNota(n.titulo);
    else abrir(n.id);
  }

  /* ── Guardar ─────────────────────────────────────────────────────────── */
  function ponerEstado(t, tono = '') {
    if (estado.dataset.v === t + tono) return;
    estado.dataset.v = t + tono;
    estado.className = `vt-diario__estado${tono ? ` is-${tono}` : ''}`;
    swap(estado, esc(t), { relevo: true });
  }
  editor.addEventListener('input', () => {
    if (!actual) return;
    sucio = editor.value !== actual.base;
    if (sucio) ponerEstado('Sin guardar');
    clearTimeout(tGuardar);
    tGuardar = setTimeout(guardarYa, 700);
    revisarSugerir();
  });
  function guardarYa() {
    clearTimeout(tGuardar);
    if (guardando) return guardando.then(() => (sucio ? guardarYa() : undefined));
    if (!actual || !sucio) return Promise.resolve();
    const yo = actual;
    guardando = (async () => {
      ponerEstado('Guardando');
      let texto = editor.value;
      let r = await api.guardar(yo.id, texto, yo.hash).catch((err) => ({ error: err }));
      if (r?.conflicto) {
        // alguien (CC) la cambió mientras escribías
        const disco = r.nota.texto, base = yo.base.replace(/\s+$/, '');
        let juntas = null;
        if (disco.startsWith(base)) juntas = `${texto.replace(/\s+$/, '')}${disco.slice(base.length)}`;
        if (juntas != null && actual === yo) {
          const { selectionStart: s, selectionEnd: f } = editor;
          editor.value = juntas;
          editor.setSelectionRange(s, f);
          texto = juntas;
        }
        r = await api.guardar(yo.id, texto, r.nota.hash).catch((err) => ({ error: err }));
        if (!r?.error) {
          Toast.show(juntas != null
            ? { title: 'Se juntaron las dos cosas', text: 'Alguien sumó algo al final de la nota mientras escribías: quedó lo tuyo y lo suyo.', icon: 'info' }
            : { title: 'Quedó lo tuyo', text: 'Alguien cambió la nota mientras escribías. Su versión quedó guardada en .diario/versiones.', icon: 'info' });
        }
      }
      if (r?.error) {
        ponerEstado('No se pudo guardar', 'error');
        Toast.show({ title: 'No se pudo guardar la nota', text: String(r.error?.message || r.error), tone: 'error' });
        return;
      }
      if (actual === yo) {
        yo.hash = r.nota.hash;
        yo.base = r.nota.texto;
        yo.etiquetas = r.nota.etiquetas;
        sucio = editor.value !== yo.base;
        pintarCab();
        ponerEstado(sucio ? 'Sin guardar' : 'Guardado');
      }
    })().finally(() => { guardando = null; });
    return guardando;
  }

  /* Lo que cambió afuera (CC por el MCP, un editor) o en otra parte de la app. */
  const soltarCambios = api?.onCambio?.(async (cambios) => {
    const mia = actual && cambios.find((c) => c.id === actual.id);
    await refrescar();
    if (!mia || !actual || mia.desde === 'app') return;
    if (!mia.existe) {
      Toast.show({ title: 'La nota se movió o se borró afuera', text: `${actual.id}.md`, icon: 'alert' });
      actual = null; pintarNota(); pintarBack(); pintarGrafos(); pintarLista();
      return;
    }
    if (mia.hash === actual.hash) return;
    if (sucio) { guardarYa(); return; } // el guardado se da cuenta y junta
    const n = await api.leer(actual.id).catch(() => null);
    if (!n || !actual || n.id !== actual.id) return;
    const { selectionStart: s, selectionEnd: f } = editor;
    Object.assign(actual, { hash: n.hash, base: n.texto, etiquetas: n.etiquetas });
    editor.value = n.texto;
    if (document.activeElement === editor) editor.setSelectionRange(Math.min(s, n.texto.length), Math.min(f, n.texto.length));
    pintarCab();
    if (modo === 'leer') pintarLectura();
    ponerEstado('Actualizada desde afuera', 'afuera');
  });

  /* ── Backlinks y grafos ──────────────────────────────────────────────── */
  let pintadoBack = null;
  async function pintarBack() {
    if (!actual) {
      if (pintadoBack !== 'nada') { pintadoBack = 'nada'; swap(back, '', { relevo: true }); cuentaBack.textContent = ''; }
      return;
    }
    const yo = actual.id;
    const bl = await api.backlinks(yo).catch(() => []);
    if (!vivo || actual?.id !== yo) return;
    const html = bl.length
      ? bl.map((b) => `<button type="button" class="vt-diario__bl" data-id="${esc(b.id)}">
          <span class="vt-diario__blnom">${esc(b.dia ? nombreDia(b.dia) : b.titulo)}</span>
          ${b.renglones.map((r) => `<span class="vt-diario__blren">${esc(r.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2').replace(/[*_`#>]/g, '').trim())}</span>`).join('')}
        </button>`).join('')
      : `<p class="vt-diario__nada">Ninguna nota la nombra todavía. Escribí [[${esc(actual.titulo)}]] en otra y aparece acá.</p>`;
    if (pintadoBack === yo + html) return;
    pintadoBack = yo + html;
    cuentaBack.textContent = bl.length ? String(bl.length) : '';
    swap(back, html, { relevo: true });
    initScrollFades(back.parentElement);
  }
  back.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) abrir(b.dataset.id); });

  // en el grafo, los días se nombran como en la lista («hoy», «31 oct»), no por su archivo
  const paraGrafo = () => ({ ...grafo, nodos: grafo.nodos.map((n) => (n.dia ? { ...n, titulo: nombreDia(n.dia, { largo: false }) } : n)) });
  function pintarGrafos() {
    const g = paraGrafo();
    mini.poner(g, { foco: actual?.id || null, local: !!actual });
    grande?.poner(g, { foco: actual?.id || null });
  }
  function alternarGrafo(a = !enGrafo) {
    enGrafo = a;
    if (enGrafo && !grande) grande = crearGrafo($('.vt-diario__grande'), { alElegir: (n) => elegirDelGrafo(n) });
    hoja.classList.toggle('is-grafo', enGrafo);
    hoja.classList.toggle('is-vacia', !actual && !enGrafo);
    if (enGrafo) { cerrarSugerir(); guardarYa(); grande.poner(paraGrafo(), { foco: actual?.id || null }); grande.centrar(); }
    else if (actual) pintarNota();
    else pintarVacio();
  }

  /* ── El menú de [[ ]] mientras se escribe ────────────────────────────── */
  let sug = null; // { desde, items, i }
  function revisarSugerir() {
    const c = editor.selectionStart;
    if (c !== editor.selectionEnd) return cerrarSugerir();
    const antes = editor.value.slice(Math.max(0, c - 140), c);
    const m = /\[\[([^\]\n|#]*)$/.exec(antes);
    if (!m) return cerrarSugerir();
    const busca = clave(m[1]);
    const todos = notas.map((n) => ({ t: n.titulo, nom: n.dia ? nombreDia(n.dia) : n.titulo, k: clave(`${n.titulo} ${n.dia ? nombreDia(n.dia) : ''}`) }))
      .filter((x) => x.t !== actual?.titulo);
    let items = busca ? todos.filter((x) => x.k.includes(busca)) : todos;
    items.sort((a, b) => Number(clave(b.t).startsWith(busca)) - Number(clave(a.t).startsWith(busca)));
    items = items.slice(0, 8);
    if (m[1].trim() && !notas.some((n) => clave(n.titulo) === busca)) items.push({ t: m[1].trim(), nom: `Nueva: ${m[1].trim()}`, nueva: true });
    if (!items.length) return cerrarSugerir();
    sug = { desde: c - m[1].length, items, i: Math.min(sug?.i ?? 0, items.length - 1) };
    pintarSugerir();
  }
  function pintarSugerir() {
    sugerir.innerHTML = sug.items.map((x, i) => `<button type="button" class="vt-diario__sug${i === sug.i ? ' is-activo' : ''}${x.nueva ? ' is-nueva' : ''}" role="option" aria-selected="${i === sug.i}" data-i="${i}" tabindex="-1">
      ${x.nueva ? Icons.svg('plus') : Icons.svg('file')}<span>${esc(x.nom)}</span></button>`).join('');
    const p = caretXY();
    const cuerpo = editor.parentElement;
    const w = 260;
    sugerir.style.left = `${Math.max(8, Math.min(cuerpo.clientWidth - w - 8, p.x))}px`;
    const abajo = p.y + 24;
    const alto = Math.min(sug.items.length * 30 + 8, 248);
    sugerir.style.top = `${abajo + alto > cuerpo.clientHeight - 8 ? Math.max(8, p.y - alto - 6) : abajo}px`;
    sugerir.classList.add('is-on');
  }
  function cerrarSugerir() { if (!sug) return; sug = null; sugerir.classList.remove('is-on'); }
  function completar(x) {
    const c = editor.selectionStart;
    const v = editor.value;
    const cierra = v.slice(c, c + 2) === ']]' ? 2 : 0;
    const nuevo = `${v.slice(0, sug.desde)}${x.t}]]`;
    editor.setRangeText(`${x.t}]]`, sug.desde, c + cierra, 'end');
    editor.setSelectionRange(nuevo.length, nuevo.length);
    cerrarSugerir();
    editor.dispatchEvent(new Event('input'));
  }
  sugerir.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // el foco se queda en el editor
    const b = e.target.closest('[data-i]');
    if (b && sug) completar(sug.items[Number(b.dataset.i)]);
  });
  editor.addEventListener('keydown', (e) => {
    if (!sug) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sug.i = (sug.i + (e.key === 'ArrowDown' ? 1 : -1) + sug.items.length) % sug.items.length;
      pintarSugerir();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      completar(sug.items[sug.i]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); // solo cierra el menú
      cerrarSugerir();
    }
  });
  editor.addEventListener('click', revisarSugerir);
  editor.addEventListener('blur', () => setTimeout(cerrarSugerir, 100));
  editor.addEventListener('scroll', () => { if (sug) pintarSugerir(); });

  /* Dónde está el cursor del editor, en px dentro de su caja: un espejo
     invisible con el mismo texto hasta el cursor y una marca al final. */
  const espejo = document.createElement('div');
  espejo.className = 'vt-diario__espejo';
  espejo.setAttribute('aria-hidden', 'true');
  editor.parentElement.append(espejo);
  function caretXY() {
    const cs = getComputedStyle(editor);
    for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'tabSize']) espejo.style[p] = cs[p];
    espejo.style.width = `${editor.clientWidth}px`;
    espejo.textContent = editor.value.slice(0, editor.selectionStart);
    const marca = document.createElement('span');
    marca.textContent = '\u200b';
    espejo.append(marca);
    return { x: editor.offsetLeft + marca.offsetLeft, y: editor.offsetTop + marca.offsetTop - editor.scrollTop };
  }

  /* ── Los botones y los atajos ────────────────────────────────────────── */
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const a = b.dataset.accion;
    if (a === 'hoy') irDia();
    else if (a === 'nueva') nuevaConTeclado();
    else if (a === 'modo') alternarModo();
    else if (a === 'grafo') alternarGrafo();
    else if (a === 'mas') menuMas(b);
  });
  titulo.addEventListener('dblclick', () => { if (actual && !actual.dia) renombrar(); });

  function menuMas(ancla) {
    Menu.show(ancla, [
      ...(actual && !actual.dia ? [{ label: 'Cambiar el título', icon: 'edit', onSelect: renombrar }] : []),
      { label: 'Abrir la carpeta del diario', icon: 'folder', onSelect: () => attempt(() => api.abrirCarpeta(), { errorTitle: 'No se pudo abrir la carpeta' }) },
      ...(menuExtra?.() || []),
      ...(actual ? [{ sep: true }, { label: 'Mandar a la papelera', icon: 'trash', danger: true, onSelect: aPapelera }] : []),
    ], { align: 'end' });
  }
  async function renombrar() {
    if (!actual || actual.dia) return;
    await guardarYa();
    const campo = document.createElement('input');
    campo.className = 'op-input';
    campo.value = actual.titulo;
    campo.spellcheck = false;
    campo.setAttribute('aria-label', 'El título nuevo');
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); Modal.close('ok'); } });
    const cuerpo = document.createElement('div');
    cuerpo.append(campo);
    const r = await Modal.show({ title: 'Cambiar el título', sub: 'Las notas que la nombran con [[ ]] se corrigen solas.', body: cuerpo, actions: [{ label: 'Cancelar', value: null }, { label: 'Cambiar', value: 'ok', variant: 'primary' }] });
    const nuevo = campo.value.trim();
    if (r !== 'ok' || !nuevo || nuevo === actual?.titulo) return;
    const res = await attempt(() => api.renombrar(actual.id, nuevo), { errorTitle: 'No se pudo cambiar el título' });
    if (!res) return;
    await refrescar();
    await abrir(res.nota.id, { escribir: modo === 'escribir' });
    if (res.corregidas) Toast.show({ title: 'Título cambiado', text: `Se corrigieron los enlaces de ${res.corregidas} ${res.corregidas === 1 ? 'nota' : 'notas'}.`, icon: 'check' });
  }
  async function aPapelera() {
    if (!actual) return;
    const yo = actual;
    const si = await Modal.confirm({ title: 'Mandar a la papelera', sub: `«${tituloDe(yo)}» se va a .diario/papelera, adentro de la carpeta del diario. No se borra: la podés sacar de ahí.`, confirmLabel: 'Mandar', danger: true });
    if (!si) return;
    clearTimeout(tGuardar); sucio = false;
    if (!(await attempt(() => api.papelera(yo.id), { errorTitle: 'No se pudo mover la nota' }))) return;
    actual = null;
    await refrescar();
    pintarNota(); pintarBack(); pintarGrafos();
  }

  raiz.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const hecho = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'n') { hecho(); nuevaConTeclado(); }
    else if (k === 'd') { hecho(); irDia(); }
    else if (k === 'k') { hecho(); limpiarBusqueda(); buscar.focus(); }
    else if (k === 'e') { hecho(); alternarModo(); }
    else if (k === 'g') { hecho(); alternarGrafo(); }
    else if (k === 's') { hecho(); guardarYa(); }
  });

  /* ── Arranque ────────────────────────────────────────────────────────── */
  if (!api) {
    swap(vacio, empty({ icon: 'alert', title: 'El Diario no está disponible', text: 'Falta el puente del diario (preload.cjs).' }));
    hoja.classList.add('is-vacia');
  } else {
    refrescar().then(() => {
      if (!vivo || actual) return;
      let ultima = null;
      try { ultima = localStorage.getItem('vt-diario:ultima'); } catch { /* nada */ }
      const n = notas.find((x) => x.id === ultima) || notas.find((x) => x.dia === hoyEs()) || notas[0];
      if (n) abrir(n.id); else pintarNota();
    });
  }
  cargarPrism().then(() => { if (actual && modo === 'leer') pintarLectura({ relevo: false }); });
  pintarNota();

  return {
    alEnfocar() { if (document.activeElement && raiz.contains(document.activeElement)) return; actual ? cuerpoFoco() : buscar.focus({ preventScroll: true }); },
    alAjustar() { mini.ajustar(); grande?.ajustar(); if (sug) pintarSugerir(); },
    /** Abre una nota por su título o id (o «hoy»). */
    abrir(ref) { if (clave(ref) === 'hoy') irDia(); else irANota(ref); },
    destruir() { vivo = false; guardarYa(); soltarCambios?.(); mini.destruir(); grande?.destruir(); },
  };
}

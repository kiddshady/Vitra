/* ═══════════════════════════════════════════════════════════════════════════
   Quartz — el grafo del Diario (nació en UmbroSys)
   Cada nota es un punto y cada [[enlace]] una línea: las notas que tocan los
   mismos temas quedan amontonadas y se ven los grupos. Dibujado a mano en un
   canvas, sin librerías, con la piel de Opal (no pixel art: el pixel art es
   del piso; Fran, 25/10/2026).

   · Se acomoda solo (fuerzas: los puntos se empujan, las líneas tiran) y se
     queda quieto. Las posiciones se recuerdan entre el grafo chico y el
     grande, así una nota no cambia de lugar al pasar de uno al otro.
   · La nota abierta va en el ámbar del Diario; las de los días, más chicas
     y apagadas; las que se nombran y no existen, un aro vacío.
   · Al pasar el mouse se prenden la nota y sus vecinas, con un cartel propio
     (no el tooltip de Chromium). Un clic la abre. La rueda acerca, arrastrar
     mueve, y doble clic en el fondo vuelve a encuadrar todo.
   ═══════════════════════════════════════════════════════════════════════════ */

import { esc } from '../ui.js';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const POS = new Map(); // id → { x, y }: la memoria de dónde quedó cada nota, compartida por los grafos
const ACENTO = '255 184 64'; // el acento de Quartz, el ámbar citrino (--op-accent-rgb en tokens.css)

/* Un color tranquilo por etiqueta (el mismo siempre para la misma). */
function tono(etiqueta) {
  let h = 0;
  for (const c of String(etiqueta)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `oklch(78% .07 ${h % 360})`;
}

/**
 * @param {HTMLElement} caja  donde va el canvas (lo llena)
 * @param {{ alElegir: (nodo) => void, chico?: boolean }} o
 */
export function crearGrafo(caja, { alElegir, chico = false }) {
  caja.classList.add('vt-grafo');
  caja.innerHTML = '<canvas class="vt-grafo__lienzo"></canvas><div class="vt-grafo__tip" aria-hidden="true"></div>';
  const lienzo = caja.querySelector('canvas');
  const tip = caja.querySelector('.vt-grafo__tip');
  const ctx = lienzo.getContext('2d');

  let nodos = [], aristas = [], vecinos = new Map(), foco = null;
  let calor = 0;                      // cuánto se mueve todavía la simulación (1 → 0)
  let vista = { s: 1, x: 0, y: 0 };   // escala y corrimiento (en px de pantalla)
  let encuadrar = true;               // la próxima vez que se dibuje, encuadra todo
  let sobre = null, brillo = 0;       // el nodo bajo el mouse y cuánto se prendió (para el fundido)
  let raf = 0, W = 0, H = 0, dpr = 1;

  /* ── Los datos ────────────────────────────────────────────────────────── */
  function poner(datos, { foco: f = null, local = false } = {}) {
    foco = f;
    let ns = datos.nodos, as = datos.aristas;
    if (local && f) {
      // el grafo chico: la nota abierta, sus vecinas y las vecinas de sus vecinas
      const ady = new Map();
      for (const [a, b] of as) { (ady.get(a) || ady.set(a, []).get(a)).push(b); (ady.get(b) || ady.set(b, []).get(b)).push(a); }
      const dentro = new Set([f]);
      let borde = [f];
      for (let paso = 0; paso < 2; paso++) {
        const sig = [];
        for (const id of borde) for (const v of ady.get(id) || []) if (!dentro.has(v)) { dentro.add(v); sig.push(v); }
        borde = sig;
      }
      ns = ns.filter((n) => dentro.has(n.id));
      as = as.filter(([a, b]) => dentro.has(a) && dentro.has(b));
    }
    const antes = new Set(nodos.map((n) => n.id));
    const nuevos = ns.filter((n) => !antes.has(n.id)).length;
    nodos = ns.map((n) => {
      let p = POS.get(n.id);
      if (!p) {
        // nace cerca de una vecina que ya tenga lugar, o en un lugar al azar cerca del centro
        const v = as.find(([a, b]) => (a === n.id && POS.has(b)) || (b === n.id && POS.has(a)));
        const ancla = v ? POS.get(v[0] === n.id ? v[1] : v[0]) : { x: 0, y: 0 };
        p = { x: ancla.x + (Math.random() - 0.5) * 60, y: ancla.y + (Math.random() - 0.5) * 60 };
        POS.set(n.id, p);
      }
      return { ...n, p, vx: 0, vy: 0, grado: 0 };
    });
    const porId = new Map(nodos.map((n) => [n.id, n]));
    aristas = as.map(([a, b]) => [porId.get(a), porId.get(b)]).filter(([a, b]) => a && b);
    vecinos = new Map(nodos.map((n) => [n.id, new Set()]));
    for (const [a, b] of aristas) { a.grado++; b.grado++; vecinos.get(a.id).add(b.id); vecinos.get(b.id).add(a.id); }
    if (sobre && !porId.has(sobre.id)) sobre = null;
    else if (sobre) sobre = porId.get(sobre.id);
    // se mueve lo justo: mucho si es la primera vez o llegaron varias, poco si cambió una
    calor = Math.max(calor, !antes.size ? 1 : nuevos ? Math.min(1, 0.3 + nuevos * 0.1) : 0.12);
    if (!antes.size || local) encuadrar = true;
    if (reduce.matches) { while (calor > 0.01) paso(); encuadrar = true; }
    pedir();
  }

  /* ── Las fuerzas ──────────────────────────────────────────────────────── */
  function paso() {
    const n = nodos.length;
    const k = chico ? 900 : 1400, largo = chico ? 46 : 64;
    for (let i = 0; i < n; i++) {
      const a = nodos[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodos[j];
        let dx = a.p.x - b.p.x, dy = a.p.y - b.p.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
        if (d2 > 160000) continue; // lejos: no se empujan
        const f = k / d2, d = Math.sqrt(d2);
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    }
    for (const [a, b] of aristas) {
      const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - largo) * 0.04;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const a of nodos) {
      // la gravedad al centro; la nota abierta del grafo chico queda clavada en el medio
      if (chico && a.id === foco) { a.p.x += (0 - a.p.x) * 0.2; a.p.y += (0 - a.p.y) * 0.2; a.vx = a.vy = 0; continue; }
      a.vx -= a.p.x * 0.012; a.vy -= a.p.y * 0.012;
      a.p.x += Math.max(-30, Math.min(30, a.vx * calor));
      a.p.y += Math.max(-30, Math.min(30, a.vy * calor));
      a.vx *= 0.55; a.vy *= 0.55;
    }
    calor *= 0.975;
    if (calor < 0.01) calor = 0;
  }

  /* ── Pantalla ─────────────────────────────────────────────────────────── */
  function medir() {
    dpr = window.devicePixelRatio || 1;
    W = caja.clientWidth; H = caja.clientHeight;
    if (!W || !H) return false;
    if (lienzo.width !== Math.round(W * dpr) || lienzo.height !== Math.round(H * dpr)) {
      lienzo.width = Math.round(W * dpr); lienzo.height = Math.round(H * dpr);
    }
    return true;
  }
  function encuadre() {
    if (!nodos.length) { vista = { s: 1, x: W / 2, y: H / 2 }; return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodos) { x0 = Math.min(x0, n.p.x); y0 = Math.min(y0, n.p.y); x1 = Math.max(x1, n.p.x); y1 = Math.max(y1, n.p.y); }
    const m = chico ? 22 : 48;
    const s = Math.min(2.2, Math.max(0.2, Math.min((W - m * 2) / Math.max(1, x1 - x0), (H - m * 2) / Math.max(1, y1 - y0))));
    vista = { s, x: W / 2 - ((x0 + x1) / 2) * s, y: H / 2 - ((y0 + y1) / 2) * s };
  }
  const aPantalla = (p) => ({ x: p.x * vista.s + vista.x, y: p.y * vista.s + vista.y });
  const radio = (n) => (n.fantasma ? 3 : n.dia ? 2.6 : 3.4) + Math.min(5, Math.sqrt(n.grado) * 1.1) * (chico ? 0.8 : 1);

  function dibujar() {
    raf = 0;
    if (!medir()) return;
    if (calor > 0) paso();
    if (encuadrar) { encuadre(); if (!calor) encuadrar = false; }
    const meta = sobre ? 1 : 0;
    brillo += (meta - brillo) * (reduce.matches ? 1 : 0.2);
    if (Math.abs(meta - brillo) < 0.01) brillo = meta;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const prendido = (n) => !sobre || n.id === sobre.id || vecinos.get(sobre.id)?.has(n.id);
    const apagar = (n) => 1 - brillo * (prendido(n) ? 0 : 0.75);

    // las líneas: 1 px, y las de la nota bajo el mouse más claras
    ctx.lineWidth = 1;
    for (const [a, b] of aristas) {
      const pa = aPantalla(a.p), pb = aPantalla(b.p);
      const suya = sobre && (a.id === sobre.id || b.id === sobre.id);
      const alfa = suya ? 0.16 + 0.34 * brillo : 0.16 * (1 - brillo * 0.7);
      ctx.strokeStyle = `rgb(255 255 255 / ${alfa})`;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    // los puntos
    for (const n of nodos) {
      const p = aPantalla(n.p), r = radio(n);
      ctx.globalAlpha = apagar(n);
      if (n.id === foco) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
        g.addColorStop(0, `rgb(${ACENTO} / .35)`); g.addColorStop(1, `rgb(${ACENTO} / 0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgb(${ACENTO})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 0.6, 0, Math.PI * 2); ctx.fill();
      } else if (n.fantasma) {
        ctx.strokeStyle = 'rgb(255 255 255 / .38)';
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = n.etiquetas?.length ? tono(n.etiquetas[0]) : n.dia ? 'rgb(170 172 180)' : 'rgb(228 230 236)';
        if (n.dia && !n.etiquetas?.length) ctx.globalAlpha *= 0.7;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
      if (sobre && n.id === sobre.id) {
        ctx.globalAlpha = brillo;
        ctx.strokeStyle = 'rgb(255 255 255 / .85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
      }
      // en el grande, los nombres de la abierta y las de mucho grado (y con el mouse, las vecinas)
      const nombre = !chico && (n.id === foco || n.grado >= 4 || (sobre && prendido(n) && brillo > 0.05));
      if (nombre && vista.s > 0.45) {
        ctx.globalAlpha = n.id === foco || n.grado >= 4 ? apagar(n) : brillo;
        ctx.font = '11px "Inter", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgb(220 222 228 / .8)';
        ctx.fillText(n.titulo, p.x, p.y + r + 13);
      }
      ctx.globalAlpha = 1;
    }
    if (calor > 0 || brillo !== (sobre ? 1 : 0)) pedir();
  }
  function pedir() { if (!raf) raf = requestAnimationFrame(dibujar); }

  /* ── El mouse ─────────────────────────────────────────────────────────── */
  function nodoEn(x, y) {
    let mejor = null, dm = Infinity;
    for (const n of nodos) {
      const p = aPantalla(n.p);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < Math.max(8, radio(n) + 4) && d < dm) { dm = d; mejor = n; }
    }
    return mejor;
  }
  function mostrarTip(n, x, y) {
    if (!n) { tip.classList.remove('is-on'); return; }
    tip.innerHTML = `<b>${esc(n.titulo)}</b>${n.fantasma ? '<span>todavía no existe</span>' : n.grado ? `<span>${n.grado} ${n.grado === 1 ? 'enlace' : 'enlaces'}</span>` : ''}`;
    const w = tip.offsetWidth;
    tip.style.transform = `translate(${Math.round(Math.min(W - w - 6, Math.max(6, x - w / 2)))}px, ${Math.round(y + 14 > H - 40 ? y - 44 : y + 14)}px)`;
    tip.classList.add('is-on');
  }
  let arrastre = null;
  lienzo.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    arrastre = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, movio: false, nodo: nodoEn(e.offsetX, e.offsetY) };
    lienzo.setPointerCapture(e.pointerId);
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (arrastre) {
      const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) arrastre.movio = true;
      if (arrastre.movio) { vista.x = arrastre.vx + dx; vista.y = arrastre.vy + dy; encuadrar = false; mostrarTip(null); pedir(); return; }
    }
    const n = nodoEn(e.offsetX, e.offsetY);
    lienzo.style.cursor = n ? 'pointer' : 'grab';
    if (n !== sobre) { sobre = n; pedir(); }
    mostrarTip(n, e.offsetX, e.offsetY);
  });
  lienzo.addEventListener('pointerup', (e) => {
    const a = arrastre;
    arrastre = null;
    if (a && !a.movio && a.nodo && a.nodo === nodoEn(e.offsetX, e.offsetY)) alElegir?.(a.nodo);
  });
  lienzo.addEventListener('pointerleave', () => { sobre = null; mostrarTip(null); pedir(); });
  lienzo.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0015);
    const s = Math.min(4, Math.max(0.15, vista.s * f));
    const k = s / vista.s;
    vista = { s, x: e.offsetX - (e.offsetX - vista.x) * k, y: e.offsetY - (e.offsetY - vista.y) * k };
    encuadrar = false;
    mostrarTip(null);
    pedir();
  }, { passive: false });
  lienzo.addEventListener('dblclick', (e) => { if (!nodoEn(e.offsetX, e.offsetY)) { encuadrar = true; pedir(); } });

  const ro = new ResizeObserver(() => { encuadrar = encuadrar || calor > 0; pedir(); });
  ro.observe(caja);

  return {
    poner,
    /** Vuelve a encuadrar todo. */
    centrar() { encuadrar = true; pedir(); },
    ajustar: pedir,
    get vacio() { return !nodos.length; },
    destruir() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

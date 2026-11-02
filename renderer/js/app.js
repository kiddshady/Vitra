/* ═══════════════════════════════════════════════════════════════════════════
   Vitra — arranque
   La app es el Diario y nada más: una ventana de vidrio acrílico con sus
   tres hojas (diario/diario.js). Acá se monta, se cablean los controles de
   la ventana y se deja todo listo para usarla sin mouse.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';
import { Tooltip, Toast, FieldMenu } from './overlays.js';
import { initClickFlash, initScrollFades, raf2 } from './motion.js';
import { empty, colorToken } from './ui.js';
import { Shell } from './shell.js';
import { montarDiario } from './diario/diario.js';
import { iniciarActualizaciones, itemsActualizar } from './actualizar.js';

const api = window.opal;
const raiz = document.getElementById('diario');

/* ══ La ventana ══════════════════════════════════════════════════════════════
   Siempre acrílico: el main ya la crea con el material de Windows 11, y acá
   se prende la pila de UmbroSys en el fondo (shell.css, .vidrio-acrilico).
   Sin statusbar y sin contexto: la titlebar es aire con la marca. */
function aplicarVentana() {
  Shell.set({ statusbar: false, contexto: false, vidrio: 'acrilico' });
}

function wireVentana() {
  const w = api?.win;
  document.getElementById('win-min')?.addEventListener('click', () => w?.minimize());
  document.getElementById('win-close')?.addEventListener('click', () => w?.close());
  const maxBtn = document.getElementById('win-max');
  maxBtn?.addEventListener('click', () => w?.toggleMaximize());
  w?.onMaximized((isMax) => {
    maxBtn.classList.toggle('is-b', isMax);   // los dos íconos se cruzan (.op-iconswap)
    maxBtn.setAttribute('aria-label', isMax ? 'Restaurar' : 'Maximizar');
  });
  // doble clic en la titlebar: maximizar, como cualquier ventana de Windows
  document.querySelector('.op-titlebar')?.addEventListener('dblclick', (e) => {
    if (!e.target.closest('.op-no-drag, button')) w?.toggleMaximize();
  });
}

/* Los avisos caen en la esquina de abajo a la derecha de la hoja de la nota,
   adentro de su aire. Shell los ubica contra .op-main, que Vitra no tiene: se
   mide la hoja (y acompaña cuando la ventana cambia de tamaño). */
function colocarToasts() {
  const hoja = raiz.querySelector('.vt-diario__hoja');
  if (!hoja) return;
  const m = hoja.getBoundingClientRect();
  const s = document.documentElement.style;
  s.setProperty('--op-toasts-right', `${Math.round(innerWidth - m.right + 16)}px`);
  s.setProperty('--op-toasts-bottom', `${Math.round(innerHeight - m.bottom + 16)}px`);
}

/* --op-bg en hex para el main: el frame fantasma de restaurar (con el
   acrílico apagado, por ejemplo sin foco en otra versión de Windows) queda
   del color de la app. */
function syncWindowColor() {
  const hex = colorToken('--op-bg');
  if (hex) api?.win?.setBackground(hex);
}

/* Un archivo de datos ilegible se aparta (store.cjs) y la app arranca sin él. */
async function tellAsides() {
  const list = await api.asides().catch(() => []);
  if (!list.length) return;
  const files = [...new Set(list.map((a) => a.file))];
  Toast.show({
    tone: 'error',
    duration: 0,
    title: files.length === 1 ? `${files[0]} estaba dañado` : `${files.join(', ')} estaban dañados`,
    text: `${files.length === 1 ? 'Quedó' : 'Quedaron'} aparte en la carpeta de datos, con «.corrupto-» en el nombre.`,
  });
}

/* ══ Los atajos sin foco ═════════════════════════════════════════════════════
   El Diario escucha sus atajos (Ctrl+N, D, K, E, G, S) adentro de su raíz.
   Recién abierta la ventana, o después de un clic en la titlebar, el foco
   queda en el body y no llegaban: se reenvían a la raíz. */
const ATAJOS = new Set(['n', 'd', 'k', 'e', 'g', 's']);
function wireAtajos(diario) {
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !ATAJOS.has(e.key.toLowerCase())) return;
    if (raiz.contains(e.target) || e.target.closest?.('#op-layer')) return;
    e.preventDefault();
    diario.alEnfocar();
    raiz.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, bubbles: true, cancelable: true }));
  });
}

/* ══ Arranque ════════════════════════════════════════════════════════════════ */

function boot() {
  Icons.mount(document);
  Tooltip.init();
  FieldMenu.init();
  initClickFlash();
  initScrollFades();
  Shell.init();
  aplicarVentana();
  wireVentana();
  syncWindowColor();

  let diario;
  try {
    diario = montarDiario(raiz, { menuExtra: () => { const u = itemsActualizar(); return u.length ? [{ sep: true }, ...u] : []; } });
  } catch (err) {
    raiz.innerHTML = `<section class="vt-diario__hoja" style="grid-column: 1 / -1; display: grid; place-items: center">${empty({ icon: 'alert', title: 'No se pudo abrir el Diario', text: err.message })}</section>`;
    Icons.mount(raiz);
    console.error(err);
  }

  if (diario) {
    wireAtajos(diario);
    new ResizeObserver(() => { diario.alAjustar(); colocarToasts(); }).observe(raiz);
    addEventListener('focus', () => diario.alEnfocar());
    addEventListener('beforeunload', () => diario.destruir());
    window.vitra = { diario };   // para el humo
  }
  colocarToasts();
  tellAsides();
  iniciarActualizaciones();

  // El splash se va recién cuando ya hay algo pintado debajo.
  raf2(() => {
    diario?.alEnfocar();
    const splash = document.getElementById('boot-splash');
    if (!splash) return;
    splash.style.opacity = '0';
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    setTimeout(() => splash.remove(), 600);
  });
}

boot();

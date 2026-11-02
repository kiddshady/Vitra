'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   VITRA — proceso principal
   El Diario de Fran como app suelta (nació en UmbroSys 1.20.0). Sobre la
   plantilla Opal, en la variante acrílico. Lo de abajo es el arranque sin
   flash de Opal; lo propio de Vitra está al final: el diario (src/diario.cjs),
   sus canales y el vidrio que no se apaga sin foco (src/vidrio.cjs).

   Acá pasa lo único de una app Electron que no se puede resolver con CSS: que
   la ventana aparezca SIN un solo frame blanco.

   ── El problema ────────────────────────────────────────────────────────────
   Hay dos destellos blancos distintos y se arreglan distinto:

   A) Flash de contenido (FOUC). Antes de que el renderer pinte, Chromium
      muestra el fondo por defecto de la ventana. Se mata con `show:false` +
      `backgroundColor` oscuro + `paintWhenInitiallyHidden` + el splash inline
      del index.html.

   B) Flash del compositor (DWM). Cuando el HWND pasa de oculto a visible,
      el compositor de Windows pinta su backdrop POR ENCIMA del swap chain de
      Chromium. Ningún CSS lo alcanza. No se puede evitar: se puede PROVOCAR
      donde nadie lo vea. Por eso la ventana nace en x:-20000, hace su primer
      show() ahí, y recién 200 ms después se mueve a su lugar.

   Si el destello se ve en vivo pero NO en una grabación de pantalla, es el B.

   ── Los números no son arbitrarios ─────────────────────────────────────────
   · -20000  → fuera de cualquier monitor, incluso en setups multi-pantalla.
   · 200 ms  → lo que tarda DWM en asentar la superficie off-screen. Con 120
               el flash vuelve de forma intermitente. Si ves un destello "a
               veces sí, a veces no", es este número, no otra cosa.
   · Electron ≥ 40 → desde la 40, el frame fantasma de minimizar→restaurar se
               pinta con el `backgroundColor` de la ventana. En la 33 y
               anteriores es blanco hardcodeado y no hay forma de taparlo.
   ═══════════════════════════════════════════════════════════════════════════ */

const { app, BrowserWindow, ipcMain, nativeTheme, screen, shell } = require('electron');
const path = require('path');
const ipc = require('./src/ipc.cjs');
const store = require('./src/store.cjs');
const { keepAlive } = require('./src/recover.cjs');
const { crearDiario } = require('./src/diario.cjs');
const { mantenerVidrio } = require('./src/vidrio.cjs');
const actualizador = require('./src/actualizador.cjs');

/* Color base de arranque. Tiene que coincidir con --op-bg de tokens.css.
   Como --op-bg es oklch y Electron solo entiende hex, el renderer se lo vuelve
   a mandar ya resuelto apenas carga (win.setBackground en app.js): si cambiás
   el matiz o la temperatura, no hace falta tocar este valor a mano. Este hex
   solo cubre los primeros milisegundos, antes de que exista el renderer. */
const BG = '#0a0a0a';

/* El vidrio «acrilico» (tokens.css): Windows 11 pinta detrás de la ventana el
   escritorio desenfocado y la página encima es translúcida. Un backgroundColor
   opaco taparía el acrílico, así que en ese nivel va transparente y el último
   --op-bg que mandó el renderer queda guardado para cuando se apague. El tema
   va forzado a oscuro porque el acrílico sigue al de Windows: en modo claro
   sería blanco. Sin foco, Windows lo cambia por un gris liso: src/vidrio.cjs
   se lo devuelve con WM_NCACTIVATE, como Moji. Vitra nace acrílico siempre. */
const CLEAR = '#00000000';
let acrilico = true;
let bgHex = BG;
nativeTheme.themeSource = 'dark';

const DEFAULT_W = 1180;
const DEFAULT_H = 760;
const MIN_W = 640;
const MIN_H = 420;

/** @type {BrowserWindow | null} */
let win = null;

/* ── Estado de la ventana ────────────────────────────────────────────────────
   Recordar tamaño y posición entre sesiones. La trampa: si el monitor donde
   estaba ya no existe, la posición guardada deja la ventana en la nada. Por
   eso se valida contra las pantallas actuales antes de usarla. */
const winState = store.doc('window', null);

function visibleOn(x, y, w, h) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    // Con que se vea una esquina razonable alcanza para poder agarrarla.
    return x + w > a.x + 40 && x < a.x + a.width - 40
        && y + h > a.y && y < a.y + a.height - 40;
  });
}

function centered(w, h) {
  const a = screen.getPrimaryDisplay().workArea;
  return { x: Math.round(a.x + (a.width - w) / 2), y: Math.round(a.y + (a.height - h) / 2) };
}

/* La ventana tiene que ENTRAR en el área útil de la pantalla donde cae. En una
   1366×768 con la barra de tareas (área útil 1366×720), los 820 px por defecto
   no entraban: centered() daba y = (720 - 820) / 2 = -50, Windows recortaba el
   alto a 720 pero dejaba esa y, y la titlebar quedaba 50 px por arriba de la
   pantalla, sin forma de agarrarla. Lo mismo con un tamaño guardado en un
   monitor más grande. Por eso se achica al área útil y se empuja adentro. */
function fitIn(w, h, pos) {
  const a = pos ? screen.getDisplayMatching({ ...pos, width: w, height: h }).workArea
                : screen.getPrimaryDisplay().workArea;
  const width = Math.min(w, a.width);
  const height = Math.min(h, a.height);
  const p = pos ?? centered(width, height);
  return {
    width, height,
    x: Math.max(a.x, Math.min(p.x, a.x + a.width - width)),
    y: Math.max(a.y, Math.min(p.y, a.y + a.height - height)),
  };
}

async function loadWindowState() {
  const s = await winState.read().catch(() => null);
  const w = Math.max(MIN_W, Number(s?.width) || DEFAULT_W);
  const h = Math.max(MIN_H, Number(s?.height) || DEFAULT_H);
  const hasPos = Number.isFinite(s?.x) && Number.isFinite(s?.y) && visibleOn(s.x, s.y, w, h);
  return { maximized: !!s?.maximized, ...fitIn(w, h, hasPos ? { x: s.x, y: s.y } : null) };
}

function windowState() {
  if (!win || win.isDestroyed()) return null;
  // Guardar el bounds NORMAL: si guardás el maximizado, al desmaximizar la
  // próxima vez la ventana queda del tamaño de la pantalla y sin poder volver.
  const b = win.getNormalBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() };
}

let saveTimer = null;
function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  clearTimeout(saveTimer);
  // Debounce: arrastrar una ventana emite decenas de eventos por segundo.
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const s = windowState();
    if (s) winState.write(s).catch((err) => console.error('[window] no se pudo guardar el estado:', err.message));
  }, 400);
}

/* Lo que el debounce tenía pendiente, al disco YA y sin soltar el hilo. Al
   cerrar, la app se va antes de que llegue una escritura asíncrona; al
   apagar Windows, el sistema puede matar el proceso en cualquier momento
   después de avisar (store.cjs, trampa 4). Movida y cerrada enseguida, la
   ventana volvía a abrir donde estaba antes. */
function flushWindowState() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const s = windowState();
  try { if (s) winState.writeSync(s); } catch (err) { console.error('[window] no se pudo guardar el estado:', err.message); }
}

function createWindow(state) {
  win = new BrowserWindow({
    // Nace fuera de pantalla: el flash del compositor ocurre donde nadie lo ve.
    x: -20000,
    y: -20000,
    width: state.width,
    height: state.height,
    minWidth: MIN_W,
    minHeight: MIN_H,
    frame: false,
    show: false,
    paintWhenInitiallyHidden: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: acrilico ? CLEAR : BG,
    ...(acrilico && { backgroundMaterial: 'acrylic' }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.setMenu(null);   // sin el menú de Electron: Ctrl+R no recarga la nota a medio escribir
  mantenerVidrio(win, () => acrilico);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Si se cae el proceso de la interfaz, la ventana se recarga sola (recover.cjs).
  keepAlive(win);

  win.once('ready-to-show', () => {
    win.show();
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      win.setPosition(state.x, state.y);
      if (state.maximized) win.maximize();
    }, 200);
  });

  // En dev, la consola del renderer sale por la terminal: si un módulo no carga
  // o una vista revienta, se ve acá sin tener que abrir devtools.
  if (process.argv.includes('--dev')) {
    win.webContents.on('console-message', (e) => {
      const level = ['debug', 'info', 'warn', 'error'][e.level] ?? e.level;
      console.log(`[renderer:${level}] ${e.message}`);
    });
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(`[renderer] no cargó (${code} ${desc}) → ${url}`);
    });
  }

  const pushMaximized = () => {
    if (win && !win.isDestroyed()) win.webContents.send('win:maximized', win.isMaximized());
  };
  win.on('maximize', () => { pushMaximized(); saveWindowState(); });
  win.on('unmaximize', () => { pushMaximized(); saveWindowState(); });
  win.on('resize', saveWindowState);
  win.on('move', saveWindowState);
  /* Apagar, reiniciar o cerrar la sesión de Windows no pasa por la cruz:
     Windows avisa y después puede cortar. Lo tuyo que quede pendiente (un
     borrador con debounce) va acá también, con writeSync. */
  win.on('close', flushWindowState);
  win.on('query-session-end', flushWindowState);
  win.on('session-end', flushWindowState);

  // Nada de navegación fuera de la app; los links externos van al navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.on('closed', () => { win = null; });
}

/* ── Controles de ventana ────────────────────────────────────────────────────
   La titlebar es nuestra (frame:false), así que minimizar/maximizar/cerrar
   los tiene que cablear la app. */
ipcMain.on('win:minimize', () => win && win.minimize());
ipcMain.on('win:toggle-maximize', () => {
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('win:close', () => win && win.close());
ipcMain.handle('win:is-maximized', () => (win ? win.isMaximized() : false));

// El renderer manda su --op-bg ya resuelto a hex. Es lo que hace que el frame
// fantasma del restore siga camuflado aunque cambies el matiz en tokens.css.
ipcMain.on('win:set-bg', (_e, hex) => {
  if (win && !win.isDestroyed() && /^#[0-9a-f]{6}$/i.test(String(hex))) {
    bgHex = hex;
    if (!acrilico) win.setBackgroundColor(hex);
  }
});

ipcMain.on('win:set-acrilico', (_e, on) => {
  on = on === true;
  if (on === acrilico) return;
  acrilico = on;
  if (!win || win.isDestroyed()) return;
  win.setBackgroundMaterial(on ? 'acrylic' : 'none');
  win.setBackgroundColor(on ? CLEAR : bgHex);
});

/* ── El Diario ───────────────────────────────────────────────────────────────
   Los .md de S:\Diario (src/diario.cjs; VITRA_DIARIO cambia la carpeta, para
   probar sin tocar la de verdad). UmbroSys abre la misma carpeta con su
   copia del núcleo, y CC por el MCP (mcp/diario.cjs): lo que cambie afuera
   llega por 'diario:cambio'. Guardar va con la base que se leyó, así dos que
   escriben a la vez dan conflicto en vez de pisarse. */
const diario = crearDiario({ dir: process.env.VITRA_DIARIO || undefined, vigilar: true });
diario.on('cambio', (c) => { if (win && !win.isDestroyed()) win.webContents.send('diario:cambio', c); });
const propio = (e) => !!win && !win.isDestroyed() && e.sender === win.webContents;
const deDiario = (canal, fn) => ipcMain.handle(canal, async (e, ...a) => {
  if (!propio(e)) return { ok: false, error: 'no permitido' };
  try { return { ok: true, data: await fn(...a) }; } catch (err) { return { ok: false, error: String(err?.message || err) }; }
});
const txt = (x) => String(x ?? '');
deDiario('diario:carpeta', () => diario.dir);
deDiario('diario:listar', () => diario.listar());
deDiario('diario:leer', (ref) => diario.leer(txt(ref)));
deDiario('diario:backlinks', (ref) => diario.backlinks(txt(ref)));
deDiario('diario:buscar', (q) => diario.buscar(txt(q), { limite: 50 }));
deDiario('diario:grafo', () => diario.grafo());
deDiario('diario:crear', (o) => diario.crear({ titulo: txt(o?.titulo), texto: txt(o?.texto), etiquetas: Array.isArray(o?.etiquetas) ? o.etiquetas.map(txt) : [] }));
deDiario('diario:dia', (f) => diario.dia(f ? txt(f) : undefined));
deDiario('diario:guardar', (ref, texto, base) => diario.guardar(txt(ref), txt(texto), { base: typeof base === 'string' ? base : null }));
deDiario('diario:renombrar', (ref, nuevo) => diario.renombrar(txt(ref), txt(nuevo)));
deDiario('diario:papelera', (ref) => diario.aPapelera(txt(ref)));
deDiario('diario:abrir-carpeta', async () => { const err = await shell.openPath(diario.dir); if (err) throw new Error(err); return true; });
app.on('before-quit', () => diario.cerrar());

/* ── Una sola Vitra ──────────────────────────────────────────────────────────
   Dos ventanas sobre la misma carpeta no se pisan (el guardado con base lo
   evita), pero se confunde cuál es cuál: la segunda trae la primera adelante. */
const unica = process.env.VITRA_VARIAS === '1' || app.requestSingleInstanceLock();
if (!unica) app.quit();
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(async () => {
  if (!unica) return;
  ipc.register();
  createWindow(await loadWindowState());
  // Se busca solo, un rato después de abrir; bajar lo decide Fran (src/actualizador.cjs).
  actualizador.iniciar(() => win);
  setTimeout(() => actualizador.buscar({ manual: false }), 6000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(await loadWindowState());
});

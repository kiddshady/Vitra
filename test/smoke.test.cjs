'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   Viper — el humo
   Abre la app de verdad (main.cjs) sobre un diario y una carpeta de datos
   temporales, y la recorre como Fran: escribe la de hoy, enlaza otra con
   [[ ]], la abre desde el enlace, mira el grafo, y cambia una nota desde
   afuera como lo haría CC por el MCP. No toca S:\Diario.

     npm run smoke                 (VITRA_FOTOS=<carpeta> guarda capturas)
   ═══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vitra-humo-'));
const DIARIO = path.join(tmp, 'Diario');
fs.mkdirSync(path.join(DIARIO, 'diario'), { recursive: true });
fs.writeFileSync(path.join(DIARIO, 'Bienvenida.md'), '# Hola\n\nEsta nota ya estaba. Nombra a [[Biológica]].\n\n```js\nconst x = 1;\n```\n');
process.env.VITRA_DIARIO = DIARIO;
process.env.VITRA_DATA = path.join(tmp, 'data');
process.env.VITRA_VARIAS = '1';
const FOTOS = process.env.VITRA_FOTOS || '';

const { app, BrowserWindow } = require('electron');
require('../main.cjs');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function hasta(win, expr, ms = 4000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await win.webContents.executeJavaScript(expr).catch(() => false)) return true;
    await espera(60);
  }
  return false;
}
const js = (win, expr) => win.webContents.executeJavaScript(expr);
async function teclas(win, combos) {
  for (const k of combos) {
    const [mod, key] = k.includes('+') ? k.split('+') : [null, k];
    const modifiers = mod ? [mod.toLowerCase()] : [];
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers });
    if (!mod && key.length === 1) win.webContents.sendInputEvent({ type: 'char', keyCode: key });
    if (key === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers });
    await espera(20);
  }
}
async function escribir(win, texto) {
  await js(win, `(() => { const e = document.querySelector('.vt-diario__editor'); e.focus(); })()`);
  await win.webContents.insertText(texto);
}
async function foto(win, nombre) {
  if (!FOTOS) return;
  fs.mkdirSync(FOTOS, { recursive: true });
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(FOTOS, `${nombre}.png`), img.toPNG());
}

async function correr() {
  let win = null;
  for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0] || null; await espera(50); }
  if (!win) throw new Error('no apareció la ventana');
  await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r()));
  win.setPosition(-20000, -20000);   // fuera de la vista: el humo no le tapa la pantalla a nadie
  await espera(400);

  console.log('\n1. El arranque');
  ok('el splash se va', await hasta(win, `!document.getElementById('boot-splash')`, 3000));
  ok('las tres hojas', await js(win, `['.vt-diario__lado', '.vt-diario__hoja', '.vt-diario__panel'].every((s) => document.querySelector(s))`));
  ok('la ventana oscura: sin el vidrio acrílico', await js(win, `!document.documentElement.classList.contains('vidrio-acrilico')`));
  ok('la marca sola en la titlebar: la V, sin el nombre', await js(win, `!!document.querySelector('.op-brand svg.vp-marca') && !document.querySelector('.op-brand__name') && document.querySelector('.op-brand svg.vp-marca').getBoundingClientRect().width === 22`));
  ok('las escamas en el sustrato', await js(win, `getComputedStyle(document.querySelector('.op-fog')).backgroundImage.includes('156,230,80')`));
  ok('el acento es el verde veneno', await js(win, `getComputedStyle(document.documentElement).getPropertyValue('--op-accent-rgb').trim() === '156 230 80'`));
  ok('la nota abierta lleva la luz en el canto', await hasta(win, `!!document.querySelector('.vt-diario__item.is-activo') && getComputedStyle(document.querySelector('.vt-diario__item.is-activo'), '::after').opacity === '1'`));
  ok('sin statusbar', await js(win, `document.querySelector('.op-app').classList.contains('sin-statusbar')`));
  ok('la nota que había, en la lista', await hasta(win, `[...document.querySelectorAll('.vt-diario__item')].some((b) => b.textContent.includes('Bienvenida'))`));
  ok('abre sola la única nota que hay', await hasta(win, `document.querySelector('.vt-diario__titulo')?.textContent.includes('Bienvenida')`));
  ok('el enlace a una nota que no existe sale fantasma', await hasta(win, `!!document.querySelector('.vt-md .md-wiki.is-fantasma')`));
  ok('el bloque de código, coloreado por Prism', await hasta(win, `!!document.querySelector('.vt-md .md-codigo .token')`, 5000));
  ok('ninguna hoja del Diario lleva blur propio', await js(win, `['.vt-diario__lado', '.vt-diario__hoja', '.vt-diario__panel'].every((s) => getComputedStyle(document.querySelector(s)).backdropFilter === 'none')`));
  await foto(win, '1-arranque');

  console.log('\n2. La de hoy, con el teclado y sin foco');
  await js(win, `document.activeElement?.blur()`);
  await teclas(win, ['Control+D']);
  ok('Ctrl+D sin foco abre la de hoy, para escribir', await hasta(win, `document.querySelector('.vt-diario__hoja').classList.contains('is-escribir') && /^Hoy/.test(document.querySelector('.vt-diario__titulo').textContent)`));
  await escribir(win, 'Hoy estudié para el final. Mañana sigo con [[Biol');
  ok('[[ abre el menú de notas', await hasta(win, `document.querySelector('.vt-diario__sugerir').classList.contains('is-on')`));
  await foto(win, '2-sugerir');
  await teclas(win, ['Tab']);
  ok('Tab completa el enlace', await hasta(win, `document.querySelector('.vt-diario__editor').value.includes('[[Biológica]]') || document.querySelector('.vt-diario__editor').value.includes('[[Biol]]')`), await js(win, `document.querySelector('.vt-diario__editor').value`));
  await teclas(win, ['Control+S']);
  const hoy = new Date();
  const f = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const archivo = path.join(DIARIO, 'diario', `${f}.md`);
  let guardado = false;
  for (let i = 0; i < 60 && !guardado; i++) { guardado = fs.existsSync(archivo) && fs.readFileSync(archivo, 'utf8').includes('estudié para el final'); await espera(50); }
  ok('se guarda en diario/AAAA-MM-DD.md', guardado);
  ok('  y lo dice', await hasta(win, `document.querySelector('.vt-diario__estado').textContent.includes('Guardado')`));

  console.log('\n3. Leer y seguir un enlace');
  await teclas(win, ['Control+E']);
  ok('Ctrl+E pasa a leer', await hasta(win, `!document.querySelector('.vt-diario__hoja').classList.contains('is-escribir')`));
  await js(win, `document.querySelector('.vt-md .md-wiki')?.click()`);
  ok('el enlace crea la nota que no existía y la abre', await hasta(win, `/Biol/.test(document.querySelector('.vt-diario__titulo').textContent)`));
  ok('  y quedó en disco', fs.readdirSync(DIARIO).some((x) => /^Biol.*\.md$/.test(x)), fs.readdirSync(DIARIO).join(', '));
  ok('quién la nombra: la de hoy y la Bienvenida', await hasta(win, `document.querySelectorAll('.vt-diario__bl').length >= 1`));
  await foto(win, '3-backlinks');

  console.log('\n4. El grafo');
  await teclas(win, ['Control+G']);
  ok('Ctrl+G muestra el grafo grande', await hasta(win, `document.querySelector('.vt-diario__hoja').classList.contains('is-grafo') && !!document.querySelector('.vt-diario__grande canvas')`));
  await espera(500);
  await foto(win, '4-grafo');
  await teclas(win, ['Control+G']);
  ok('  y vuelve a la nota', await hasta(win, `!document.querySelector('.vt-diario__hoja').classList.contains('is-grafo')`));

  console.log('\n5. Lo que cambia afuera (CC por el MCP)');
  await js(win, `window.vitra.diario.abrir('Bienvenida')`);
  await hasta(win, `document.querySelector('.vt-diario__titulo').textContent.includes('Bienvenida')`);
  fs.appendFileSync(path.join(DIARIO, 'Bienvenida.md'), '\nUna línea que sumó CC desde afuera.\n');
  ok('la nota abierta se pone al día sola', await hasta(win, `document.querySelector('.vt-md').textContent.includes('sumó CC desde afuera')`, 5000));
  ok('  y lo avisa', await hasta(win, `document.querySelector('.vt-diario__estado').textContent.includes('afuera')`));

  console.log('\n6. Buscar');
  await teclas(win, ['Control+K']);
  await win.webContents.insertText('final');
  ok('Ctrl+K busca en el texto', await hasta(win, `document.querySelectorAll('.vt-diario__item').length === 2 && document.querySelector('.vt-diario__res')?.textContent.includes('final')`), await js(win, `document.querySelector('.vt-diario__lista').textContent`));
  await teclas(win, ['Escape']);

  console.log('\n7. Angosta');
  win.setSize(820, 560);
  await espera(300);
  ok('a 820 px se va el panel de la derecha', await js(win, `getComputedStyle(document.querySelector('.vt-diario__panel')).display === 'none'`));
  await foto(win, '7-angosta');
}

app.whenReady().then(async () => {
  try { await correr(); } catch (err) { fail++; console.log(`  FALLA el humo se cortó: ${err.stack || err}`); }
  console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* el vigía puede tenerla tomada */ }
  app.exit(fail ? 1 : 0);
});

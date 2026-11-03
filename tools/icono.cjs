'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   El ícono de Viper (el molde es el de UmbroSys, tools/icono.cjs).

   El dibujo es uno solo, tools/marca.cjs: el ojo de víbora en el centro
   de un grafo hexagonal (lo hizo Fran). Esto escribe:
     · build/icon.png (1024, el maestro) y build/icon.ico (16 a 256): con la
       baldosa, cada tamaño dibujado desde el vector a su tamaño, el MISMO
       dibujo en todos, sin versiones simplificadas para los chicos;
     · la marca de la titlebar y la del splash en renderer/index.html (entre
       <!-- marca:titlebar --> y <!-- marca:splash -->), SIN baldosa, como
       pidió Fran (3/11/2026). Así el ícono, la titlebar y el splash no
       pueden desfasarse.

       npm run icon
       npx electron tools/icono.cjs --muestra <archivo.png>   la hoja de control
   ═══════════════════════════════════════════════════════════════════════════ */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { marca, ENCUADRE_SUELTO } = require('./marca.cjs');

const OUT = path.join(__dirname, '..', 'build');
const INDEX = path.join(__dirname, '..', 'renderer', 'index.html');
const TAMANOS = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

/* Un .ico con cada tamaño en PNG adentro (Windows lo lee desde Vista). */
function ico(pngs) {
  const cab = Buffer.alloc(6 + 16 * pngs.length);
  cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(pngs.length, 4);
  let off = cab.length;
  pngs.forEach(({ tam, buf }, i) => {
    const e = 6 + 16 * i;
    cab.writeUInt8(tam >= 256 ? 0 : tam, e); cab.writeUInt8(tam >= 256 ? 0 : tam, e + 1);
    cab.writeUInt8(0, e + 2); cab.writeUInt8(0, e + 3);
    cab.writeUInt16LE(1, e + 4); cab.writeUInt16LE(32, e + 6);
    cab.writeUInt32LE(buf.length, e + 8); cab.writeUInt32LE(off, e + 12);
    off += buf.length;
  });
  return Buffer.concat([cab, ...pngs.map((p) => p.buf)]);
}

/* Reemplaza lo que hay entre <!-- marca:X --> y <!-- /marca:X --> en el index. */
function ponerEnIndex(nombre, svg) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const re = new RegExp(`(<!-- marca:${nombre} -->)[\\s\\S]*?(<!-- /marca:${nombre} -->)`);
  if (!re.test(html)) throw new Error(`falta <!-- marca:${nombre} --> en renderer/index.html`);
  fs.writeFileSync(INDEX, html.replace(re, (_, a, b) => `${a}${svg}${b}`));
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 200, height: 200 });
  await win.loadURL('data:text/html;charset=utf-8,<!doctype html><meta charset="utf-8">');
  const dibujar = (tam) => win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(marca({ tam: 1024 }))});
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = ${tam};
    c.getContext('2d').drawImage(img, 0, 0, ${tam}, ${tam});
    return c.toDataURL('image/png').split(',')[1];
  })()`);

  const i = process.argv.indexOf('--muestra');
  if (i > 0) {
    // el ícono a 256, 64, 48, 32, 24 y 16, sobre una barra oscura y una clara
    const salida = process.argv[i + 1];
    const t = {};
    for (const tam of [256, 64, 48, 32, 24, 16]) t[tam] = await dibujar(tam);
    const b64 = await win.webContents.executeJavaScript(`(async () => {
      const t = ${JSON.stringify(t)};
      const c = document.createElement('canvas'); c.width = 900; c.height = 300;
      const g = c.getContext('2d');
      g.fillStyle = '#202020'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#d9dde3'; g.fillRect(620, 0, 280, c.height);
      const pon = async (b, x, y, s) => { const im = new Image(); im.src = 'data:image/png;base64,' + b; await im.decode(); g.drawImage(im, x, y, s, s); };
      await pon(t[256], 20, 20, 256);
      let x = 300;
      for (const tam of [64, 48, 32, 24, 16]) { await pon(t[tam], x, 80, tam); x += tam + 18; }
      x = 640;
      for (const tam of [48, 32, 24, 16]) { await pon(t[tam], x, 80, tam); x += tam + 18; }
      return c.toDataURL('image/png').split(',')[1];
    })()`);
    fs.writeFileSync(salida, Buffer.from(b64, 'base64'));
    process.stdout.write(`${salida}\n`);
    app.exit(0);
    return;
  }

  const png = async (tam) => Buffer.from(await dibujar(tam), 'base64');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'icon.png'), await png(1024));
  const pngs = [];
  for (const tam of TAMANOS) pngs.push({ tam, buf: await png(tam) });
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(pngs));
  ponerEnIndex('titlebar', marca({ baldosa: false, encuadre: ENCUADRE_SUELTO, id: 'vp-tb' }).replace('<svg ', '<svg class="vp-marca" aria-hidden="true" '));
  ponerEnIndex('splash', marca({ baldosa: false, encuadre: ENCUADRE_SUELTO, id: 'vp-sp' }));
  process.stdout.write(`${path.join(OUT, 'icon.png')} (1024)\n${path.join(OUT, 'icon.ico')} (${TAMANOS.join(', ')})\n${INDEX} (titlebar y splash)\n`);
  app.exit(0);
});

'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   El ícono de Vitra (el molde es el de UmbroSys, tools/icono.cjs).

   La baldosa a sangre de radio 232 sobre 1024, sin bordes, con el degradé
   oscuro de la familia. Adentro, el dibujo de la variante elegida. Escribe
   build/icon.png (1024, el maestro) y build/icon.ico (16 a 256): cada tamaño
   se dibuja desde el vector a su tamaño, el MISMO dibujo en todos, sin
   versiones simplificadas para los chicos.

       npm run icon                     la variante elegida (ELEGIDA, abajo)
       npx electron tools/icono.cjs --muestra <archivo.png>
                                        todas las variantes, grandes y chicas
   ═══════════════════════════════════════════════════════════════════════════ */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'build');
const TAMANOS = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
const AMBAR = '#ffb454';

const defs = `
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#191919"/><stop offset="1" stop-color="#0a0a0a"/>
  </linearGradient>
  <linearGradient id="plata" gradientUnits="userSpaceOnUse" x1="0" y1="170" x2="0" y2="830">
    <stop offset="0" stop-color="#9a9a9a"/><stop offset=".5" stop-color="#d0d0d0"/><stop offset="1" stop-color="#f5f5f5"/>
  </linearGradient>
  <linearGradient id="vidrio" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".30"/><stop offset="1" stop-color="#ffffff" stop-opacity=".08"/>
  </linearGradient>
  <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="10" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="glowA" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur stdDeviation="18" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

const VARIANTES = {
  /* A · El cuaderno: la marca de la titlebar, en plata, con la cinta ámbar. */
  cuaderno: `
    <g filter="url(#glow)" fill="none" stroke="url(#plata)" stroke-width="64" stroke-linejoin="round" stroke-linecap="round">
      <rect x="282" y="222" width="460" height="580" rx="64"/>
      <path d="M392 222 V802"/>
    </g>
    <path d="M560 190 V470 L626 418 L692 470 V190 Z" fill="${AMBAR}" filter="url(#glowA)"/>`,

  /* B · La hoja de vidrio: una página translúcida con su canto encendido,
        renglones, y la cinta ámbar colgando. Vitra = vidrio. */
  hoja: `
    <rect x="262" y="202" width="500" height="620" rx="70" fill="url(#vidrio)"/>
    <rect x="262" y="202" width="500" height="620" rx="70" fill="none" stroke="url(#plata)" stroke-width="22" filter="url(#glow)"/>
    <g stroke="#e8e8e8" stroke-opacity=".75" stroke-width="34" stroke-linecap="round">
      <path d="M352 420 H600"/><path d="M352 530 H672"/><path d="M352 640 H560"/>
    </g>
    <path d="M622 170 V356 L672 318 L722 356 V170 Z" fill="${AMBAR}" filter="url(#glowA)"/>`,

  /* C · El grafo: tres notas enlazadas; la abierta, en ámbar. */
  grafo: `
    <g stroke="url(#plata)" stroke-width="40" stroke-linecap="round" filter="url(#glow)">
      <path d="M332 352 L668 438"/><path d="M668 438 L452 712"/><path d="M332 352 L452 712"/>
    </g>
    <circle cx="332" cy="352" r="92" fill="url(#plata)" filter="url(#glow)"/>
    <circle cx="452" cy="712" r="80" fill="url(#plata)" filter="url(#glow)"/>
    <circle cx="668" cy="438" r="112" fill="${AMBAR}" filter="url(#glowA)"/>`,
};
const ELEGIDA = 'grafo';   // Fran, 2/11/2026, entre las tres

const svg = (v) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>${defs}</defs>
  <rect x="0" y="0" width="1024" height="1024" rx="232" fill="url(#bg)"/>
  ${VARIANTES[v]}
</svg>`;

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

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 200, height: 200 });
  await win.loadURL('data:text/html;charset=utf-8,<!doctype html><meta charset="utf-8">');
  const dibujar = (v, tam) => win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg(v))});
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = ${tam};
    c.getContext('2d').drawImage(img, 0, 0, ${tam}, ${tam});
    return c.toDataURL('image/png').split(',')[1];
  })()`);

  const i = process.argv.indexOf('--muestra');
  if (i > 0) {
    // una hoja con cada variante a 256, 64, 48, 32, 24 y 16, sobre una barra oscura y una clara
    const salida = process.argv[i + 1];
    const filas = [];
    for (const v of Object.keys(VARIANTES)) {
      const t = {};
      for (const tam of [256, 64, 48, 32, 24, 16]) t[tam] = await dibujar(v, tam);
      filas.push({ v, t });
    }
    const b64 = await win.webContents.executeJavaScript(`(async () => {
      const filas = ${JSON.stringify(filas)};
      const c = document.createElement('canvas'); c.width = 900; c.height = filas.length * 300 + 20;
      const g = c.getContext('2d');
      g.fillStyle = '#202020'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#d9dde3'; g.fillRect(620, 0, 280, c.height);
      for (const [n, f] of filas.entries()) {
        const y = 20 + n * 300;
        const pon = async (b, x, yy, s) => { const im = new Image(); im.src = 'data:image/png;base64,' + b; await im.decode(); g.drawImage(im, x, yy, s, s); };
        await pon(f.t[256], 20, y, 256);
        g.fillStyle = '#ccc'; g.font = '600 18px Segoe UI'; g.fillText(f.v, 300, y + 24);
        let x = 300;
        for (const tam of [64, 48, 32, 24, 16]) { await pon(f.t[tam], x, y + 60, tam); x += tam + 18; }
        x = 640;
        for (const tam of [48, 32, 24, 16]) { await pon(f.t[tam], x, y + 60, tam); x += tam + 18; }
      }
      return c.toDataURL('image/png').split(',')[1];
    })()`);
    fs.writeFileSync(salida, Buffer.from(b64, 'base64'));
    process.stdout.write(`${salida}\n`);
    app.exit(0);
    return;
  }

  const png = async (tam) => Buffer.from(await dibujar(ELEGIDA, tam), 'base64');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'icon.png'), await png(1024));
  const pngs = [];
  for (const tam of TAMANOS) pngs.push({ tam, buf: await png(tam) });
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(pngs));
  process.stdout.write(`${path.join(OUT, 'icon.png')} (1024, ${ELEGIDA})\n${path.join(OUT, 'icon.ico')} (${TAMANOS.join(', ')})\n`);
  app.exit(0);
});

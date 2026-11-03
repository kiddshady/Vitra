/* ═══════════════════════════════════════════════════════════════════════════
   La mudanza de %APPDATA%\Vitra a %APPDATA%\Viper (src/carpeta.cjs).
   Lo que importa: en NINGÚN caso arranca de cero ni se pisa nada. Cada caso
   arma un %APPDATA% falso en una carpeta temporal.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { elegir } = require('../src/carpeta.cjs');

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-carpeta-'));
let n = 0;
const appData = () => { const d = path.join(RAIZ, String(n++)); fs.mkdirSync(d); return d; };
const poner = (dir, archivo, texto = 'x') => {
  fs.mkdirSync(path.dirname(path.join(dir, archivo)), { recursive: true });
  fs.writeFileSync(path.join(dir, archivo), texto);
};
const leer = (dir, archivo) => fs.readFileSync(path.join(dir, archivo), 'utf8');
const hay = (dir, archivo = '') => fs.existsSync(path.join(dir, archivo));

console.log('\n1. Instalación nueva');
{
  const a = appData();
  const r = elegir(a);
  ok('sin nada, usa Viper', r.dir === path.join(a, 'Viper') && r.paso === 'nueva');
  ok('y no inventa una Vitra', !hay(a, 'Vitra'));
}

console.log('\n2. Viene de Vitra: se muda entera');
{
  const a = appData();
  poner(path.join(a, 'Vitra'), 'data/window.json', '{"x":1}');
  poner(path.join(a, 'Vitra'), 'Local State', 'chromium');
  const r = elegir(a);
  ok('usa Viper', r.dir === path.join(a, 'Viper') && r.paso === 'mudada');
  ok('con la ventana de antes', leer(r.dir, 'data/window.json') === '{"x":1}');
  ok('y lo de Chromium', leer(r.dir, 'Local State') === 'chromium');
  ok('Vitra ya no está', !hay(a, 'Vitra'));
  ok('el segundo arranque no hace nada', elegir(a).paso === 'nueva');
}

console.log('\n3. Una Viper vacía del todo no frena la mudanza');
{
  const a = appData();
  poner(path.join(a, 'Vitra'), 'data/window.json', 'vieja');
  fs.mkdirSync(path.join(a, 'Viper'));
  const r = elegir(a);
  ok('se muda igual', r.paso === 'mudada' && leer(r.dir, 'data/window.json') === 'vieja');
}

console.log('\n4. Una Viper con algo sin datos: no se pisa, usa Vitra');
{
  const a = appData();
  poner(path.join(a, 'Vitra'), 'data/window.json', 'vieja');
  poner(path.join(a, 'Viper'), 'Local State', 'otra');
  const r = elegir(a);
  ok('usa Vitra', r.dir === path.join(a, 'Vitra') && r.paso === 'vieja');
  ok('Viper sigue como estaba', leer(path.join(a, 'Viper'), 'Local State') === 'otra');
}

console.log('\n5. Viper con datos manda; Vitra no se toca');
{
  const a = appData();
  poner(path.join(a, 'Viper'), 'data/window.json', 'nueva');
  poner(path.join(a, 'Vitra'), 'data/window.json', 'vieja');
  const r = elegir(a);
  ok('usa Viper', r.dir === path.join(a, 'Viper') && r.paso === 'nueva');
  ok('Vitra intacta', leer(path.join(a, 'Vitra'), 'data/window.json') === 'vieja');
}

console.log('\n6. Si renombrar falla, esta vez usa Vitra');
{
  const a = appData();
  poner(path.join(a, 'Vitra'), 'data/window.json', 'vieja');
  const fsMod = require('fs');
  const original = fsMod.renameSync;
  fsMod.renameSync = () => { throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); };
  try {
    const r = elegir(a);
    ok('usa Vitra', r.dir === path.join(a, 'Vitra') && r.paso === 'vieja');
  } finally { fsMod.renameSync = original; }
  ok('y el próximo arranque sí muda', elegir(a).paso === 'mudada');
}

fs.rmSync(RAIZ, { recursive: true, force: true });
console.log(`\n${pass} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);

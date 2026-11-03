/* ═══════════════════════════════════════════════════════════════════════════
   La mudanza de %APPDATA%\Viper (o \Vitra) a %APPDATA%\Quartz (src/carpeta.cjs).
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
  ok('sin nada, usa Quartz', r.dir === path.join(a, 'Quartz') && r.paso === 'nueva');
  ok('y no inventa una Viper', !hay(a, 'Viper'));
}

console.log('\n2. Viene de Viper: se muda entera');
{
  const a = appData();
  poner(path.join(a, 'Viper'), 'data/window.json', '{"x":1}');
  poner(path.join(a, 'Viper'), 'Local State', 'chromium');
  const r = elegir(a);
  ok('usa Quartz', r.dir === path.join(a, 'Quartz') && r.paso === 'mudada');
  ok('con la ventana de antes', leer(r.dir, 'data/window.json') === '{"x":1}');
  ok('y lo de Chromium', leer(r.dir, 'Local State') === 'chromium');
  ok('Viper ya no está', !hay(a, 'Viper'));
  ok('el segundo arranque no hace nada', elegir(a).paso === 'nueva');
}

console.log('\n3. Una Quartz vacía del todo no frena la mudanza');
{
  const a = appData();
  poner(path.join(a, 'Viper'), 'data/window.json', 'vieja');
  fs.mkdirSync(path.join(a, 'Quartz'));
  const r = elegir(a);
  ok('se muda igual', r.paso === 'mudada' && leer(r.dir, 'data/window.json') === 'vieja');
}

console.log('\n4. Una Quartz con algo sin datos: no se pisa, usa Viper');
{
  const a = appData();
  poner(path.join(a, 'Viper'), 'data/window.json', 'vieja');
  poner(path.join(a, 'Quartz'), 'Local State', 'otra');
  const r = elegir(a);
  ok('usa Viper', r.dir === path.join(a, 'Viper') && r.paso === 'vieja');
  ok('Quartz sigue como estaba', leer(path.join(a, 'Quartz'), 'Local State') === 'otra');
}

console.log('\n5. Quartz con datos manda; Viper no se toca');
{
  const a = appData();
  poner(path.join(a, 'Quartz'), 'data/window.json', 'nueva');
  poner(path.join(a, 'Viper'), 'data/window.json', 'vieja');
  const r = elegir(a);
  ok('usa Quartz', r.dir === path.join(a, 'Quartz') && r.paso === 'nueva');
  ok('Viper intacta', leer(path.join(a, 'Viper'), 'data/window.json') === 'vieja');
}

console.log('\n6. Si renombrar falla, esta vez usa Viper');
{
  const a = appData();
  poner(path.join(a, 'Viper'), 'data/window.json', 'vieja');
  const fsMod = require('fs');
  const original = fsMod.renameSync;
  fsMod.renameSync = () => { throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); };
  try {
    const r = elegir(a);
    ok('usa Viper', r.dir === path.join(a, 'Viper') && r.paso === 'vieja');
  } finally { fsMod.renameSync = original; }
  ok('y el próximo arranque sí muda', elegir(a).paso === 'mudada');
}

console.log('\n7. Viene de Vitra sin haber pasado por Viper');
{
  const a = appData();
  poner(path.join(a, 'Vitra'), 'data/window.json', 'vitra');
  const r = elegir(a);
  ok('usa Quartz', r.dir === path.join(a, 'Quartz') && r.paso === 'mudada');
  ok('con la ventana de Vitra', leer(r.dir, 'data/window.json') === 'vitra');
  ok('Vitra ya no está', !hay(a, 'Vitra'));
}

console.log('\n8. Viper y Vitra con datos: se muda Viper, Vitra no se toca');
{
  const a = appData();
  poner(path.join(a, 'Viper'), 'data/window.json', 'viper');
  poner(path.join(a, 'Vitra'), 'data/window.json', 'vitra');
  const r = elegir(a);
  ok('usa Quartz con lo de Viper', r.paso === 'mudada' && leer(r.dir, 'data/window.json') === 'viper');
  ok('Vitra intacta', leer(path.join(a, 'Vitra'), 'data/window.json') === 'vitra');
}

fs.rmSync(RAIZ, { recursive: true, force: true });
console.log(`\n${pass} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);

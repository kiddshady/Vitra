/* El Diario (src/diario.cjs) y su servidor MCP (mcp/diario.cjs), sobre una
   carpeta temporal. Lo que más importa: que nada pise ni borre una nota, que
   los enlaces y los backlinks salgan bien, y que el MCP hable el protocolo. */
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { crearDiario, enlacesDe, separarFrontmatter, diaDe, tituloValido } = require('../src/diario.cjs');
const aqui = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const tiraError = async (f) => { try { await f(); return false; } catch { return true; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diario-test-'));
const d = crearDiario({ dir: tmp });

console.log('1. Leer lo que se escribe');
{
  ok('enlaces: alias, sección, sin repetir, sin los de adentro del código',
    JSON.stringify(enlacesDe('[[Uno]] y [[uno]], [[Dos|el dos]], [[Tres#parte]] `[[No]]`\n```\n[[Tampoco]]\n```')) === '["Uno","Dos","Tres"]',
    JSON.stringify(enlacesDe('[[Uno]] y [[uno]], [[Dos|el dos]], [[Tres#parte]] `[[No]]`\n```\n[[Tampoco]]\n```')));
  const fm = separarFrontmatter('---\nfecha: 2026-11-01\netiquetas: [facu, medicinal]\notra:\n  - a\n  - b\n---\nhola');
  ok('frontmatter: valor, lista entre corchetes y lista con guiones', fm.datos.fecha === '2026-11-01' && fm.datos.etiquetas.join() === 'facu,medicinal' && fm.datos.otra.join() === 'a,b' && fm.cuerpo === 'hola', JSON.stringify(fm));
  ok('un título con letras prohibidas se limpia', tituloValido('a/b: c?') === 'a b c');
  ok('  y uno reservado de Windows no vale', await tiraError(() => tituloValido('CON')));
}

console.log('\n2. Crear sin pisar');
{
  const n = await d.crear({ titulo: 'Parcial de Medicinal', texto: 'Temas: [[GABA]] y [[Benzodiacepinas]].', etiquetas: ['facu'] });
  ok('crea el archivo con su título como nombre', fs.existsSync(path.join(tmp, 'Parcial de Medicinal.md')) && n.titulo === 'Parcial de Medicinal');
  ok('  con las etiquetas arriba (la fecha solo si se pide)', /^---\netiquetas: \[facu\]\n---\n/.test(n.texto), n.texto);
  ok('  y una nota pelada, sin nada arriba', (await d.crear({ titulo: 'Pelada' })).texto === '' && (await d.aPapelera('Pelada')));
  ok('  y sus enlaces', n.enlaces.join() === 'GABA,Benzodiacepinas');
  ok('crear una que ya existe falla (aunque cambien mayúsculas y tildes)', await tiraError(() => d.crear({ titulo: 'parcial de medicínal' })));
  const hoy = await d.dia();
  ok('la nota del día va en diario/AAAA-MM-DD.md', hoy.id === `diario/${diaDe()}` && fs.existsSync(path.join(tmp, 'diario', `${diaDe()}.md`)));
  ok('  y pedirla otra vez devuelve la misma', (await d.dia('hoy')).id === hoy.id);
}

console.log('\n3. Agregar y enlazar: solo suman');
{
  const antes = (await d.leer('Parcial de Medicinal')).texto;
  await d.agregar('Parcial de Medicinal', 'Repasar [[Flumazenil]].');
  const n = await d.leer('parcial de medicinal');
  ok('agregar suma al final sin tocar lo de antes', n.texto.startsWith(antes.trimEnd()) && n.texto.endsWith('Repasar [[Flumazenil]].\n'), n.texto);
  const vers = path.join(tmp, '.diario', 'versiones', 'Parcial de Medicinal');
  ok('  y lo de antes quedó en .diario/versiones', fs.readdirSync(vers).length === 1 && fs.readFileSync(path.join(vers, fs.readdirSync(vers)[0]), 'utf8') === antes);
  await d.agregar('hoy', 'Estudié para el [[Parcial de Medicinal]].');
  ok('agregar a «hoy» va a la nota del día', (await d.leer(diaDe())).texto.includes('[[Parcial de Medicinal]]'));
  await d.agregar('2026-01-05', 'Un día viejo.');
  ok('  y a un día que no existe, lo crea', fs.existsSync(path.join(tmp, 'diario', '2026-01-05.md')));
  ok('agregar a una nota que no existe falla', await tiraError(() => d.agregar('No existe', 'x')));
  const e1 = await d.enlazar('2026-01-05', 'GABA');
  const e2 = await d.enlazar('2026-01-05', 'gaba');
  ok('enlazar suma un [[ ]] una sola vez', e1.texto.trimEnd().endsWith('[[GABA]]') && e2.yaEstaba && (await d.leer('2026-01-05')).texto.match(/\[\[GABA\]\]/g).length === 1);
}

console.log('\n4. Backlinks, búsqueda y grafo');
{
  const bl = await d.backlinks('Parcial de Medicinal');
  ok('backlinks: quién la nombra, con el renglón', bl.length === 1 && bl[0].dia === diaDe() && bl[0].renglones[0].includes('[[Parcial de Medicinal]]'), JSON.stringify(bl));
  ok('  también de una nota que todavía no existe', (await d.backlinks('GABA')).length === 2);
  const b = await d.buscar('flumazenil');
  ok('buscar sin mayúsculas ni tildes, con el renglón', b.length === 1 && b[0].fragmento.includes('Flumazenil'));
  ok('  y por título primero', (await d.buscar('medicinal'))[0].titulo === 'Parcial de Medicinal');
  const g = await d.grafo();
  const fantasmas = g.nodos.filter((x) => x.fantasma).map((x) => x.titulo).sort();
  ok('grafo: lo nombrado que no existe es un fantasma', fantasmas.join() === 'Benzodiacepinas,Flumazenil,GABA', fantasmas.join());
  ok('  y los enlaces sin repetir', g.aristas.length === 5, JSON.stringify(g.aristas));
  ok('listar: los días primero por fecha', (await d.listar({ dias: true })).map((n) => n.titulo).join() === `${diaDe()},2026-01-05`);
}

console.log('\n5. Guardar desde la app, renombrar y la papelera');
{
  const n = await d.leer('Parcial de Medicinal');
  await d.agregar('Parcial de Medicinal', 'Esto lo sumó CC.');
  const r = await d.guardar('Parcial de Medicinal', `${n.texto}Lo mío.`, { base: n.hash });
  ok('guardar con una base vieja no pisa: avisa el conflicto', r.conflicto && r.nota.texto.includes('Esto lo sumó CC.'));
  const r2 = await d.guardar('Parcial de Medicinal', `${r.nota.texto}Lo mío.`, { base: r.nota.hash });
  ok('  con la base de ahora sí guarda', !r2.conflicto && r2.nota.texto.endsWith('Lo mío.'));
  const rn = await d.renombrar('Parcial de Medicinal', 'Primer parcial de Medicinal');
  ok('renombrar mueve el archivo', fs.existsSync(path.join(tmp, 'Primer parcial de Medicinal.md')) && !fs.existsSync(path.join(tmp, 'Parcial de Medicinal.md')));
  ok('  y corrige los [[ ]] que la nombran', rn.corregidas === 1 && (await d.leer('hoy')).texto.includes('[[Primer parcial de Medicinal]]'));
  ok('un día no se renombra', await tiraError(() => d.renombrar('hoy', 'otro')));
  await d.aPapelera('2026-01-05');
  ok('la papelera no borra: mueve a .diario/papelera', !fs.existsSync(path.join(tmp, 'diario', '2026-01-05.md')) && fs.readdirSync(path.join(tmp, '.diario', 'papelera')).length === 2) // con «Pelada», de arriba;
  ok('  y lo de .diario no aparece como nota', !(await d.listar()).some((x) => x.id.startsWith('.')));
}

console.log('\n6. Los adjuntos de un pedido (los usa UmbroSys con su copia del núcleo)');
{
  const a = d.adjuntos('mirá [[primer parcial de medicinal]] y [[hoy]] y [[No existe]]');
  ok('trae el texto de las que existen y saltea las otras', a.length === 2 && a[0].titulo === 'Primer parcial de Medicinal' && a[1].titulo === diaDe(), JSON.stringify(a.map((x) => x.titulo)));
  ok('sin [[ ]] no trae nada', d.adjuntos('hacé tal cosa').length === 0);
}

console.log('\n7. Vigilar: lo que cambia afuera');
{
  const v = crearDiario({ dir: tmp, vigilar: true });
  await v.listar();
  const llego = new Promise((r) => { v.on('cambio', r); setTimeout(() => r(null), 3000); });
  fs.writeFileSync(path.join(tmp, 'Desde afuera.md'), 'hola');
  const c = await llego;
  ok('avisa el cambio de afuera', Array.isArray(c) && c.some((x) => x.id === 'Desde afuera' && x.desde === 'afuera'), JSON.stringify(c));
  const llego2 = new Promise((r) => { v.on('cambio', (x) => { if (x.some((y) => y.id === 'Desde la app')) r(x); }); setTimeout(() => r(null), 3000); });
  await v.crear({ titulo: 'Desde la app' });
  const c2 = await llego2;
  ok('  y reconoce lo que escribió él mismo', c2?.find((x) => x.id === 'Desde la app')?.desde === 'app', JSON.stringify(c2));
  v.cerrar();
}

console.log('\n8. El servidor MCP');
{
  const p = spawn(process.execPath, [path.join(aqui, '..', 'mcp', 'diario.cjs')], { env: { ...process.env, DIARIO_DIR: tmp }, stdio: ['pipe', 'pipe', 'inherit'] });
  const esperando = new Map();
  let buf = '';
  p.stdout.on('data', (t) => {
    buf += t;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      esperando.get(m.id)?.(m); esperando.delete(m.id);
    }
  });
  let n = 0;
  const pedir = (method, params) => new Promise((r) => { const id = ++n; esperando.set(id, r); p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); setTimeout(() => r(null), 5000); });
  const ini = await pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  ok('initialize: devuelve la versión del protocolo y las herramientas', ini?.result?.protocolVersion === '2025-06-18' && ini.result.capabilities.tools && ini.result.serverInfo.name === 'diario');
  p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const lista = await pedir('tools/list', {});
  const nombres = lista?.result?.tools?.map((t) => t.name).sort().join();
  ok('las siete herramientas, ninguna borra ni pisa', nombres === 'agregar,backlinks,buscar,crear,enlazar,leer,listar' && lista.result.tools.every((t) => t.annotations.destructiveHint !== true && t.inputSchema.type === 'object'), nombres);
  const leer = await pedir('tools/call', { name: 'leer', arguments: { nota: 'primer parcial de medicinal' } });
  ok('leer por MCP: el texto y quién la nombra', leer?.result?.content?.[0]?.text.includes('Lo mío.') && leer.result.content[0].text.includes(`La nombran: [[${diaDe()}]]`), leer?.result?.content?.[0]?.text);
  const crear = await pedir('tools/call', { name: 'crear', arguments: { titulo: 'Primer parcial de Medicinal', texto: 'pisar' } });
  ok('crear una que existe vuelve como error de la herramienta, sin pisar', crear?.result?.isError === true && !(await d.leer('Primer parcial de Medicinal')).texto.includes('pisar'));
  const nada = await pedir('tools/call', { name: 'leer', arguments: { nota: 'nada' } });
  ok('leer una que no existe: error de la herramienta', nada?.result?.isError === true);
  const raro = await pedir('borrar/todo', {});
  ok('un método que no existe: error de JSON-RPC', raro?.error?.code === -32601);
  p.stdin.end();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} ok, ${fail} fallas`);
if (fail) process.exit(1);

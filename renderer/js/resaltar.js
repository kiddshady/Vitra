/* ═══════════════════════════════════════════════════════════════════════════
   Quartz — el color de los bloques de código del markdown
   Prism (renderer/vendor/prism.js) se carga la primera vez que hace falta,
   y hasta entonces los bloques salen planos. Recortado de la pantalla de
   coder de UmbroSys (piso/pantalla.js).
   ═══════════════════════════════════════════════════════════════════════════ */

import { esc } from './ui.js';

// relativo a renderer/index.html: con «../» no cargaba y el código salía sin colores (UmbroSys 1.3.0)
const PRISM = new URL('vendor/prism.js', document.baseURI).href;

const LENGUAJE = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
  json: 'json', py: 'python', ps1: 'powershell', psm1: 'powershell', sh: 'bash', css: 'css',
  html: 'markup', xml: 'markup', svg: 'markup', md: 'markdown', yml: 'yaml', yaml: 'yaml',
  sql: 'sql', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', java: 'java', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', lua: 'lua',
};

let prism = null;
/** Carga Prism una sola vez. Resuelve con window.Prism, o null si no cargó. */
export function cargarPrism() {
  if (prism) return prism;
  prism = new Promise((resolve) => {
    window.Prism = window.Prism || { manual: true };
    const s = document.createElement('script');
    s.src = PRISM;
    s.onload = () => resolve(window.Prism);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return prism;
}

function pintarCodigo(codigo, lang) {
  const P = window.Prism;
  const g = P?.languages?.[lang];
  if (!g) return esc(codigo);
  try { return P.highlight(codigo, g, lang); } catch { return esc(codigo); }
}

/** Para el markdown (md.js): el bloque coloreado si Prism ya cargó y conoce el
    lenguaje (por su nombre o su extensión), o null para dejarlo plano. */
export function resaltar(codigo, lang) {
  const l = LENGUAJE[lang] || lang;
  return window.Prism?.languages?.[l] ? pintarCodigo(codigo, l) : null;
}

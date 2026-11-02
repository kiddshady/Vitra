'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   Vitra — el Diario de Fran (el núcleo; UmbroSys lleva una copia)
   Diseño de Fran con Sam (1/11/2026), la variante «híbrida»: las tripas son
   archivos .md comunes en una carpeta suya (S:\Diario), que sobreviven a
   cualquier app; la cara es la app Diario del escritorio de su PC, y CC entra
   por un servidor MCP suelto (mcp/diario.cjs) que anda con UmbroSys cerrado.
   Este módulo es lo que comparten los dos: no sabe nada de Electron.

   ── Las notas ──────────────────────────────────────────────────────────────
   · Cada nota es un .md. Su título es el nombre del archivo, como en
     Obsidian: «Parcial de Medicinal.md» se nombra [[Parcial de Medicinal]].
   · La nota de un día va en diario/AAAA-MM-DD.md y se nombra [[2026-11-01]].
   · Arriba puede llevar unos datos (frontmatter) entre dos «---»: fecha y
     etiquetas. Son opcionales: una nota pelada también vale.
   · [[Título]], [[Título|otro texto]] y [[Título#sección]] enlazan con la
     nota de ese título, sin importar mayúsculas ni tildes. Los backlinks («quién
     me menciona») y el grafo se calculan leyendo los archivos.

   ── Lo que nunca pasa ──────────────────────────────────────────────────────
   · Antes de cambiar una nota que existe se guarda lo que había en
     .diario/versiones (las últimas 50 de cada una).
   · Borrar no borra: la nota va a .diario/papelera (y solo desde la app; el
     MCP no borra ni pisa).
   · Guardar desde la app lleva la versión que se abrió (`base`): si alguien
     la cambió en el medio (CC), no se pisa; se avisa (conflicto) y la app
     decide.
   ═══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const OCULTA = '.diario';            // versiones, papelera: lo de la app, no notas
const CARPETA_DIAS = 'diario';
const MAX_CHARS = 2_000_000;         // una nota no es una base de datos
const VERSIONES_POR_NOTA = 50;

/** La carpeta del diario: DIARIO_DIR si está, si no S:\Diario, si no ~/Diario. */
function carpetaPorDefecto(env = process.env) {
  if (env.DIARIO_DIR) return path.resolve(env.DIARIO_DIR);
  if (process.platform === 'win32' && fs.existsSync('S:\\')) return 'S:\\Diario';
  return path.join(os.homedir(), 'Diario');
}

const hashDe = (t) => crypto.createHash('sha1').update(t, 'utf8').digest('hex').slice(0, 16);
// lo de un editor de Windows trae CRLF y a veces BOM: el mismo texto tendría dos versiones
const norm = (t) => String(t ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
/** Para comparar títulos: sin mayúsculas ni tildes, con los espacios juntos. */
const clave = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(`${s}T12:00:00`));
const dos = (n) => String(n).padStart(2, '0');
/** El día de hoy (o de `d`) en la hora local de la UCX, como AAAA-MM-DD. */
const diaDe = (d = new Date()) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Un título sirve de nombre de archivo: sin las letras que Windows no deja,
   sin puntos ni espacios al final y sin los nombres reservados (CON, NUL…). */
function tituloValido(t) {
  const s = String(t ?? '').replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (!s) throw new Error('la nota necesita un título');
  if (s.length > 120) throw new Error('el título es muy largo (más de 120 letras)');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) throw new Error(`«${s}» no puede ser un nombre de archivo en Windows`);
  return s;
}

/* ── El frontmatter: un YAML chiquito (clave: valor, y listas) ─────────────── */
function separarFrontmatter(texto) {
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(texto);
  if (!m) return { datos: {}, cuerpo: texto, crudo: '' };
  const datos = {};
  let lista = null;
  for (const l of m[1].split('\n')) {
    const item = /^\s*-\s+(.*)$/.exec(l);
    if (item && lista) { datos[lista].push(limpiar(item[1])); continue; }
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(l);
    if (!kv) continue;
    const k = kv[1].toLowerCase(), v = kv[2].trim();
    lista = null;
    if (v === '') { datos[k] = []; lista = k; }
    else if (/^\[.*\]$/.test(v)) datos[k] = v.slice(1, -1).split(',').map(limpiar).filter(Boolean);
    else datos[k] = limpiar(v);
  }
  return { datos, cuerpo: texto.slice(m[0].length), crudo: m[0] };
}
const limpiar = (v) => String(v).trim().replace(/^["']|["']$/g, '').trim();
function armarFrontmatter({ fecha, etiquetas }) {
  const l = [];
  if (fecha) l.push(`fecha: ${fecha}`);
  if (etiquetas?.length) l.push(`etiquetas: [${etiquetas.join(', ')}]`);
  return l.length ? `---\n${l.join('\n')}\n---\n\n` : '';
}
const etiquetasDe = (datos) => {
  const e = datos.etiquetas ?? datos.tags ?? [];
  return (Array.isArray(e) ? e : String(e).split(',')).map((x) => String(x).replace(/^#/, '').trim()).filter(Boolean);
};

/* ── Los enlaces ──────────────────────────────────────────────────────────── */
const RE_ENLACE = /\[\[([^\]\n]+?)\]\]/g;
/** El título al que apunta lo de adentro de [[…]]: sin el alias (|) ni la sección (#). */
const destino = (adentro) => adentro.split('|')[0].split('#')[0].trim();
/** Los títulos que nombra un texto, sin los que están adentro de código. */
function enlacesDe(texto) {
  const sinCodigo = texto.replace(/```[\s\S]*?(```|$)/g, '').replace(/`[^`\n]*`/g, '');
  const out = [];
  for (const m of sinCodigo.matchAll(RE_ENLACE)) {
    const d = destino(m[1]);
    if (d && !out.some((x) => clave(x) === clave(d))) out.push(d);
  }
  return out;
}

/* ── Escribir sin pisarse: un .tmp de nombre único y rename con reintentos ── */
let nTmp = 0;
async function escribirAtomico(archivo, texto) {
  await fsp.mkdir(path.dirname(archivo), { recursive: true });
  const tmp = `${archivo}.${process.pid}.${Date.now()}.${++nTmp}.tmp`;
  await fsp.writeFile(tmp, texto, 'utf8');
  for (let i = 0; ; i++) {
    try { await fsp.rename(tmp, archivo); return; } catch (err) {
      if (i >= 6 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        throw err;
      }
      await sleep(30 * 2 ** i);
    }
  }
}

/**
 * El diario en una carpeta.
 * @param {{ dir?: string, vigilar?: boolean }} [o]
 *   vigilar: avisa ('cambio') cuando alguien toca los .md desde afuera (la app lo usa; el MCP no)
 */
function crearDiario({ dir = carpetaPorDefecto(), vigilar = false } = {}) {
  const raiz = path.resolve(dir);
  const ev = new EventEmitter();
  /** @type {Map<string, { mtimeMs: number, size: number, nota: object }>} por ruta relativa */
  const cache = new Map();
  const propias = new Map();   // hash de lo que escribió este proceso, por id: así un cambio se reconoce ajeno

  const rutaDe = (id) => path.join(raiz, ...`${id}.md`.split('/'));
  const idDe = (rel) => rel.replace(/\\/g, '/').replace(/\.md$/i, '');

  async function asegurar() { await fsp.mkdir(path.join(raiz, CARPETA_DIAS), { recursive: true }); }

  /* Todos los .md (menos los de las carpetas ocultas), leyendo de nuevo solo
     los que cambiaron desde la última vez. */
  async function escanear() {
    await asegurar();
    const vistos = new Set();
    async function recorrer(d, rel) {
      let ents;
      try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.name.startsWith('.')) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { await recorrer(path.join(d, e.name), r); continue; }
        if (!e.isFile() || !/\.md$/i.test(e.name)) continue;
        vistos.add(r);
        let st;
        try { st = await fsp.stat(path.join(d, e.name)); } catch { continue; }
        const c = cache.get(r);
        if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) continue;
        let texto;
        try { texto = norm(await fsp.readFile(path.join(d, e.name), 'utf8')); } catch { continue; }
        cache.set(r, { mtimeMs: st.mtimeMs, size: st.size, nota: armarNota(idDe(r), texto, st) });
      }
    }
    await recorrer(raiz, '');
    for (const r of [...cache.keys()]) if (!vistos.has(r)) cache.delete(r);
    return [...cache.values()].map((c) => c.nota);
  }

  function armarNota(id, texto, st) {
    const { datos, cuerpo } = separarFrontmatter(texto);
    const titulo = id.split('/').pop();
    const dia = id.startsWith(`${CARPETA_DIAS}/`) && esFecha(titulo) ? titulo : null;
    const fecha = esFecha(datos.fecha) ? datos.fecha : dia || diaDe(new Date(st.birthtimeMs || st.mtimeMs));
    return {
      id, titulo, dia, fecha,
      etiquetas: etiquetasDe(datos),
      enlaces: enlacesDe(cuerpo),
      texto, hash: hashDe(texto),
      modificada: st.mtimeMs,
      vacia: !cuerpo.trim(),
    };
  }

  const meta = ({ texto, ...m }) => ({ ...m, resumen: resumenDe(texto) });
  function resumenDe(texto) {
    return separarFrontmatter(texto).cuerpo
      .replace(/```[\s\S]*?(```|$)/g, ' ')
      .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  const ordenar = (lista) => lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.modificada - a.modificada));

  /** La nota que nombra `ref`: su título, su id o un día (AAAA-MM-DD o «hoy»). */
  async function buscarNota(ref, notas = null) {
    notas ||= await escanear();
    const r = String(ref ?? '').trim().replace(/^\[\[|\]\]$/g, '');
    if (!r) return null;
    const dia = clave(r) === 'hoy' ? diaDe() : esFecha(r) ? r : null;
    if (dia) return notas.find((n) => n.dia === dia) || null;
    const k = clave(destino(r));
    return notas.find((n) => clave(n.id) === k) || notas.find((n) => clave(n.titulo) === k) || null;
  }
  async function exigir(ref, notas) {
    const n = await buscarNota(ref, notas);
    if (!n) throw new Error(`no hay ninguna nota «${String(ref).trim()}» en el diario`);
    return n;
  }

  /* Antes de cambiar una nota, lo que había queda en .diario/versiones. */
  async function guardarVersion(nota) {
    const d = path.join(raiz, OCULTA, 'versiones', nota.id.replace(/\//g, '__'));
    await fsp.mkdir(d, { recursive: true });
    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.writeFile(path.join(d, `${sello}.md`), nota.texto, 'utf8');
    const viejas = (await fsp.readdir(d)).filter((f) => f.endsWith('.md')).sort();
    for (const f of viejas.slice(0, Math.max(0, viejas.length - VERSIONES_POR_NOTA))) await fsp.rm(path.join(d, f), { force: true }).catch(() => {});
  }

  async function escribir(id, texto, { antes = null } = {}) {
    if (texto.length > MAX_CHARS) throw new Error('la nota es demasiado larga');
    if (antes) await guardarVersion(antes);
    propias.set(id, hashDe(texto));
    await escribirAtomico(rutaDe(id), texto);
    cache.delete(`${id}.md`);
    const [nota] = (await escanear()).filter((n) => n.id === id);
    return nota;
  }

  /* ── Lo que se puede hacer ──────────────────────────────────────────────── */
  const api = {
    dir: raiz,
    on: (...a) => ev.on(...a),
    off: (...a) => ev.off(...a),

    /** Todas las notas, de la más nueva a la más vieja (sin el texto: con un resumen). */
    async listar({ etiqueta = null, desde = null, hasta = null, dias = null, limite = 0 } = {}) {
      let l = ordenar(await escanear());
      if (etiqueta) l = l.filter((n) => n.etiquetas.some((e) => clave(e) === clave(etiqueta)));
      if (desde) l = l.filter((n) => n.fecha >= desde);
      if (hasta) l = l.filter((n) => n.fecha <= hasta);
      if (dias === true) l = l.filter((n) => n.dia);
      if (dias === false) l = l.filter((n) => !n.dia);
      if (limite > 0) l = l.slice(0, limite);
      return l.map(meta);
    },

    /** Una nota entera (con su texto y su hash), o null. */
    async leer(ref) {
      const n = await buscarNota(ref);
      return n ? { ...n } : null;
    },

    /** Quién nombra a `ref`, con el renglón donde la nombra. */
    async backlinks(ref) {
      const notas = await escanear();
      const n = await buscarNota(ref, notas);
      const titulo = n ? n.titulo : destino(String(ref).trim());
      const k = clave(titulo);
      return ordenar(notas.filter((o) => o.id !== n?.id && o.enlaces.some((e) => clave(e) === k)))
        .map((o) => ({
          id: o.id, titulo: o.titulo, dia: o.dia, fecha: o.fecha,
          renglones: o.texto.split('\n').filter((l) => [...l.matchAll(RE_ENLACE)].some((m) => clave(destino(m[1])) === k)).map((l) => l.trim()).slice(0, 3),
        }));
    },

    /** Busca en los títulos y en los textos (sin mayúsculas ni tildes). */
    async buscar(q, { limite = 20 } = {}) {
      const k = clave(q);
      if (!k) return [];
      const out = [];
      for (const n of ordenar(await escanear())) {
        const enTitulo = clave(n.titulo).includes(k);
        const t = clave(n.texto);
        const i = t.indexOf(k);
        if (!enTitulo && i < 0) continue;
        let fragmento = '';
        if (i >= 0) {
          // el renglón donde aparece (las posiciones de `clave` coinciden con las del texto salvo por los espacios)
          const renglon = n.texto.split('\n').find((l) => clave(l).includes(k)) || '';
          fragmento = renglon.trim().slice(0, 200);
        }
        out.push({ id: n.id, titulo: n.titulo, dia: n.dia, fecha: n.fecha, etiquetas: n.etiquetas, fragmento, enTitulo });
      }
      out.sort((a, b) => Number(b.enTitulo) - Number(a.enTitulo));
      return out.slice(0, limite);
    },

    /** Las notas como puntos y los enlaces como líneas. Lo que se nombra y no existe es un punto «fantasma». */
    async grafo() {
      const notas = await escanear();
      const porClave = new Map();
      for (const n of notas) { porClave.set(clave(n.id), n.id); if (!porClave.has(clave(n.titulo))) porClave.set(clave(n.titulo), n.id); }
      const nodos = notas.map((n) => ({ id: n.id, titulo: n.titulo, dia: n.dia, etiquetas: n.etiquetas }));
      const fantasmas = new Map();
      const aristas = [];
      const ya = new Set();
      for (const n of notas) {
        for (const e of n.enlaces) {
          let a = porClave.get(clave(e));
          if (!a) {
            const k = `?${clave(e)}`;
            if (!fantasmas.has(k)) fantasmas.set(k, { id: k, titulo: e, fantasma: true, etiquetas: [] });
            a = k;
          }
          if (a === n.id) continue;
          const par = [n.id, a].sort().join('\u0000');
          if (ya.has(par)) continue;
          ya.add(par);
          aristas.push([n.id, a]);
        }
      }
      return { nodos: [...nodos, ...fantasmas.values()], aristas };
    },

    /** Crea una nota nueva. Nunca reemplaza una que ya existe. */
    async crear({ titulo, texto = '', etiquetas = [], fecha = null } = {}) {
      const notas = await escanear();
      const dia = clave(titulo) === 'hoy' ? diaDe() : esFecha(titulo) ? String(titulo) : null;
      const t = dia || tituloValido(titulo);
      const ya = await buscarNota(t, notas);
      if (ya) throw new Error(`ya hay una nota «${ya.titulo}»: no se pisa (usá agregar para sumarle texto)`);
      const id = dia ? `${CARPETA_DIAS}/${dia}` : t;
      if (fs.existsSync(rutaDe(id))) throw new Error(`ya existe ${rutaDe(id)}`);
      const cuerpo = norm(texto).replace(/^\n+/, '');
      // la fecha va arriba solo si se pide: si no, sale del archivo (una nota nueva no arranca con datos encima)
      const fm = armarFrontmatter({ fecha: !dia && esFecha(fecha) ? fecha : null, etiquetas: etiquetas.map((e) => String(e).replace(/^#/, '').trim()).filter(Boolean) });
      return escribir(id, `${fm}${cuerpo}${cuerpo && !cuerpo.endsWith('\n') ? '\n' : ''}`);
    },

    /** La nota de un día (hoy si no se dice), creada vacía si no estaba. */
    async dia(fecha = diaDe()) {
      const f = clave(fecha) === 'hoy' ? diaDe() : fecha;
      if (!esFecha(f)) throw new Error(`«${fecha}» no es una fecha AAAA-MM-DD`);
      return (await buscarNota(f)) || api.crear({ titulo: f });
    },

    /** Suma texto al final de una nota. Si es un día y no está, la crea. */
    async agregar(ref, texto) {
      const t = norm(texto).trim();
      if (!t) throw new Error('no hay nada para agregar');
      const notas = await escanear();
      let n = await buscarNota(ref, notas);
      const r = String(ref ?? '').trim();
      if (!n && (clave(r) === 'hoy' || esFecha(r))) n = await api.dia(r);
      if (!n) throw new Error(`no hay ninguna nota «${r}» en el diario (creala primero)`);
      const base = n.texto.replace(/\s+$/, '');
      return escribir(n.id, `${base}${base ? '\n\n' : ''}${t}\n`, { antes: n.texto ? n : null });
    },

    /** Suma un [[enlace]] de una nota a otra (al final). Si ya la nombra, no hace nada. */
    async enlazar(desde, hacia) {
      const notas = await escanear();
      const n = await exigir(desde, notas);
      const h = await buscarNota(hacia, notas);
      const titulo = h ? h.titulo : tituloValido(destino(String(hacia)));
      if (n.enlaces.some((e) => clave(e) === clave(titulo))) return { ...n, yaEstaba: true };
      return api.agregar(n.id, `[[${titulo}]]`);
    },

    /**
     * Guarda el texto entero (la app). `base` es el hash que se abrió: si en
     * el disco hay otro, no se pisa y vuelve { conflicto, nota } con lo de ahora.
     */
    async guardar(ref, texto, { base = null } = {}) {
      const notas = await escanear();
      const n = await exigir(ref, notas);
      const t = norm(texto);
      if (t === n.texto) return { nota: n };
      if (base && base !== n.hash) return { conflicto: true, nota: n };
      return { nota: await escribir(n.id, t, { antes: n }) };
    },

    /** Le cambia el título a una nota y corrige los [[ ]] que la nombran (la app). */
    async renombrar(ref, nuevo) {
      const notas = await escanear();
      const n = await exigir(ref, notas);
      if (n.dia) throw new Error('las notas de los días se llaman por su fecha');
      const t = tituloValido(nuevo);
      if (t === n.titulo) return { nota: n, corregidas: 0 };
      const otra = await buscarNota(t, notas);
      if (otra && otra.id !== n.id) throw new Error(`ya hay una nota «${otra.titulo}»`);
      const id = n.id.includes('/') ? `${n.id.slice(0, n.id.lastIndexOf('/'))}/${t}` : t;
      await guardarVersion(n);
      propias.set(id, n.hash);
      await fsp.rename(rutaDe(n.id), rutaDe(id));
      let corregidas = 0;
      const k = clave(n.titulo);
      for (const o of notas) {
        if (o.id === n.id || !o.enlaces.some((e) => clave(e) === k)) continue;
        const nuevoTexto = o.texto.replace(RE_ENLACE, (todo, adentro) => {
          if (clave(destino(adentro)) !== k) return todo;
          const resto = adentro.slice(adentro.split('|')[0].split('#')[0].length);
          return `[[${t}${resto}]]`;
        });
        if (nuevoTexto !== o.texto) { await escribir(o.id, nuevoTexto, { antes: o }); corregidas++; }
      }
      cache.delete(`${n.id}.md`);
      const [nota] = (await escanear()).filter((x) => x.id === id);
      return { nota, corregidas };
    },

    /** Manda una nota a .diario/papelera (la app). No se borra nada de verdad. */
    async aPapelera(ref) {
      const n = await exigir(ref);
      const d = path.join(raiz, OCULTA, 'papelera');
      await fsp.mkdir(d, { recursive: true });
      const sello = new Date().toISOString().replace(/[:.]/g, '-');
      await fsp.rename(rutaDe(n.id), path.join(d, `${n.id.replace(/\//g, '__')} (${sello}).md`));
      cache.delete(`${n.id}.md`);
      return true;
    },

    /**
     * El texto de las notas que nombra un pedido ([[…]]), para adjuntárselo a
     * un agente. Sincrónico (lo usa el piso al encargar una tarea); las que no
     * existen se saltean.
     */
    adjuntos(texto, { maxPorNota = 20000 } = {}) {
      const titulos = enlacesDe(String(texto || ''));
      if (!titulos.length) return [];
      const out = [];
      const todos = [];
      (function recorrer(d, rel) {
        let ents = [];
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          if (e.name.startsWith('.')) continue;
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) recorrer(path.join(d, e.name), r);
          else if (/\.md$/i.test(e.name)) todos.push(idDe(r));
        }
      })(raiz, '');
      for (const t of titulos) {
        const k = clave(t);
        const dia = esFecha(t) ? t : k === 'hoy' ? diaDe() : null;
        const id = dia ? todos.find((x) => x === `${CARPETA_DIAS}/${dia}`) : (todos.find((x) => clave(x) === k) || todos.find((x) => clave(x.split('/').pop()) === k));
        if (!id || out.some((o) => o.id === id)) continue;
        try {
          const txt = norm(fs.readFileSync(rutaDe(id), 'utf8'));
          out.push({ id, titulo: id.split('/').pop(), texto: txt.length > maxPorNota ? `${txt.slice(0, maxPorNota)}\n[…recortada]` : txt });
        } catch { /* se la llevaron en el medio */ }
      }
      return out;
    },

    cerrar() { vigia?.close(); vigia = null; clearTimeout(tVigia); },
  };

  /* ── Vigilar la carpeta: lo que cambie afuera (CC por el MCP, un editor) ── */
  let vigia = null, tVigia = null;
  const tocadas = new Set();
  if (vigilar) {
    try {
      fs.mkdirSync(path.join(raiz, CARPETA_DIAS), { recursive: true });
      vigia = fs.watch(raiz, { recursive: true }, (_tipo, archivo) => {
        const rel = String(archivo || '').replace(/\\/g, '/');
        if (!rel || rel.split('/').some((p) => p.startsWith('.')) || !/\.md$/i.test(rel)) return;
        tocadas.add(idDe(rel));
        clearTimeout(tVigia);
        tVigia = setTimeout(avisar, 150);
      });
      vigia.on('error', () => {});
    } catch { vigia = null; }
  }
  async function avisar() {
    const ids = [...tocadas];
    tocadas.clear();
    const notas = await escanear().catch(() => null);
    if (!notas) return;
    const cambios = ids.map((id) => {
      const n = notas.find((x) => x.id === id);
      // lo que escribió este mismo proceso no es «de afuera»
      const propia = n && propias.get(id) === n.hash;
      return { id, existe: !!n, hash: n?.hash || null, desde: propia ? 'app' : 'afuera' };
    });
    if (cambios.length) ev.emit('cambio', cambios);
  }

  return api;
}

module.exports = { crearDiario, carpetaPorDefecto, enlacesDe, separarFrontmatter, clave, diaDe, esFecha, tituloValido, hashDe, CARPETA_DIAS, OCULTA };

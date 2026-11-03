#!/usr/bin/env node
'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   Viper — el servidor MCP del Diario (nació en UmbroSys)
   El enchufe para que Claude Code lea, busque, cree y enlace notas del diario
   de Fran (src/diario.cjs), con Viper o UmbroSys abiertos o cerrados. Es un
   programita que Claude Code arranca solo y le habla por stdin/stdout (JSON-RPC, un
   mensaje por renglón). Sin dependencias: node pelado.

   Se conecta una vez, para todas las sesiones de la UCX:
     claude mcp add --scope user diario -- node S:\tools\Vitra\mcp\diario.cjs
   (la carpeta sale de DIARIO_DIR, o S:\Diario por defecto).

   Las herramientas de escritura no pueden borrar ni pisar: crear nunca
   reemplaza una nota, agregar suma al final y enlazar solo suma un [[ ]].
   Antes de cada cambio lo que había queda en .diario/versiones.
   ═══════════════════════════════════════════════════════════════════════════ */

const path = require('path');
const { crearDiario, diaDe } = require(path.join(__dirname, '..', 'src', 'diario.cjs'));
const VERSION = require(path.join(__dirname, '..', 'package.json')).version;

const diario = crearDiario();

const INSTRUCCIONES = `El diario personal de Fran: notas Markdown en ${diario.dir}. Cada nota se nombra por su título, y las de cada día por su fecha (AAAA-MM-DD; «hoy» también vale). [[Título]] enlaza una nota con otra. Leé y buscá con libertad cuando Fran te lo pida o te lo nombre; escribí solo lo que él te pida que anotes. No hay herramientas para borrar ni para reescribir una nota: crear nunca pisa, agregar suma al final y enlazar suma un [[ ]].`;

const texto = { type: 'string' };
const HERRAMIENTAS = [
  {
    name: 'buscar',
    description: 'Busca en los títulos y en el texto de las notas del diario, sin importar mayúsculas ni tildes. Devuelve las notas con el renglón donde aparece.',
    inputSchema: { type: 'object', properties: { texto: { ...texto, description: 'Qué buscar' }, limite: { type: 'integer', minimum: 1, maximum: 100, description: 'Cuántas como mucho (20 si no se dice)' } }, required: ['texto'] },
    annotations: { title: 'Buscar en el diario', readOnlyHint: true, openWorldHint: false },
    correr: async ({ texto: q, limite }) => {
      const r = await diario.buscar(q, { limite: limite || 20 });
      if (!r.length) return `No hay notas que digan «${q}».`;
      return r.map((n) => `- [[${n.titulo}]] (${n.fecha})${n.etiquetas.length ? ` #${n.etiquetas.join(' #')}` : ''}${n.fragmento ? `\n  ${n.fragmento}` : ''}`).join('\n');
    },
  },
  {
    name: 'leer',
    description: 'Lee una nota entera del diario por su título, o la de un día por su fecha (AAAA-MM-DD o «hoy»). Al final dice qué notas la nombran (backlinks).',
    inputSchema: { type: 'object', properties: { nota: { ...texto, description: 'El título de la nota, o una fecha AAAA-MM-DD, o «hoy»' } }, required: ['nota'] },
    annotations: { title: 'Leer una nota', readOnlyHint: true, openWorldHint: false },
    correr: async ({ nota }) => {
      const n = await diario.leer(nota);
      if (!n) return { error: `No hay ninguna nota «${nota}» en el diario.` };
      const bl = await diario.backlinks(n.id);
      return `# ${n.titulo}\n(${n.id}.md · ${n.fecha}${n.etiquetas.length ? ` · #${n.etiquetas.join(' #')}` : ''})\n\n${n.texto.trim() || '(vacía)'}\n\n---\nLa nombran: ${bl.length ? bl.map((b) => `[[${b.titulo}]]`).join(', ') : 'ninguna'}`;
    },
  },
  {
    name: 'listar',
    description: 'Lista las notas del diario, de la más nueva a la más vieja, con un resumen. Se puede filtrar por etiqueta, por fechas o solo los días.',
    inputSchema: {
      type: 'object',
      properties: {
        etiqueta: { ...texto, description: 'Solo las que llevan esta etiqueta' },
        desde: { ...texto, description: 'Desde esta fecha (AAAA-MM-DD)' },
        hasta: { ...texto, description: 'Hasta esta fecha (AAAA-MM-DD)' },
        solo: { type: 'string', enum: ['todas', 'dias', 'notas'], description: 'dias: solo las notas de cada día; notas: solo las que no son de un día' },
        limite: { type: 'integer', minimum: 1, maximum: 500, description: 'Cuántas como mucho (50 si no se dice)' },
      },
    },
    annotations: { title: 'Listar notas', readOnlyHint: true, openWorldHint: false },
    correr: async ({ etiqueta, desde, hasta, solo, limite }) => {
      const l = await diario.listar({ etiqueta, desde, hasta, dias: solo === 'dias' ? true : solo === 'notas' ? false : null, limite: limite || 50 });
      if (!l.length) return 'No hay notas con eso.';
      return l.map((n) => `- [[${n.titulo}]] (${n.fecha})${n.etiquetas.length ? ` #${n.etiquetas.join(' #')}` : ''}${n.resumen ? ` — ${n.resumen}` : ''}`).join('\n');
    },
  },
  {
    name: 'backlinks',
    description: 'Qué notas del diario nombran a una nota ([[ella]]), con el renglón donde la nombran.',
    inputSchema: { type: 'object', properties: { nota: { ...texto, description: 'El título de la nota (o la fecha de un día)' } }, required: ['nota'] },
    annotations: { title: 'Quién la nombra', readOnlyHint: true, openWorldHint: false },
    correr: async ({ nota }) => {
      const bl = await diario.backlinks(nota);
      if (!bl.length) return `Ninguna nota nombra a [[${nota}]].`;
      return bl.map((b) => `- [[${b.titulo}]] (${b.fecha})\n${b.renglones.map((r) => `  > ${r}`).join('\n')}`).join('\n');
    },
  },
  {
    name: 'crear',
    description: 'Crea una nota nueva en el diario. Nunca reemplaza una que ya existe (si existe, falla: usá agregar). Para la nota de un día, el título es la fecha AAAA-MM-DD o «hoy».',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { ...texto, description: 'El título (es el nombre del archivo y como se la nombra con [[ ]])' },
        texto: { ...texto, description: 'El contenido, en Markdown. Puede nombrar otras notas con [[Título]].' },
        etiquetas: { type: 'array', items: texto, description: 'Etiquetas, sin #' },
      },
      required: ['titulo'],
    },
    annotations: { title: 'Crear una nota', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    correr: async ({ titulo, texto: t, etiquetas }) => {
      const n = await diario.crear({ titulo, texto: t || '', etiquetas: etiquetas || [] });
      return `Listo: creé [[${n.titulo}]] (${n.id}.md).`;
    },
  },
  {
    name: 'agregar',
    description: `Suma texto al final de una nota del diario, sin tocar lo que ya tiene. Si es un día (AAAA-MM-DD o «hoy», que es ${diaDe()}) y todavía no existe, la crea.`,
    inputSchema: {
      type: 'object',
      properties: {
        nota: { ...texto, description: 'El título de la nota, o una fecha AAAA-MM-DD, o «hoy»' },
        texto: { ...texto, description: 'Lo que se suma, en Markdown' },
      },
      required: ['nota', 'texto'],
    },
    annotations: { title: 'Agregar a una nota', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    correr: async ({ nota, texto: t }) => {
      const n = await diario.agregar(nota, t);
      return `Listo: lo sumé al final de [[${n.titulo}]].`;
    },
  },
  {
    name: 'enlazar',
    description: 'Enlaza una nota con otra: suma [[hacia]] al final de la nota «desde». Si ya la nombra, no hace nada. La nota «hacia» puede no existir todavía.',
    inputSchema: {
      type: 'object',
      properties: { desde: { ...texto, description: 'La nota donde va el enlace' }, hacia: { ...texto, description: 'La nota a la que apunta' } },
      required: ['desde', 'hacia'],
    },
    annotations: { title: 'Enlazar dos notas', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    correr: async ({ desde, hacia }) => {
      const n = await diario.enlazar(desde, hacia);
      return n.yaEstaba ? `[[${n.titulo}]] ya nombraba a [[${hacia}]].` : `Listo: [[${n.titulo}]] ahora nombra a [[${hacia}]].`;
    },
  },
];

/* ── JSON-RPC por stdio: un mensaje por renglón ─────────────────────────────── */
const responder = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
const fallar = (id, code, message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);

async function atender(m) {
  const { id, method, params } = m;
  const esPedido = id !== undefined && id !== null;
  try {
    switch (method) {
      case 'initialize':
        return responder(id, {
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'diario', title: 'El Diario de Fran (Viper)', version: VERSION },
          instructions: INSTRUCCIONES,
        });
      case 'ping':
        return esPedido && responder(id, {});
      case 'tools/list':
        return responder(id, { tools: HERRAMIENTAS.map(({ correr, ...h }) => h) });
      case 'tools/call': {
        const h = HERRAMIENTAS.find((x) => x.name === params?.name);
        if (!h) return fallar(id, -32602, `no existe la herramienta ${params?.name}`);
        try {
          const r = await h.correr(params.arguments || {});
          if (r && typeof r === 'object' && r.error) return responder(id, { content: [{ type: 'text', text: r.error }], isError: true });
          return responder(id, { content: [{ type: 'text', text: String(r) }] });
        } catch (err) {
          return responder(id, { content: [{ type: 'text', text: `No se pudo: ${err?.message || err}` }], isError: true });
        }
      }
      default:
        // las notificaciones (sin id) no se contestan
        if (esPedido) fallar(id, -32601, `método desconocido: ${method}`);
    }
  } catch (err) {
    if (esPedido) fallar(id, -32603, String(err?.message || err));
  }
}

let resto = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (trozo) => {
  resto += trozo;
  let i;
  while ((i = resto.indexOf('\n')) >= 0) {
    const renglon = resto.slice(0, i).trim();
    resto = resto.slice(i + 1);
    if (!renglon) continue;
    let m;
    try { m = JSON.parse(renglon); } catch { fallar(null, -32700, 'no es JSON'); continue; }
    if (Array.isArray(m)) m.forEach(atender); else atender(m);
  }
});
process.stdin.on('end', () => process.exit(0));

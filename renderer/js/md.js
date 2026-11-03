/* ═══════════════════════════════════════════════════════════════════════════
   Viper — markdown a HTML (de UmbroSys)
   Para los mails de los agentes (la app Mail) y las notas del pizarrón. Lo
   que escriben puede traer cosas de la web, así que nada del texto pasa como
   HTML: todo se escapa y solo se arman las etiquetas que este archivo conoce.
   Los links solo valen con http(s) y abren en el navegador (main.cjs los
   manda afuera); cualquier otro queda como texto.

   Lo que entiende (lo que escriben los agentes, no todo CommonMark):
   títulos #, párrafos (un renglón suelto es un salto, como en un chat), **negrita**, *cursiva*, ~~tachado~~, `código`, bloques
   ``` con lenguaje, listas con - * + o 1. (anidadas por sangría, con [ ] y
   [x]), citas >, separadores ---, tablas con | y links [texto](url).

   Y, solo si se pide (`wiki`, el Diario), los enlaces entre notas
   [[Título]], [[Título|otro texto]] y [[Título#sección]]: salen como
   <a class="md-wiki" data-nota="Título">, y la app decide qué hace el clic.
   Sin `wiki` (los mails) quedan como texto.
   ═══════════════════════════════════════════════════════════════════════════ */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Con qué se resuelve un [[enlace]] mientras dura un md() con `wiki`
   (md() es sincrónico: se pone al entrar y se saca al salir). */
let wikiActual = null;
function enlaceWiki(adentro) {
  const [destino, alias] = adentro.split('|');
  const titulo = destino.split('#')[0].trim();
  if (!titulo) return null;
  const existe = wikiActual(titulo) !== false;
  const texto = (alias ?? destino).trim() || titulo;
  return `<a href="#" class="md-wiki${existe ? '' : ' is-fantasma'}" data-nota="${esc(titulo)}" data-tip="${esc(existe ? titulo : `${titulo}: todavía no existe, un clic la crea`)}">${esc(texto)}</a>`;
}

/* Lo de adentro de un renglón. Primero se apartan el código y los links (su
   contenido no se toca), después se escapa, y al final se marcan los énfasis. */
function enLinea(texto) {
  const apartados = [];
  const apartar = (html) => `\u0000${apartados.push(html) - 1}\u0000`;
  let t = String(texto)
    .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _c, c) => apartar(`<code>${esc(c.trim())}</code>`))
    .replace(/\[\[([^\]\n]+?)\]\]/g, (todo, adentro) => {
      const h = wikiActual && enlaceWiki(adentro);
      return h ? apartar(h) : todo;
    })
    .replace(/\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (todo, txt, url) => (/^https?:\/\//i.test(url)
      ? apartar(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-tip="${esc(url)}">${enfasis(esc(txt))}</a>`)
      : todo));
  t = enfasis(esc(t));
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => apartados[Number(i)]);
}
function enfasis(t) {
  return t
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
}

const RE = {
  titulo: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
  cerca: /^(\s*)(`{3,}|~{3,})\s*([\w+#.-]*)/,
  separador: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
  cita: /^\s{0,3}>\s?/,
  item: /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/,
  fila: /^\s*\|.*\|\s*$/,
  alineacion: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
};
const celdas = (r) => r.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
const sangria = (s) => s.replace(/\t/g, '    ').length;

/**
 * El markdown de `texto`, como HTML seguro.
 * @param {string} texto
 * @param {{ resaltar?: (codigo: string, lang: string) => string|null, wiki?: (titulo: string) => boolean }} [o]
 *   resaltar: colorea un bloque de código (devuelve HTML ya escapado, o null para dejarlo plano)
 *   wiki: arma los [[enlaces]]; dice si la nota existe (false: sale como fantasma)
 */
export function md(texto, { resaltar = null, wiki = null } = {}) {
  const r = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
  wikiActual = wiki;
  try { return bloques(r, resaltar); } finally { wikiActual = null; }
}

function bloques(r, resaltar) {
  const out = [];
  let i = 0;
  const parrafo = [];
  const cerrarParrafo = () => {
    if (!parrafo.length) return;
    // un renglón suelto es un salto de renglón, como en un chat: las notas que
    // escribe Fran en el pizarrón conservan sus renglones
    out.push(`<p>${enLinea(parrafo.join('\n')).replace(/\n/g, '<br>')}</p>`);
    parrafo.length = 0;
  };
  while (i < r.length) {
    const l = r[i];
    if (!l.trim()) { cerrarParrafo(); i++; continue; }
    let m;
    // un bloque de código: hasta la cerca igual o el final
    if ((m = RE.cerca.exec(l))) {
      cerrarParrafo();
      const cerca = m[2], lang = m[3].toLowerCase(), codigo = [];
      i++;
      while (i < r.length && !r[i].trim().startsWith(cerca)) codigo.push(r[i++]);
      i++;
      const c = codigo.join('\n');
      const html = (lang && resaltar?.(c, lang)) || esc(c);
      out.push(`<pre class="md-codigo"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${html}</code></pre>`);
      continue;
    }
    if ((m = RE.titulo.exec(l))) {
      cerrarParrafo();
      const n = m[1].length;
      // «## 14:32»: la hora de una entrada del día (src/diario.cjs), no un título más
      const hora = n === 2 && /^\d{1,2}:\d{2}$/.test(m[2]);
      out.push(hora ? `<h2 class="md-hora"><time>${m[2]}</time></h2>` : `<h${n}>${enLinea(m[2])}</h${n}>`);
      i++; continue;
    }
    if (RE.separador.test(l) && !parrafo.length) { out.push('<hr>'); i++; continue; }
    if (RE.cita.test(l)) {
      cerrarParrafo();
      const cita = [];
      while (i < r.length && r[i].trim() && RE.cita.test(r[i])) cita.push(r[i++].replace(RE.cita, ''));
      out.push(`<blockquote>${bloques(cita, resaltar)}</blockquote>`);
      continue;
    }
    // una tabla: la fila de los títulos, la de la alineación y las demás
    if (RE.fila.test(l) && i + 1 < r.length && RE.alineacion.test(r[i + 1])) {
      cerrarParrafo();
      const cab = celdas(l);
      const ali = celdas(r[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : ''));
      i += 2;
      const filas = [];
      while (i < r.length && RE.fila.test(r[i])) filas.push(celdas(r[i++]));
      const td = (tag, c, k) => `<${tag}${ali[k] ? ` style="text-align:${ali[k]}"` : ''}>${enLinea(c)}</${tag}>`;
      out.push(`<div class="md-tabla"><table><thead><tr>${cab.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>${
        filas.map((f) => `<tr>${cab.map((_, k) => td('td', f[k] ?? '', k)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (RE.item.test(l)) {
      cerrarParrafo();
      const [html, j] = lista(r, i, resaltar);
      out.push(html);
      i = j;
      continue;
    }
    parrafo.push(l.trim());
    i++;
  }
  cerrarParrafo();
  return out.join('');
}

/* Una lista desde el renglón i: sus ítems a la sangría del primero; lo que
   viene más adentro es del ítem (una sublista, un párrafo más). */
function lista(r, i, resaltar) {
  const m0 = RE.item.exec(r[i]);
  const base = sangria(m0[1]);
  const ordenada = /\d/.test(m0[2]);
  const desde = ordenada ? parseInt(m0[2], 10) : 1;
  const items = [];
  while (i < r.length) {
    const m = RE.item.exec(r[i]);
    if (!m || sangria(m[1]) !== base || /\d/.test(m[2]) !== ordenada) break;
    const cuerpo = [m[3]];
    const adentro = sangria(m[1]) + m[2].length + 1; // dónde empieza el texto del ítem
    i++;
    while (i < r.length) {
      const l = r[i], s = sangria(l.match(/^\s*/)[0]);
      if (!l.trim()) {
        // un renglón vacío sigue en el ítem solo si lo que viene está más adentro
        const sig = r.slice(i + 1).find((x) => x.trim());
        if (sig && sangria(sig.match(/^\s*/)[0]) > base) { cuerpo.push(''); i++; continue; }
        break;
      }
      if (s > base) { cuerpo.push(l.replace(/\t/g, '    ').slice(Math.min(s, adentro))); i++; continue; } // una sublista, un párrafo más
      if (RE.item.test(l) || RE.titulo.test(l) || RE.cerca.test(l) || RE.fila.test(l) || RE.cita.test(l) || cuerpo.at(-1) === '') break;
      cuerpo[cuerpo.length - 1] += ` ${l.trim()}`; // el renglón sigue sin sangría: es el mismo párrafo
      i++;
    }
    items.push(cuerpo);
  }
  const lis = items.map((c) => {
    let primero = c[0];
    let tarea = '';
    const t = /^\[([ xX])\]\s+/.exec(primero);
    if (t) { tarea = `<span class="md-tarea${t[1] === ' ' ? '' : ' is-hecha'}" aria-hidden="true"></span>`; primero = primero.slice(t[0].length); }
    const resto = c.slice(1);
    const sub = resto.length ? bloques(resto, resaltar) : '';
    return `<li${tarea ? ' class="md-item-tarea"' : ''}>${tarea}${enLinea(primero)}${sub}</li>`;
  }).join('');
  return [ordenada ? `<ol${desde !== 1 ? ` start="${desde}"` : ''}>${lis}</ol>` : `<ul>${lis}</ul>`, i];
}

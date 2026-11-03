'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   La marca de Quartz: «El corte». Un cristal de cuarzo cortado de través,
   con sus capas de crecimiento como los anillos de un tronco: cada hexágono
   es una forma que tuvo el cristal mientras crecía, y la más nueva es la de
   afuera. La eligió Fran en la maqueta S:\mockups\quartz (3/11/2026).
   Hasta la 0.4.0 (Viper) era el ojo de víbora en un grafo hexagonal.

   Es el ÚNICO dibujo: de acá salen el ícono (tools/icono.cjs, con baldosa),
   la marca de la titlebar y el splash (sin baldosa, en renderer/index.html).
   Así no pueden desfasarse.

   Lienzo de 512. La baldosa va a sangre, radio 97 (19 %), sin borde. Sin
   feGaussianBlur (librsvg no lo dibuja): el resplandor es un gradiente radial.
   ═══════════════════════════════════════════════════════════════════════════ */

const AMBAR = '255 184 64';   // el acento (tokens.css, --op-accent-rgb)

const rgba = (v, a) => `rgba(${v.split(' ').join(',')},${a})`;
/** El acento llevado hacia el blanco: t = 0 es el ámbar, t = 1 el blanco. */
const hacia = (v, t) => v.split(' ').map(Number).map((x) => Math.round(x + (255 - x) * t)).join(' ');

/** Un hexágono de punta arriba centrado en el lienzo. */
const hexagono = (r) => Array.from({ length: 6 }, (_, i) => {
  const t = (30 + i * 60) * Math.PI / 180;
  return `${(256 + r * Math.cos(t)).toFixed(1)} ${(256 + r * Math.sin(t)).toFixed(1)}`;
}).join(' ');

/** Las capas, de la de afuera (la más nueva, la más tenue) al núcleo (el más claro). */
const CAPAS = [196, 160, 126, 94, 64, 36];

/**
 * El SVG de la marca.
 * @param {{ baldosa?: boolean, encuadre?: string, id?: string, tam?: number }} o
 *   baldosa: con la baldosa (el ícono) o el dibujo solo (titlebar, splash)
 *   encuadre: otro viewBox para acercar el dibujo cuando va sin baldosa
 *   id: prefijo de los ids (dos copias en el mismo documento no pueden compartirlos)
 */
function marca({ baldosa = true, encuadre = '0 0 512 512', id = 'qz', tam = null } = {}) {
  const k = (n) => `${id}-${n}`;
  const medida = tam ? ` width="${tam}" height="${tam}"` : '';
  const capas = CAPAS.map((r, i) => {
    const t = i / (CAPAS.length - 1);
    return `<polygon points="${hexagono(r)}" fill="${rgba(hacia(AMBAR, t * .7), (.16 + t * .6).toFixed(3))}" stroke="#0a0908" stroke-opacity=".55" stroke-width="5" stroke-linejoin="round"/>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${encuadre}"${medida}><defs>
<radialGradient id="${k('b')}" cx="50%" cy="34%" r="80%"><stop offset="0" stop-color="#1b1712"/><stop offset="1" stop-color="#0a0908"/></radialGradient>
<radialGradient id="${k('h')}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${rgba(AMBAR, .24)}"/><stop offset="1" stop-color="${rgba(AMBAR, 0)}"/></radialGradient>
<clipPath id="${k('c')}"><rect width="512" height="512" rx="97"/></clipPath>
</defs><g clip-path="url(#${k('c')})">${baldosa ? `<rect width="512" height="512" fill="url(#${k('b')})"/>` : ''}
<circle cx="256" cy="256" r="220" fill="url(#${k('h')})"/>
${capas}
</g></svg>`;
}

/** Sin baldosa el dibujo ocupa el centro del lienzo: este encuadre lo acerca sin cambiarlo
    (los vértices de arriba y abajo llegan a y = 60 y 452). */
const ENCUADRE_SUELTO = '40 40 432 432';

module.exports = { marca, ENCUADRE_SUELTO, AMBAR };

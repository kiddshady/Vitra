'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   La marca de Viper: el ojo de víbora en el centro de un grafo hexagonal.
   La hizo Fran (3/11/2026, C:\Users\francisco\Desktop\viper-icon\icon.svg) y
   va tal cual: los mismos números de su SVG. Antes era la V enroscada.

   Es el ÚNICO dibujo: de acá salen el ícono (tools/icono.cjs, con baldosa),
   la marca de la titlebar y el splash (sin baldosa, en renderer/index.html).
   Así no pueden desfasarse.

   Lienzo de 512. La baldosa va a sangre, radio 97 (19 %), sin borde.
   ═══════════════════════════════════════════════════════════════════════════ */

const VERDE = '156 230 80';   // el acento (tokens.css, --op-accent-rgb)
const v = VERDE.split(' ').join(',');

const NODOS = [[256.0, 80.0], [408.4, 168.0], [408.4, 344.0], [256.0, 432.0], [103.6, 344.0], [103.6, 168.0]];

/**
 * El SVG de la marca.
 * @param {{ baldosa?: boolean, encuadre?: string, id?: string, tam?: number }} o
 *   baldosa: con la baldosa (el ícono) o el dibujo solo (titlebar, splash)
 *   encuadre: otro viewBox para acercar el dibujo cuando va sin baldosa
 *   id: prefijo de los ids (dos copias en el mismo documento no pueden compartirlos)
 */
function marca({ baldosa = true, encuadre = '0 0 512 512', id = 'vp', tam = null } = {}) {
  const k = (n) => `${id}-${n}`;
  const medida = tam ? ` width="${tam}" height="${tam}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${encuadre}"${medida}><defs>
<radialGradient id="${k('b')}" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#101c15"/><stop offset="1" stop-color="#050806"/></radialGradient>
<clipPath id="${k('c')}"><rect width="512" height="512" rx="97"/></clipPath>
<radialGradient id="${k('i')}" cx="46%" cy="44%" r="60%"><stop offset="0" stop-color="#ffe08a"/><stop offset=".45" stop-color="#ffb43c"/><stop offset="1" stop-color="#a85410"/></radialGradient>
</defs><g clip-path="url(#${k('c')})">${baldosa ? `<rect width="512" height="512" fill="url(#${k('b')})"/>` : ''}
<path d="M${NODOS.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}z" fill="none" stroke="rgba(${v},0.28)" stroke-width="7" stroke-linejoin="round"/>
<path d="${NODOS.map(([x, y]) => `M256 256L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" fill="none" stroke="rgba(${v},0.5)" stroke-width="10" stroke-linecap="round"/>
${NODOS.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="30" fill="rgb(${v})"/>`).join('')}
<circle cx="256" cy="256" r="104" fill="#050806"/>
<circle cx="256" cy="256" r="88" fill="url(#${k('i')})"/>
<circle cx="256" cy="256" r="63.36" fill="none" stroke="#000" stroke-opacity=".14" stroke-width="4.4"/>
<circle cx="256" cy="256" r="85.36" fill="none" stroke="#2a1404" stroke-opacity=".55" stroke-width="5.28"/>
<path d="M256 172.4c-20.68 39.6 -20.68 127.6 0 167.2c20.68 -39.6 20.68 -127.6 0 -167.2z" fill="#050806"/>
<ellipse cx="290.32" cy="219.92" rx="15.84" ry="10.12" fill="#fff" opacity=".55" transform="rotate(-28 290.32 219.92)"/>
</g></svg>`;
}

/** Sin baldosa el dibujo ocupa el centro del lienzo: este encuadre lo acerca sin cambiarlo
    (los nodos de arriba y abajo llegan a y = 50 y 462). */
const ENCUADRE_SUELTO = '40 40 432 432';

module.exports = { marca, ENCUADRE_SUELTO, VERDE };

'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   La marca de Viper: la V enroscada con la cola en espiral (elegida por Fran
   el 3/11/2026 en S:\mockups\viper, entre siete variantes de la V y seis del
   ojo). Es el ÚNICO dibujo: de acá salen el ícono (tools/icono.cjs, con
   baldosa), la marca de la titlebar y el splash (sin baldosa, en
   renderer/index.html). Así no pueden desfasarse.

   Lienzo de 512. La baldosa va a sangre, radio 97 (19 %), sin borde. Las
   escamas de la baldosa son las mismas del sustrato de la app, más grandes.
   ═══════════════════════════════════════════════════════════════════════════ */

const VERDE = '156 230 80';   // el acento (tokens.css, --op-accent-rgb)
const rgb = (v, a = 1) => (a < 1 ? `rgba(${v.split(' ').join(',')},${a})` : `rgb(${v.split(' ').join(',')})`);

const CUERPO = 'M196 120c-4-46-76-62-98-20c-16 30 2 56 22 76c40 92 82 170 136 220c46-54 74-140 96-214';
const CABEZA = 'M318 196c-6-52 18-96 64-110c34 12 46 52 30 90c-22 30-62 40-94 20z';

function escamasBaldosa(a) {
  let p = '';
  for (let f = -1; f < 14; f++) {
    const y = f * 36, off = (f & 1) ? 0 : 28;
    for (let x = -56 + off; x < 560; x += 56) p += `M${x} ${y}a28 36 0 0 0 56 0`;
  }
  return `<path d="${p}" fill="none" stroke="${rgb(VERDE, a)}" stroke-width="5"/>`;
}

/**
 * El SVG de la marca.
 * @param {{ baldosa?: boolean, encuadre?: string, id?: string, tam?: number }} o
 *   baldosa: con la baldosa y sus escamas (el ícono) o el dibujo solo (titlebar, splash)
 *   encuadre: otro viewBox para acercar el dibujo cuando va sin baldosa
 *   id: prefijo de los ids (dos copias en el mismo documento no pueden compartirlos)
 */
function marca({ baldosa = true, encuadre = '0 0 512 512', id = 'vp', tam = null } = {}) {
  const k = (n) => `${id}-${n}`;
  const medida = tam ? ` width="${tam}" height="${tam}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${encuadre}"${medida}><defs>
<radialGradient id="${k('b')}" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#141f18"/><stop offset="1" stop-color="#060907"/></radialGradient>
<clipPath id="${k('c')}"><rect width="512" height="512" rx="97"/></clipPath>
<linearGradient id="${k('g')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c7a45"/><stop offset=".6" stop-color="${rgb(VERDE)}"/><stop offset="1" stop-color="#e7ffb0"/></linearGradient>
</defs><g clip-path="url(#${k('c')})">${baldosa ? `<rect width="512" height="512" fill="url(#${k('b')})"/>${escamasBaldosa(.05)}` : ''}
<path d="${CUERPO}" fill="none" stroke="url(#${k('g')})" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${CUERPO}" fill="none" stroke="#0a110c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 24" opacity=".55"/>
<path d="${CABEZA}" fill="${rgb(VERDE)}"/>
<circle cx="376" cy="128" r="13" fill="#ffb43c"/><path d="M376 116.04c-3.9 7.8-3.9 16.12 0 23.92c3.9-7.8 3.9-16.12 0-23.92z" fill="#050806"/>
<path d="M402 98l32-34m-32 34l40-10" fill="none" stroke="#ff7a8e" stroke-width="7" stroke-linecap="round"/>
</g></svg>`;
}

/** Sin baldosa el dibujo ocupa el centro del lienzo: este encuadre lo acerca sin cambiarlo. */
const ENCUADRE_SUELTO = '56 56 400 400';

module.exports = { marca, ENCUADRE_SUELTO, VERDE };

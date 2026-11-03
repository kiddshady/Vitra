'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   Viper — la bandeja del sistema (el molde es el de Apex, src/bandeja.cjs)

   El ícono al lado del reloj (pedido de Fran, 3/11/2026). Existe mientras la
   app corre, y es lo que hace que cerrar la ventana no sea lo mismo que
   cerrar Viper: la X esconde, y desde acá se vuelve.

   El menú es NATIVO (lo pinta Windows, no nosotros), así que es el único
   lugar de la app donde no mandan nuestros estilos. Por eso tiene lo mínimo:
   abrir y salir. Todo lo demás vive adentro de la ventana.
   ═══════════════════════════════════════════════════════════════════════════ */

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

/* El mismo PNG del que sale el ícono del instalador (tools/icono.cjs), así
   la marca es una sola: el ícono exacto, con su baldosa, como en todas las
   bandejas de Fran. Viaja en el paquete (package.json → build.files).
   32 px y no 16: Windows lo baja a 16 en pantallas al 100 %, con mejor
   filtro que el que haría al agrandar, y lo usa tal cual al 200 %. */
const ICONO = path.join(__dirname, '..', 'build', 'icon.png');

let tray = null;

function icono() {
  const img = nativeImage.createFromPath(ICONO);
  // Si el PNG no viajó, `createFromPath` devuelve una imagen vacía en vez de
  // tirar: Windows pinta un hueco, pero es mejor que quedarse sin forma de volver.
  return img.isEmpty() ? img : img.resize({ width: 32, height: 32, quality: 'best' });
}

/**
 * Crea el ícono. `mostrar` trae la ventana al frente; `salir` termina Viper
 * de verdad (con la X escondiendo, este menú es el lugar para eso). Llamarla
 * dos veces no crea dos íconos.
 */
function crear({ mostrar, salir }) {
  if (tray) return tray;
  tray = new Tray(icono());
  tray.setToolTip(`Viper ${app.getVersion()}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Viper', click: mostrar },
    { type: 'separator' },
    { label: 'Salir', click: salir },
  ]));
  // Click izquierdo: mostrar, nunca alternar. Un toggle acá esconde la ventana
  // justo cuando alguien la fue a buscar.
  tray.on('click', mostrar);
  return tray;
}

/** Sin esto, el ícono queda de fantasma en la bandeja hasta que pasás el mouse. */
function destruir() {
  if (!tray) return;
  tray.destroy();
  tray = null;
}

const existe = () => !!tray && !tray.isDestroyed();

module.exports = { crear, destruir, existe };

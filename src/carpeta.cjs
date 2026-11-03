'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   Quartz — la mudanza de la carpeta de datos (el molde es el de Praxio)

   La app se llamó Vitra hasta la 0.1.x, Viper de la 0.2 a la 0.4 y desde la
   0.5.0 se llama Quartz, y con el nombre cambia la carpeta que Electron usa
   sola a partir del productName: %APPDATA%\Viper (o \Vitra) → %APPDATA%\Quartz.
   Quien viene de un nombre viejo se muda al arrancar: la carpeta entera se
   RENOMBRA (no se copia), así el estado de la ventana y lo de Chromium viajan
   juntos. Las notas no viven acá (están en S:\Diario): lo que se cuida es no
   arrancar de cero.

   Nunca deja a nadie con la app vacía:
     · si el renombre falla (un antivirus o un archivo abierto), esta vez usa
       la vieja y en el próximo arranque lo vuelve a intentar;
     · si ya hay una Quartz CON datos, manda esa y las viejas no se tocan;
     · si hay varias viejas con datos, se muda la más nueva (Viper antes que
       Vitra) y la otra queda como estaba;
     · si hay una Quartz SIN datos y una vieja con datos: si está vacía del
       todo se saca y se muda; si tiene algo, usa la vieja (no pisa ni borra
       nada que no sabemos de dónde salió).

   Sin dependencias de Electron, para poder probarla con carpetas temporales
   (test/carpeta.test.mjs).
   ═══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const NUEVA = 'Quartz';
/** Los nombres anteriores, del más nuevo al más viejo. */
const VIEJAS = ['Viper', 'Vitra'];

/** Hay datos de la app si está su carpeta data/ (store.cjs): sin eso, es una carpeta de Chromium y nada más. */
function tieneDatos(dir) {
  return fs.existsSync(path.join(dir, 'data'));
}

/**
 * Devuelve la carpeta de datos que hay que usar, mudando la vieja → Quartz si toca.
 * @param {string} appData  %APPDATA% (app.getPath('appData'))
 * @returns {{ dir: string, paso: 'nueva' | 'mudada' | 'vieja' }}
 */
function elegir(appData) {
  const nueva = path.join(appData, NUEVA);
  if (tieneDatos(nueva)) return { dir: nueva, paso: 'nueva' };

  const vieja = VIEJAS.map((n) => path.join(appData, n)).find(tieneDatos);
  if (!vieja) return { dir: nueva, paso: 'nueva' };

  try {
    // Una Quartz vacía del todo no es de nadie: se saca para poder mudar.
    if (fs.existsSync(nueva)) {
      if (fs.readdirSync(nueva).length) return { dir: vieja, paso: 'vieja' };
      fs.rmdirSync(nueva);
    }
    fs.renameSync(vieja, nueva);
    return { dir: nueva, paso: 'mudada' };
  } catch {
    return { dir: vieja, paso: 'vieja' };
  }
}

module.exports = { elegir, tieneDatos, NUEVA, VIEJAS };

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   VITRA — preload
   La única puerta entre el renderer y el sistema. Todo lo que NO esté acá, el
   renderer no lo puede hacer: no tiene require, ni fs, ni acceso al proceso
   principal. Esa es la idea.

   Regla: exponé funciones, nunca objetos de Electron. `ipcRenderer` en el
   window anula por completo el aislamiento de contexto.
   ═══════════════════════════════════════════════════════════════════════════ */

const { contextBridge, ipcRenderer } = require('electron');

/** Desenvuelve {ok,data|error} y convierte el error en una excepción real. */
const call = async (channel, ...args) => {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res?.ok) throw new Error(res?.error || `Falló ${channel}`);
  return res.data;
};

contextBridge.exposeInMainWorld('opal', {
  info: () => call('app:info'),
  /** Los archivos de datos ilegibles que se apartaron en esta corrida. */
  asides: () => call('store:asides'),

  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
    close: () => ipcRenderer.send('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
    /** El renderer le pasa a la ventana su color base ya resuelto (ver app.js). */
    setBackground: (hex) => ipcRenderer.send('win:set-bg', hex),
    /** El vidrio «acrilico»: la ventana deja ver el escritorio (main.cjs). */
    setAcrilico: (on) => ipcRenderer.send('win:set-acrilico', !!on),
    onMaximized: (cb) => {
      const handler = (_e, value) => cb(value);
      ipcRenderer.on('win:maximized', handler);
      return () => ipcRenderer.off('win:maximized', handler);
    },
  },

  /** Leer el portapapeles (el "Pegar" del menú de los campos). Escribir no
      pasa por acá: navigator.clipboard.writeText no pide permiso. */
  clip: {
    read: () => call('clip:read'),
  },

  settings: {
    get: () => call('settings:get'),
    save: (patch) => call('settings:save', patch),
  },

  /** Documento suelto: un borrador, un caché, el último estado de la UI. */
  doc: {
    read: (name, fallback = null) => call('doc:read', name, fallback),
    write: (name, data) => call('doc:write', name, data),
  },

  /** Las actualizaciones (src/actualizador.cjs): buscar, bajar e instalar. */
  update: {
    estado: () => call('update:estado'),
    buscar: (opts) => call('update:buscar', opts),
    descargar: () => call('update:descargar'),
    instalar: () => call('update:instalar'),
    onCambio: (cb) => {
      const handler = (_e, s) => cb(s);
      ipcRenderer.on('update:cambio', handler);
      return () => ipcRenderer.off('update:cambio', handler);
    },
  },

  /** El Diario de Fran: los .md de S:\Diario (src/diario.cjs). Los errores llegan como excepciones. */
  diario: {
    carpeta: () => call('diario:carpeta'),
    listar: () => call('diario:listar'),
    leer: (ref) => call('diario:leer', ref),
    backlinks: (ref) => call('diario:backlinks', ref),
    buscar: (q) => call('diario:buscar', q),
    grafo: () => call('diario:grafo'),
    crear: (o) => call('diario:crear', o),
    dia: (fecha) => call('diario:dia', fecha),
    /** Guarda con la base que se leyó: si alguien la cambió en el medio, vuelve { conflicto, nota } y no pisa. */
    guardar: (ref, texto, base) => call('diario:guardar', ref, texto, base),
    renombrar: (ref, nuevo) => call('diario:renombrar', ref, nuevo),
    papelera: (ref) => call('diario:papelera', ref),
    abrirCarpeta: () => call('diario:abrir-carpeta'),
    /** Lo que cambió en la carpeta (desde la app o desde afuera). Devuelve cómo soltarlo. */
    onCambio: (cb) => {
      const handler = (_e, cambios) => cb(cambios);
      ipcRenderer.on('diario:cambio', handler);
      return () => ipcRenderer.off('diario:cambio', handler);
    },
  },
});

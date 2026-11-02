'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   Vitra — que el acrílico no se apague sin foco
   Windows 11 cambia el acrílico de una ventana por un gris liso cuando recibe
   WM_NCACTIVATE(FALSE), o sea, al perder el foco. Mandarle WM_NCACTIVATE(TRUE)
   le devuelve el vidrio sin tocar el foco de verdad: las teclas siguen yendo
   a la app de adelante. Es lo de Moji (src/native.cjs) y NTX, por koffi.

   Si koffi no carga (otra plataforma, un binario roto), la app anda igual:
   solo se ve gris sin foco.
   ═══════════════════════════════════════════════════════════════════════════ */

const WM_NCACTIVATE = 0x86;

let enviar = null;
try {
  if (process.platform === 'win32') {
    const koffi = require('koffi');
    const user = koffi.load('user32.dll');
    const sendMessage = user.func('intptr_t __stdcall SendMessageW(uintptr_t hwnd, uint32_t msg, uintptr_t wParam, intptr_t lParam)');
    enviar = (hwnd) => sendMessage(hwnd, WM_NCACTIVATE, 1, 0);
  }
} catch (err) {
  console.error('[vidrio] sin koffi: el acrílico se va a ver gris sin foco:', err.message);
}

/** El HWND de una BrowserWindow, como número. */
function hwndDe(win) {
  const b = win.getNativeWindowHandle();
  return b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0);
}

/**
 * Engancha la ventana: cada vez que Windows le avisa que perdió el foco, se
 * le devuelve el aspecto activo. `activo()` decide si corresponde (el
 * acrílico puede estar apagado).
 */
function mantenerVidrio(win, activo = () => true) {
  if (!enviar) return;
  win.hookWindowMessage(WM_NCACTIVATE, (wParam) => {
    if (wParam.readUInt32LE(0) !== 0 || !activo()) return;
    setImmediate(() => {
      if (win.isDestroyed()) return;
      try { enviar(hwndDe(win)); } catch { /* la ventana se fue */ }
    });
  });
}

module.exports = { mantenerVidrio, WM_NCACTIVATE };

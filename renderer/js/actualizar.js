/* ═══════════════════════════════════════════════════════════════════════════
   Viper — las actualizaciones, en la cara
   Autoupdate (Fran, 2/11/2026): el main busca al rato de abrir y cada 4
   horas, y una versión nueva se baja sola (src/actualizador.cjs). Acá no se
   interrumpe nada: un solo aviso cuando ya está bajada («entra al salir»),
   y reiniciar antes vive en el menú «Más» de la nota (diario.js lo pide con
   menuExtra).
   ═══════════════════════════════════════════════════════════════════════════ */

import { Toast } from './overlays.js';
import { fmtBytes } from './format.js';

const api = window.opal?.update;
let estado = null;
let avisada = null;   // la versión de la que ya se avisó (un aviso por versión)

function alCambiar(s) {
  const antes = estado;
  estado = s;
  if (!s) return;
  if (s.fase === 'listo' && avisada !== s.version) {
    avisada = s.version;
    Toast.show({ title: `Viper ${s.version || ''} está lista`.replace('  ', ' '), text: 'Se bajó sola y entra cuando salgas de Viper desde la bandeja o apagues la PC. Para tenerla ya, reiniciá desde «Más».', icon: 'check' });
  } else if (s.manual && s.fase === 'al-dia' && antes?.fase === 'buscando') {
    Toast.show({ title: 'Estás al día', text: `Viper ${s.actual} es la última.`, icon: 'check' });
  } else if (s.fase === 'error' && (s.manual || antes?.fase === 'descargando') && antes?.error !== s.error) {
    Toast.show({ title: 'No se pudo actualizar', text: s.error, tone: 'error' });
  }
}

export function iniciarActualizaciones() {
  if (!api) return;
  api.onCambio(alCambiar);
  api.estado().then(alCambiar).catch(() => {});
}

/** Los ítems del menú «Más»: qué se puede hacer con la versión ahora mismo. */
export function itemsActualizar() {
  if (!api || !estado || estado.fase === 'sin-soporte' || estado.fase === 'inactivo') return [];
  const s = estado;
  if (s.fase === 'disponible') {
    return [{ label: `Bajar Viper ${s.version}${s.bytes ? ` (${fmtBytes(s.bytes)})` : ''}`, icon: 'download', onSelect: () => api.descargar() }];
  }
  if (s.fase === 'descargando') {
    return [{ label: `Bajando… ${Math.round((s.progreso?.pct || 0) * 100)} %`, icon: 'download', disabled: true }];
  }
  if (s.fase === 'listo') {
    return [{ label: `Reiniciar con Viper ${s.version}`, icon: 'retry', onSelect: () => api.instalar() }];
  }
  return [{ label: s.fase === 'buscando' ? 'Buscando actualizaciones…' : 'Buscar actualizaciones', icon: 'retry', disabled: s.fase === 'buscando', onSelect: () => api.buscar({ manual: true }) }];
}

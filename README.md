# Viper

El Diario de Fran como app suelta: notas en Markdown en `S:\Diario`, enlazadas
con `[[ ]]`, con backlinks y grafo. Nació adentro de UmbroSys (1.20.0), se
mudó acá el 2/11/2026 como **Vitra**, y desde la 0.2.0 (3/11/2026) se llama
**Viper**, con piel de víbora. Sobre la plantilla [Opal](S:\tools\Opal), en la
variante **oscura**: la ventana es opaca y adentro flotan tres hojas (la lista,
la nota y quién la nombra) sobre una niebla con escamas.

```
npm run dev     # con la consola del renderer en la terminal
npm test        # tokens, store, formato, el diario + su MCP, el actualizador, la mudanza
npm run smoke   # la app de verdad sobre un diario temporal (VITRA_FOTOS=<carpeta> saca capturas)
npm run icon    # build/icon.png + icon.ico, y la marca de la titlebar y del splash en el index
```

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| El núcleo (enlaces, backlinks, grafo, versiones, papelera, guardar sin pisar) | `src/diario.cjs` |
| El servidor MCP para Claude Code (node pelado) | `mcp/diario.cjs` |
| Los canales del diario y la instancia única | `main.cjs`, al final |
| La mudanza de `%APPDATA%\Vitra` a `%APPDATA%\Viper` | `src/carpeta.cjs` |
| La cara: tres hojas, atajos, el menú de `[[` | `renderer/js/diario/diario.js` |
| El grafo (canvas propio) | `renderer/js/diario/grafo.js` |
| Markdown y el color del código (Prism) | `renderer/js/md.js`, `renderer/js/resaltar.js` |
| La piel (escamas, niebla, la luz de la nota abierta) | `renderer/css/vitra.css` |
| La marca: la V enroscada, un solo dibujo | `tools/marca.cjs` (lo usa `tools/icono.cjs`) |
| Actualizaciones (el de Tessera) | `src/actualizador.cjs`, `renderer/js/actualizar.js` |
| El acrílico que no se apaga sin foco, apagado desde la 0.2.0 | `src/vidrio.cjs` |

## Lo que hay que saber

- **Por dentro sigue diciendo Vitra, a propósito.** El `appId`
  (`com.umbrovex.vitra`) no cambió, así el instalador de Viper reemplaza a
  Vitra en vez de ponerse al lado. Tampoco cambiaron el prefijo `vt-`,
  `vitra.css` ni las variables `VITRA_*`.
- **La mudanza de los datos.** El `productName` decide la carpeta de datos:
  quien viene de Vitra se muda al arrancar (`src/carpeta.cjs`, probado en
  `test/carpeta.test.mjs`). Si no se puede renombrar, esa vez usa la vieja.
- **La marca es un solo dibujo** (`tools/marca.cjs`). `npm run icon` escribe el
  ícono con baldosa y, sin baldosa, la marca de la titlebar y la del splash en
  `renderer/index.html`, entre `<!-- marca:… -->`. No se tocan a mano.
- **Las escamas del sustrato** llevan el verde escrito en el SVG de
  `vitra.css`: si cambia el acento (`tools/retint.mjs --accent`), cambiarlo ahí
  y en `tools/marca.cjs` también.
- **La carpeta es compartida.** UmbroSys abre la misma `S:\Diario` con su
  propia copia del núcleo, y CC escribe por el MCP. Guardar va con el hash que
  se leyó: si alguien cambió la nota en el medio, vuelve un conflicto y se
  juntan las dos cosas (o queda lo tuyo, con lo otro en `.diario/versiones`).
  Nunca se pisa nada.
- **La copia canónica del núcleo es la de Viper.** Si cambia el formato de la
  carpeta (frontmatter, `diario/`, `.diario/`), se cambia en las dos.
- **El MCP** se registra una vez, para todas las sesiones:
  `claude mcp add --scope user diario -- node S:\tools\Viper\mcp\diario.cjs`.
  Corre desde esta carpeta con el node del sistema, no desde lo instalado.
- **Probar sin tocar el diario de verdad:** `VITRA_DIARIO=<carpeta>` cambia la
  carpeta, `VITRA_DATA=<carpeta>` los datos, `VITRA_VARIAS=1` deja abrir otra
  instancia.
- **Actualizaciones:** busca a los 6 s de abrir y cada 4 horas; una versión
  nueva se baja sola y se instala en silencio al cerrar. Un solo aviso cuando
  ya está bajada, y «Reiniciar con Viper X» en el menú «Más».
- **Una sola instancia:** abrir otra trae la que está adelante.

## Atajos

Ctrl+N nota nueva · Ctrl+D la de hoy · Ctrl+K buscar o saltar · Ctrl+E leer o
escribir · Ctrl+G el grafo · Ctrl+S guardar ya. Al escribir `[[` aparece el
menú de títulos: Enter o Tab completa.

---

Kidd Shady · Umbrovex Systems

# Quartz

El Diario de Fran como app suelta: notas en Markdown en `S:\Diario`, enlazadas
con `[[ ]]`, con backlinks y grafo. Nació adentro de UmbroSys (1.20.0), se
mudó acá el 2/11/2026 como **Vitra**, fue **Viper** (piel de víbora) de la
0.2.0 a la 0.4.0, y desde la 0.5.0 (3/11/2026) se llama **Quartz**: cuarzo y
ámbar. Sobre la plantilla [Opal](S:\tools\Opal), en la variante **oscura**: la
ventana es opaca y adentro flotan tres hojas (la lista, la nota y quién la
nombra) sobre una niebla con las capas de un cristal.

El cuarzo es el tiempo (en un reloj vibra 32 768 veces por segundo y el
circuito lo divide hasta llegar a uno), el registro (el cuarzo fantasma guarda
adentro las formas que tuvo) y la evolución (crece por capas, y cada capa
queda). En la app eso se ve:

- **La tinta envejece:** en la lista, el nombre de cada nota se apaga hacia un
  gris tibio con su edad (escala logarítmica, tope a un año). Al pasar el mouse
  o abrirla vuelve.
- **El latido:** en la nota de hoy, el punto de la última hora late una vez por
  segundo.
- **Hace un año, hoy:** arriba en el panel, la nota del mismo día del año
  pasado, si existe.

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
| La bandeja: la X esconde, «Abrir» y «Salir» | `src/bandeja.cjs` |
| La mudanza de `%APPDATA%\Viper` (o `\Vitra`) a `%APPDATA%\Quartz` | `src/carpeta.cjs` |
| La cara: tres hojas, atajos, el menú de `[[`, la edad, hace un año | `renderer/js/diario/diario.js` |
| El grafo (canvas propio) | `renderer/js/diario/grafo.js` |
| Markdown y el color del código (Prism) | `renderer/js/md.js`, `renderer/js/resaltar.js` |
| La piel (las capas del cristal, la niebla, la tinta vieja, el latido, la luz de la nota abierta) | `renderer/css/vitra.css` |
| La marca: «El corte», un solo dibujo | `tools/marca.cjs` (lo usa `tools/icono.cjs`) |
| Actualizaciones (el de Tessera) | `src/actualizador.cjs`, `renderer/js/actualizar.js` |
| El acrílico que no se apaga sin foco, apagado desde la 0.2.0 | `src/vidrio.cjs` |

## Lo que hay que saber

- **Por dentro sigue diciendo Vitra, a propósito.** El `appId`
  (`com.umbrovex.vitra`) no cambió, así el instalador de Quartz reemplaza a
  Viper (y a Vitra) en vez de ponerse al lado. Tampoco cambiaron el prefijo
  `vt-`, `vitra.css` ni las variables `VITRA_*`.
- **La mudanza de los datos.** El `productName` decide la carpeta de datos:
  quien viene de Viper o de Vitra se muda al arrancar (`src/carpeta.cjs`,
  probado en `test/carpeta.test.mjs`). Si no se puede renombrar, esa vez usa la
  vieja.
- **La marca es un solo dibujo** (`tools/marca.cjs`). `npm run icon` escribe el
  ícono con baldosa y, sin baldosa, la marca de la titlebar y la del splash en
  `renderer/index.html`, entre `<!-- marca:… -->`. No se tocan a mano.
- **Las capas del sustrato** (el panal con su fantasma) llevan el ámbar escrito
  en el SVG de `vitra.css`: si cambia el acento (`tools/retint.mjs --accent`),
  cambiarlo ahí, en `tools/marca.cjs` y en `renderer/js/diario/grafo.js`.
- **Cada entrada de un día lleva su hora** («## 14:32»), sí o sí. El núcleo
  se la pone a todo lo que entra a un día (`agregar`, `enlazar`, `crear` con
  texto: lo de CC por el MCP). En la app queda armada al entrar a escribir un
  día y se escribe con la primera letra que cae al final de la nota; corregir
  más arriba no cuenta, y después de media hora sin teclear lo que sigue es
  otra entrada. En la lectura se ve como una marca ámbar en la mono.
  UmbroSys tiene su propia copia del núcleo y su Diario no la pone.
- **La carpeta es compartida.** UmbroSys abre la misma `S:\Diario` con su
  propia copia del núcleo, y CC escribe por el MCP. Guardar va con el hash que
  se leyó: si alguien cambió la nota en el medio, vuelve un conflicto y se
  juntan las dos cosas (o queda lo tuyo, con lo otro en `.diario/versiones`).
  Nunca se pisa nada.
- **La copia canónica del núcleo es la de Quartz.** Si cambia el formato de la
  carpeta (frontmatter, `diario/`, `.diario/`), se cambia en las dos.
- **El MCP** se registra una vez, para todas las sesiones:
  `claude mcp add --scope user diario -- node S:\tools\Vitra\mcp\diario.cjs`.
  Corre desde esta carpeta con el node del sistema, no desde lo instalado.
  La carpeta y el repo siguen llamándose Vitra: renombrarlos corta el MCP
  hasta registrarlo de nuevo con la ruta nueva.
- **Probar sin tocar el diario de verdad:** `VITRA_DIARIO=<carpeta>` cambia la
  carpeta, `VITRA_DATA=<carpeta>` los datos, `VITRA_VARIAS=1` deja abrir otra
  instancia.
- **Actualizaciones:** busca a los 6 s de abrir y cada 4 horas; una versión
  nueva se baja sola y se instala en silencio al salir. Un solo aviso cuando
  ya está bajada, y «Reiniciar con Quartz X» en el menú «Más».
- **Una sola instancia:** abrir otra trae la que está adelante.
- **La bandeja:** la X esconde la ventana y Quartz queda al lado del reloj
  (`src/bandeja.cjs`, el ícono exacto con baldosa). Clic la trae; el menú
  tiene «Abrir Quartz» y «Salir». Una actualización bajada entra al salir desde
  ahí, al apagar la PC o desde «Reiniciar con Quartz X».

## Atajos

Ctrl+N nota nueva · Ctrl+D la de hoy · Ctrl+K buscar o saltar · Ctrl+E leer o
escribir · Ctrl+G el grafo · Ctrl+S guardar ya. Al escribir `[[` aparece el
menú de títulos: Enter o Tab completa.

---

Kidd Shady · Umbrovex Systems

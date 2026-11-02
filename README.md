# Vitra

El Diario de Fran como app suelta: notas en Markdown en `S:\Diario`, enlazadas
con `[[ ]]`, con backlinks y grafo. Nació adentro de UmbroSys (1.20.0) y se
mudó acá el 2/11/2026. Sobre la plantilla [Opal](S:\tools\Opal), en la
variante **acrílico**: la ventana entera es el vidrio y adentro flotan tres
hojas sin blur (la lista, la nota y quién la nombra).

```
npm run dev     # con la consola del renderer en la terminal
npm test        # tokens, store, formato, el diario + su MCP, el actualizador
npm run smoke   # la app de verdad sobre un diario temporal (VITRA_FOTOS=<carpeta> saca capturas)
npm run icon    # build/icon.png + icon.ico (la variante elegida en tools/icono.cjs)
```

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| El núcleo (enlaces, backlinks, grafo, versiones, papelera, guardar sin pisar) | `src/diario.cjs` |
| El servidor MCP para Claude Code (node pelado) | `mcp/diario.cjs` |
| Los canales del diario y la instancia única | `main.cjs`, al final |
| El acrílico que no se apaga sin foco (WM_NCACTIVATE por koffi) | `src/vidrio.cjs` |
| La cara: tres hojas, atajos, el menú de `[[` | `renderer/js/diario/diario.js` |
| El grafo (canvas propio) | `renderer/js/diario/grafo.js` |
| Markdown y el color del código (Prism) | `renderer/js/md.js`, `renderer/js/resaltar.js` |
| La piel | `renderer/css/vitra.css` |
| Actualizaciones (el de Tessera) | `src/actualizador.cjs`, `renderer/js/actualizar.js` |

## Lo que hay que saber

- **La carpeta es compartida.** UmbroSys abre la misma `S:\Diario` con su
  propia copia del núcleo, y CC escribe por el MCP. Guardar va con el hash que
  se leyó: si alguien cambió la nota en el medio, vuelve un conflicto y se
  juntan las dos cosas (o queda lo tuyo, con lo otro en `.diario/versiones`).
  Nunca se pisa nada.
- **La copia canónica del núcleo es la de Vitra.** Si cambia el formato de la
  carpeta (frontmatter, `diario/`, `.diario/`), se cambia en las dos.
- **El MCP** se registra una vez, para todas las sesiones:
  `claude mcp add --scope user diario -- node S:\tools\Vitra\mcp\diario.cjs`.
  Corre desde esta carpeta con el node del sistema, no desde lo instalado.
- **Probar sin tocar el diario de verdad:** `VITRA_DIARIO=<carpeta>` cambia la
  carpeta, `VITRA_DATA=<carpeta>` los datos, `VITRA_VARIAS=1` deja abrir otra
  instancia.
- `capturePage` no ve el acrílico: el tono del vidrio se mira en vivo.

## Atajos

Ctrl+N nota nueva · Ctrl+D la de hoy · Ctrl+K buscar o saltar · Ctrl+E leer o
escribir · Ctrl+G el grafo · Ctrl+S guardar ya. Al escribir `[[` aparece el
menú de títulos: Enter o Tab completa.

---

Kidd Shady · Umbrovex Systems

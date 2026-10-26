# Registro de validación

**Aplicación:** Visibilidad algorítmica · Sevilla  
**Fecha:** 26 de octubre de 2026  
**Estado:** validada en el entorno descrito. Los límites y las pruebas no realizadas se detallan al final.

---

## 1. Entorno de prueba

| Elemento | Valor |
|---|---|
| Sistema | Windows 11 Pro 10.0.26300 |
| Python | 3.14.3 (entorno `.venv` del proyecto) |
| Quarto | 1.10.18 |
| Shiny for Python | 1.8.0 |
| pandas / NumPy | 3.1.0 / 2.5.4 |
| Navegador | Google Chrome 155.0.8059.85 |
| Servidor | `http://127.0.0.1:8767/` (solo `127.0.0.1`) |
| Escritorio | ventana de 1296 × 886 px, densidad 1 |
| Móvil | iframe de 390 × 820 px |
| Fuente de datos | `C:\GIS_IA\Dataset_TFG.xlsx`, hoja `H1234` |

Las pruebas se hicieron sobre la aplicación servida por Shiny, no abriendo `index.html` como fichero local. La interacción se ejecutó en un navegador real y se comprobó el DOM, la red, la consola y capturas de pantalla.

---

## 2. Integridad de los datos

| Comprobación | Resultado |
|---|---|
| Dimensiones | 142 filas × 33 columnas |
| Valores ausentes | 0 |
| Identificadores | 142 únicos |
| Coordenadas | 142 coordenadas WGS84 válidas |
| `v4p > 0` | 50 recursos |
| `v4p = 0` | 92 recursos |
| `v3con = 0` y `v3 = 0` | 14 recursos |
| Coordenadas duplicadas | 1 par: `id` 2 y 21 |
| Origen | Tripadvisor 75, Publicidad 32, TripAdvisor 25, Intruso 10 |
| Categoría | Hotel 45, Atracción Turística 35, Restauración 32, Apartamento 30 |
| Destino final | Invisibles 74, Anuncios 32, Google Maps Libre 16, Local Pack 15, Google Maps Forzado 5 |

No se modificó, renombró, recodificó ni imputó ningún valor. Se conservan las dos grafías de origen, los espacios finales de los nombres originales, los valores extremos y las cinco incoherencias documentadas entre `v5` y la coordenada.

- `Dataset_TFG.xlsx`: SHA-256 `E3D65C3692177280D9AE729511D756379FBD36CCBE3BF526E727D9FF9FE8F3D2`, fecha de modificación 21/10/2026 10:57:24.
- `Visibilidad_Algoritmica_Sevilla_KDE.tif`: SHA-256 `CFAE5DF7DF91319EB7DBA19F235D2592C7E1B581C05F55D10452BE82F30E3549`.
- Los ficheros se abren en modo lectura desde `app_data.py` y `build_assets.py`.

### Corrección aplicada durante la validación

La primera serialización usaba `pandas.to_json()`, que recortaba algunos flotantes a 10 decimales (por ejemplo, `v2p = 4.735493477027794` pasaba a `4.735493477`). Se sustituyó por `DataFrame.to_dict(orient="records")`, conservando el `float` original de Python y convirtiendo solo los valores no finitos a `null`. La exportación CSV se volvió a comparar celda a celda con el Excel: **0 diferencias en 142 × 33 celdas**.

---

## 3. Pruebas funcionales

### 3.1 Carga y representación

| Prueba | Resultado observado | Estado |
|---|---|---|
| Carga inicial | 142 puntos, capa de calor presente, `Conectado`, 142 recursos | OK |
| Atribución del fondo | «Leaflet \| © OpenStreetMap contributors» visible y permanente | OK |
| Estadísticos de `v4p` | 142 con dato, mediana 0, máximo 750, 92 ceros; p95 de visibles 359,21 | OK |
| Variable `v3` | 128 con dato, mediana 18, máximo 478, 14 ceros; aviso de ausencia | OK |
| Calor | Superficie ponderada `min(valor / p95, 1)`, suelo de opacidad del 42 % documentado | OK |
| Graduado · cuantiles | 5 clases; ceros de `v4p` en clase propia y 4 clases positivas | OK |
| Graduado · intervalos iguales | 5 clases: 134 / 4 / 2 / 0 / 2 recursos | OK |
| Graduado · Jenks | 5 clases: `0–65,6`, `65,6–121,4`, `121,4–173,5`, `173,5–403`, `403–750`; 122 / 10 / 6 / 2 / 2 | OK |
| Graduado · escala logarítmica | 5 clases: 97 / 14 / 11 / 16 / 4 recursos | OK |
| `v3 = 0` en graduado | 14 puntos huecos, excluidos de la clasificación | OK |
| Categorías · `categoria` | 4 clases con recuentos 45 / 35 / 32 / 30 | OK |
| Categorías · `origen` | 4 clases, incluidas «Tripadvisor» y «TripAdvisor» por separado | OK |
| Categorías · `Destino_Final` | 5 clases con recuentos 74 / 32 / 16 / 15 / 5 | OK |
| KDE | Capa superpuesta presente; opacidad 82 % → 45 % → 82 %; se apaga con Restablecer | OK |
| Cambio de variable | Actualiza estadísticos, histograma, leyenda, puntos y ficha | OK |

### 3.2 Filtros

| Prueba | Resultado observado | Estado |
|---|---|---|
| OR dentro de categoría | Hotel + Atracción Turística = 80 recursos | OK |
| AND entre campos | Las 80 anteriores + TripAdvisor «No» = 9 recursos | OK |
| Recuentos facetados | Tras la respuesta del servidor: Hotel 4, Atracción 5, Restauración 3, Apartamento 2 | OK |
| Filtro numérico | `v4p` entre 400 y 750 = 3 recursos; chip `v4p: 400 – 750` | OK |
| Filtro binario | TripAdvisor «No» = 14 recursos | OK |
| Búsqueda sin tildes | `alcazar` = 4 recursos (Real Alcázar, Jardines, Legado, Suites) | OK |
| Búsqueda sin resultados | 0 recursos, mensaje de estado vacío y mapa sin puntos | OK |
| Botón «Quitar filtros» del estado vacío | Devuelve a 142 recursos y limpia la búsqueda | OK |
| Chips de filtros activos | Se crean y se eliminan correctamente por campo | OK |
| Limpiar | Restablece solo los filtros | OK |
| Restablecer | Vuelve a `v4p`, Calor, cuantiles, escala lineal, KDE apagado, opacidad 82 %, 25 filas y 142 recursos | OK |

Los recuentos de las categorías se recalculan con el servidor después de cada cambio; la comprobación se hizo esperando a que el contador de visibles y los recuentos facetados se actualizaran.

### 3.3 Fichas, tabla y exportación

| Prueba | Resultado observado | Estado |
|---|---|---|
| Ficha de punto | ID 1, Plaza de España: categoría, origen, destino, `v4p`, ranking, reseñas, distancia, calidad y coordenadas | OK |
| Aviso `v3 = 0` | ID 26: «v3 = 0 significa que el recurso no figura en TripAdvisor; no es el puesto 1.» | OK |
| Coordenada duplicada | ID 2: aviso de que comparte coordenada con otro registro y que se conservan ambos | OK |
| Tabla | 34 cabeceras: 33 campos + columna de localización; 25 filas por página | OK |
| Todas las filas | 142 filas con tamaño de página «Todas» | OK |
| Ordenación | `v4p` descendente: primera fila «Parque de María Luisa», valor 750 | OK |
| Búsqueda en tabla | `alcazar` = 4 filas; el mapa conserva sus 142 recursos | OK |
| Localizar fila | Cierra el cajón, centra el punto, abre la ficha, crea el anillo y muestra aviso | OK |
| CSV completo | 142 filas × 33 columnas, BOM `EF BB BF`, coma, UTF-8; 0 diferencias con el Excel | OK |
| CSV filtrado | 4 filas × 33 columnas; mismos valores, incluido el espacio final de «Suites Murillo Alcázar » | OK |
| Nombre del CSV | `visibilidad_alg_sevilla_AAAAMMDD_HHMM.csv` | OK |

### 3.4 Fondo, metodología y responsive

| Prueba | Resultado observado | Estado |
|---|---|---|
| Fallo de teselas | Tres eventos `tileerror`: fondo neutro, 0 teselas, aviso visible y etiqueta «Neutro» | OK |
| Desplazamiento del aviso | Leyenda y herramientas bajan 88 px; no quedan tapadas | OK |
| Reintentar | Vuelve a OSM, oculta el aviso, retira el desplazamiento y carga teselas | OK |
| Conmutador manual | Alterna OSM ↔ Neutro sin errores | OK |
| Metodología | 5 grupos y 25 variables en el diccionario; KDE 50 m / 250 m; aviso «densidad ≠ visibilidad» | OK |
| Sin desbordamiento | Escritorio 1296 px y móvil 390 px sin scroll horizontal de página | OK |
| Móvil · marca | «Visibilidad · Sevilla» visible; título largo oculto | OK |
| Móvil · panel | Cajón de 378 px, se abre y cierra con scrim; botón de cierre visible | OK |
| Móvil · tabla | Cajón de 390 px; tabla con scroll interno (4754 px de contenido en 379 px visibles) | OK |

---

## 4. Lanzador `run_app.bat`

| Prueba | Resultado observado | Estado |
|---|---|---|
| Detección de Quarto | Encuentra Quarto 1.10.18 y lo muestra en consola | OK |
| Detección de Python | Encuentra Python 3.14.3 y el `.venv` existente | OK |
| Comprobación de dependencias | Importa Shiny, pandas, NumPy, openpyxl, pyproj, tifffile, Pillow y el kernel de Jupyter | OK |
| Puerto ocupado | Con 8767 en uso: mensaje claro y salida con código 1, sin reconstruir ni renderizar | OK |
| Reconstrucción | Genera `_head.html` (309 KB) y el PNG KDE (640 × 747) | OK |
| Renderizado | Elimina el `app.py` anterior, ejecuta Quarto y genera un `app.py` nuevo | OK |
| Arranque | Servidor en `127.0.0.1:8767`; petición `GET /` registrada; página cargada | OK |
| Consola | Los mensajes de error hacen `pause`; el servidor se ejecuta en primer plano | OK (código revisado) |

El lanzador usa `--host 127.0.0.1`, no `0.0.0.0`, y no abre puertos adicionales.

---

## 5. Avisos y errores

- **Consola del navegador:** 0 errores JavaScript. Dos avisos de Canvas2D sobre `willReadFrequently` procedentes de `leaflet.heat`; no afectan al funcionamiento.
- **Quarto:** aviso `Unable to parse table from raw html block: skipping` al encontrar la tabla HTML del armazón. El render termina correctamente y la tabla se genera en el cliente; es un aviso no bloqueante.
- **Jupyter/Quarto:** avisos de `asyncio.WindowsSelectorEventLoopPolicy` y de que el kernel local usa TCP sin cifrado. Son mensajes del kernel efímero de Quarto en `127.0.0.1`; no afectan a la aplicación.
- **Sin errores de red propios:** las teselas de OSM cargan con la atribución correspondiente; el fallo se probó de forma controlada.

---

## 6. Límites y pruebas no realizadas

1. **Un solo navegador.** No se probó Firefox, Edge ni Safari. Tampoco se probó con zoom de navegador, alto contraste o lector de pantalla.
2. **Dos tamaños de ventana.** Escritorio 1296 × 886 y móvil 390 × 820. No se cubrieron tablet, orientación horizontal ni anchos intermedios.
3. **Fallo de teselas simulado.** Se dispararon eventos `tileerror` sobre teselas reales; no se desconectó la red del equipo. Un corte real puede tardar más en activar el aviso.
4. **Sin OSM offline.** El fondo necesita Internet. El modo neutro mantiene datos, filtros y tabla, pero no simula un mapa base.
5. **KDE estático y aproximado.** La capa se precalcula con los 50 recursos con `v4p > 0`, no se filtra y no representa la variable seleccionada. La reproyección a Web Mercator es una interpolación para visualización, no un análisis GIS nuevo.
6. **Calor ponderado.** Usa el p95 de los valores positivos visibles y un suelo de opacidad del 42 %; es una densidad visual, no una estimación estadística ni un valor por recurso.
7. **Datos conservados con sus inconsistencias.** `v3 = 0` significa ausencia en TripAdvisor; los dos registros con la misma coordenada se superponen; las cinco diferencias entre `v5` y la coordenada no se corrigen.
8. **Accesibilidad no auditada formalmente.** Hay etiquetas ARIA, foco y contraste cuidado, pero no se hizo una auditoría WCAG completa ni navegación solo con teclado.
9. **Rendimiento no medido.** No se hicieron pruebas de carga, memoria ni tiempos de respuesta bajo concurrencia. El uso previsto es local y monousuario.
10. **Rama de primera instalación no ejecutada.** El `.venv` ya existía; no se probó desde cero la creación del entorno ni la descarga de dependencias. La comprobación de imports y el arranque con el entorno existente sí se probaron.
11. **Rutas de error no probadas.** No se simularon ausencia de Python, ausencia de Quarto, error de `pip`, error de render ni Ctrl+C. El código de esas rutas existe y el caso de puerto ocupado sí se probó.
12. **CSV y Excel.** El CSV conserva el `double` de Python con precisión de ida y vuelta. Excel puede mostrar menos decimales según el formato de celda, pero no se altera el dato exportado.
13. **Tabla ancha.** En móvil requiere desplazamiento horizontal interno; es el comportamiento previsto para 33 columnas.

---

## 7. Cierre

- Servidores de prueba detenidos al terminar; puertos 8767 y 8768 liberados.
- No se modificaron `Dataset_TFG.xlsx`, el GeoTIFF KDE, los proyectos QGIS ni la ficha metodológica.
- Artefactos de compilación conservados para que la aplicación arranque sin recompilar: `_head.html`, `app.py`, `index.html`, `index_files/` y `assets/kde/`.
- Para volver a validar: ejecutar `run_app.bat` y repetir las comprobaciones de la sección 3.

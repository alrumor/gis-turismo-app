# Visibilidad algorítmica · Sevilla

Aplicación local de cartografía interactiva para explorar los **142 recursos turísticos de Sevilla** del dataset `Dataset_TFG.xlsx` (hoja `H1234`) y su posición en los resultados de búsqueda. Está construida con **Quarto + Shiny for Python**, Leaflet y una capa opcional de densidad KDE.

El mapa es el elemento principal de la interfaz. El panel lateral permite elegir la variable, el modo de representación y los filtros; la tabla y la ficha metodológica se abren en cajones laterales.

---

## Inicio rápido

### Requisitos

- Windows 10/11.
- [Quarto](https://quarto.org/docs/get-started/) instalado (probado con **1.10.18**).
- Python 3.12 o superior (probado con **3.14.3**).
- Conexión a Internet **solo para las teselas de OpenStreetMap**. La aplicación no usa claves de API.

### Arranque

1. Haz doble clic en **`run_app.bat`**.
2. La primera vez se crea `.venv` e instala las dependencias de `requirements.txt`. Puede tardar varios minutos.
3. El lanzador reconstruye los recursos, renderiza el documento y abre el navegador en:

   **http://127.0.0.1:8767/**

4. Para detener la aplicación, pulsa `Ctrl+C` en la consola. La consola permanece abierta para mostrar errores.

El servidor escucha exclusivamente en `127.0.0.1`; no se expone en la red local.

### Arranque manual

```bat
cd /d C:\GIS_IA\quarto_app
.venv\Scripts\python.exe build_assets.py
set QUARTO_PYTHON=C:\GIS_IA\quarto_app\.venv\Scripts\python.exe
quarto render index.qmd
.venv\Scripts\python.exe -m shiny run app.py --host 127.0.0.1 --port 8767 --launch-browser
```

No abras `index.html` con doble clic: es la plantilla generada, pero la aplicación necesita el servidor Shiny.

---

## Interfaz

### Mapa

- **Calor**: suma local ponderada de los recursos visibles. Cada recurso pesa `min(valor / p95, 1)`, calculado sobre los valores positivos visibles. Se aplica un suelo de opacidad del **42 %** para que los valores positivos bajos sigan siendo visibles, sin alterar el orden relativo. La mancha es una **densidad de valores**, no el valor de un punto.
- **Graduado**: color y tamaño según el valor de la variable, con clasificación por cuantiles, intervalos iguales o natural breaks (Jenks), en escala lineal o logarítmica. Los ceros de variables marcadas como «ausente» (`v3 = 0`) se dibujan huecos y se excluyen de la clasificación.
- **Categorías**: color por `categoria`, `origen` o `Destino_Final`, con tamaño constante y recuentos dentro de los filtros activos.
- **Densidad KDE**: capa opcional, estática, de los **50 recursos con `v4p > 0`** (recursos/km²). Se superpone al mapa, tiene opacidad ajustable y **no** se recalcula con los filtros ni representa la variable seleccionada.
- **Fondo**: teselas oficiales de OpenStreetMap con atribución permanente. Si fallan tres teselas se activa un fondo neutro y aparece un aviso con opciones de reintentar o cerrar. No se simula un mapa offline de OSM.

### Ficha de un recurso

Al hacer clic en un punto se abre una ficha con el nombre, categorías, valor de la variable seleccionada, ranking de TripAdvisor, reseñas de Google, distancia a La Giralda, coordenadas y accesos para centrar el punto o abrir la fila en la tabla. La ficha incluye avisos para:

- `v3 = 0`: el recurso **no figura en TripAdvisor**; no significa el puesto 1.
- Coordenadas compartidas por dos registros (Real Alcázar y Jardines de los Reales Alcázares).

### Filtros

- Selección múltiple de categorías con lógica **OR dentro del campo** y **AND entre campos**.
- Búsqueda de texto sin distinción de tildes o mayúsculas sobre nombre, categoría, origen y destino final.
- Filtro numérico inclusivo con rango mínimo/máximo y opción para incluir registros sin dato.
- Filtro binario de presencia en TripAdvisor (`v3con`).
- Recuento de visibles, chips de filtros activos y recuentos contextuales junto a cada categoría.
- **Limpiar** restablece solo los filtros; **Restablecer** vuelve a la variable, modo, clasificación, escala, opacidad KDE, tabla y filtros por defecto.

### Tabla y exportación

- La tabla muestra las **33 columnas originales**, con búsqueda global, ordenación por cualquier columna, tamaños de página de 25, 50, 100 o todas.
- El botón de localización de cada fila cierra la tabla, centra el recurso en el mapa y lo destaca.
- **CSV** exporta todas las filas que cumplen los filtros activos (no solo la página visible), con las 33 columnas, coma como separador, UTF-8 con BOM y valores originales. Nombre: `visibilidad_alg_sevilla_AAAAMMDD_HHMM.csv`.

---

## Datos y criterios metodológicos

La aplicación lee el dataset **en modo lectura** y no modifica, renombra, recodifica ni imputa valores. Los ficheros fuente permanecen en `C:\GIS_IA`:

- `Dataset_TFG.xlsx`, hoja `H1234`: **142 filas × 33 columnas**, sin celdas vacías.
- `Visibilidad_Algoritmica_Sevilla_KDE.tif`: ráster KDE original en EPSG:25830.
- `Visibilidad_Algoritmica_Sevilla_Metodologia.txt`: ficha metodológica del TFG.

Comprobaciones de integridad al cargar:

- 142 identificadores únicos.
- Coordenadas WGS84 válidas y dentro del ámbito de Sevilla.
- 50 recursos con `v4p > 0`; 92 con `v4p = 0`.
- 14 registros con `v3con = 0` y `v3 = 0`.
- Un par de registros con la misma coordenada (`id` 2 y 21).
- Se conservan las dos grafías **Tripadvisor** (75) y **TripAdvisor** (25).
- Se conservan los valores extremos de `v9b`, `v9c` y `v9p`, y los cinco registros con incoherencia documentada entre coordenada y `v5`.

La capa KDE se reproyecta desde EPSG:25830 a una malla Web Mercator para su visualización. Parámetros documentados: **h = 250 m**, celdas de **50 m**, densidad media **0,337 recursos/km²**, máximo **11,4346 recursos/km²** y cortes `[0,0016, 0,0306, 0,3227, 1,4288]`. La superficie no representa la intensidad de la visibilidad: una zona densa puede deberse a muchos recursos poco visibles.

La ficha **Metodología** de la propia aplicación amplía estas decisiones y los límites del análisis.

---

## Estructura del proyecto

```text
quarto_app/
├─ run_app.bat              Lanzador local (crea el entorno si falta)
├─ index.qmd                Documento Quarto con Shiny
├─ app_data.py              Carga, validación, metadatos y filtrado en servidor
├─ shell.py                 Armazón HTML, panel, leyenda, cajones y textos
├─ build_assets.py          Reproyección del KDE y empaquetado de CSS/JS
├─ requirements.txt
├─ README.md
├─ validation_log.md
├─ assets/
│  ├─ app.css
│  ├─ app.js
│  ├─ vendor/               Leaflet 1.9.4 y leaflet.heat 0.2.0
│  └─ kde/                  PNG y metadatos generados
├─ _head.html               Generado: CSS/JS en línea y KDE como data URI
├─ app.py                   Generado por Quarto
├─ index.html               Generado por Quarto
└─ index_files/             Recursos generados por Quarto
```

`_head.html`, `app.py`, `index.html` y `index_files/` son artefactos de compilación. Si se editan `app.css`, `app.js`, `shell.py` o `index.qmd`, hay que reconstruir con `run_app.bat` o con los comandos manuales.

### Por qué los recursos van en línea

Quarto/Shiny no sirve automáticamente los ficheros locales referenciados desde el HTML del armazón. Por eso `build_assets.py` inserta Leaflet, leaflet.heat, `app.css` y `app.js` en `_head.html`, y embebe el PNG del KDE como data URI. Esto mantiene la aplicación autocontenida y evita rutas estáticas frágiles.

---

## Solución de problemas

| Problema | Solución |
|---|---|
| «No se encuentra Quarto» | Instala Quarto o añade `quarto.exe` al `PATH`. El lanzador también busca en `%LOCALAPPDATA%\Programs\Quarto\bin` y `%ProgramFiles%\Quarto\bin`. |
| El puerto 8767 está ocupado | Cierra la otra instancia de la aplicación o el proceso que use el puerto. |
| La página queda en «Preparando el mapa…» | Espera a que termine la primera carga; recarga con `F5` y revisa la consola del navegador. |
| No aparecen las teselas | Comprueba la conexión. El aviso permite reintentar; los datos, filtros y tabla siguen funcionando con fondo neutro. |
| Error al instalar dependencias | Verifica que Python 3.12+ está disponible y ejecuta `.venv\Scripts\python.exe -m pip install -r requirements.txt`. |
| Cambios en CSS/JS no aparecen | Vuelve a ejecutar `run_app.bat` (reconstruye `_head.html` y vuelve a renderizar). |

La aplicación no recoge datos personales, no usa servicios de pago y no envía telemetría. La única petición externa es la descarga de teselas de OpenStreetMap; el navegador puede cachearlas según su configuración habitual.

---

## Reproducibilidad

- Entorno probado: Windows 11 Pro, Python 3.14.3, Quarto 1.10.18, Shiny 1.8.0, pandas 3.1.0, Chrome 155.
- Las versiones directas están fijadas en `requirements.txt`.
- La comprobación funcional final, los recuentos verificados y los límites conocidos se documentan en `validation_log.md`.

Uso local y académico. Datos y cartografía del TFG; fondo © colaboradores de OpenStreetMap.

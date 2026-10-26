"""Construye el HTML del armazón de la aplicación.

El HTML es estático (se sirve dentro de la página de Quarto) y el estado
analítico se inyecta como JSON para que el cliente dibuje de inmediato. El
servidor Shiny sigue siendo la fuente de verdad de los filtros.
"""

from __future__ import annotations

import json
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
KDE_META = APP_DIR / "assets" / "kde" / "kde_meta.json"


ICONS = """
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <symbol id="i-sliders" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></symbol>
  <symbol id="i-table" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/></symbol>
  <symbol id="i-book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M8 7h8M8 11h6"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></symbol>
  <symbol id="i-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></symbol>
  <symbol id="i-target" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></symbol>
  <symbol id="i-layers" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 18 9 5 9-5"/></symbol>
  <symbol id="i-fit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><rect x="8" y="8" width="8" height="8" rx="1"/></symbol>
  <symbol id="i-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17.5v.1"/></symbol>
  <symbol id="i-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/></symbol>
  <symbol id="i-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.7-4M4 5v5h5M4 13a8 8 0 0 0 14.7 4M20 19v-5h-5"/></symbol>
  <symbol id="i-chevron-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></symbol>
  <symbol id="i-chevron-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></symbol>
  <symbol id="i-arrow-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></symbol>
  <symbol id="i-arrow-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14m0 0 6-6m-6 6-6-6"/></symbol>
  <symbol id="i-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></symbol>
</svg>
"""


def _json_for_script(value: object) -> str:
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return text.replace("</", "<\\/")


def build_shell(meta: dict) -> str:
    kde = None
    if KDE_META.exists():
        try:
            kde = json.loads(KDE_META.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            kde = None
    meta = {**meta, "kde": kde}
    meta_json = _json_for_script(meta)
    facts = meta["dataset"]

    chip_groups = [
        ("categoria", "Categoría", "Agrupa los recursos por tipo de alojamiento, atracción o restauración."),
        ("origen", "Origen", "Procedencia del registro en el dataset."),
        ("Destino_Final", "Destino final", "Visibilidad efectiva en los resultados de búsqueda."),
    ]
    chips_html = []
    for field, label, hint in chip_groups:
        chips_html.append(
            f"""
      <div class="chip-group" data-chip-group="{field}">
        <div class="chip-head">
          <span>{label}</span>
          <em>selección múltiple</em>
          <button type="button" data-clear-chip="{field}" hidden>Limpiar</button>
        </div>
        <div class="chip-grid" id="chips-{field}"></div>
        <p class="chip-note">{hint}</p>
      </div>"""
        )

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<div class="app-shell" id="appShell">
  {ICONS}

  <header class="appbar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M5 17.5 12 5l7 12.5" stroke="#fff" stroke-width="1.25" opacity=".55"/>
          <circle cx="12" cy="5" r="2.15" fill="#E4572E"/>
          <circle cx="5" cy="17.5" r="1.9" fill="#fff"/>
          <circle cx="19" cy="17.5" r="1.9" fill="#fff"/>
          <path d="M12 7.2v5.3" stroke="#fff" stroke-width="1.1" stroke-dasharray="1.5 1.7" opacity=".7"/>
        </svg>
      </div>
      <div class="brand-text">
        <span class="brand-kicker">Turismo · algoritmos · territorio</span>
        <h1><span class="brand-title-long">Visibilidad algorítmica · Sevilla</span><span class="brand-title-short">Visibilidad · Sevilla</span></h1>
      </div>
    </div>

    <div class="appbar-mid">
      <span class="dataset-pill"><b data-fact="rows">142</b> recursos · <b data-fact="cols">33</b> campos · hoja H1234</span>
    </div>

    <div class="appbar-actions">
      <span class="conn" id="connStatus" data-state="connecting" title="Estado de la conexión con el servidor Shiny">
        <i></i><span>Conectando</span>
      </span>
      <button type="button" class="btn ghost" id="openMethodBtn" title="Abrir la ficha metodológica">
        <svg><use href="#i-book"/></svg><span>Metodología</span>
      </button>
      <button type="button" class="btn primary" id="openDataBtn" title="Explorar la tabla de datos completa">
        <svg><use href="#i-table"/></svg><span>Datos</span><span class="badge" id="dataCount">142</span>
      </button>
      <button type="button" class="icon-btn only-mobile" id="openSidebarBtn" aria-label="Abrir filtros y variables">
        <svg><use href="#i-sliders"/></svg>
      </button>
    </div>
  </header>

  <div class="workspace">
    <aside class="sidebar" id="sidebar" aria-label="Panel de variables y filtros">
      <div class="sidebar-head">
        <div class="sidebar-head-text">
          <div class="eyebrow">Panel de análisis</div>
          <h2>Explora el mapa</h2>
          <p>142 recursos turísticos y su posición en los resultados de búsqueda.</p>
        </div>
        <button type="button" class="icon-btn side-close only-mobile" id="sideCloseBtn" aria-label="Cerrar el panel">
          <svg><use href="#i-x"/></svg>
        </button>
      </div>

      <div class="side-scroll" id="sideScroll">
        <section class="side-section" aria-labelledby="sec-variable">
          <div class="section-head">
            <span class="section-num">01</span>
            <h3 id="sec-variable">Variable</h3>
          </div>
          <label class="field-label" for="varSelect">Variable analizada</label>
          <select class="select" id="varSelect"></select>
          <p class="var-desc" id="varDesc"></p>
          <div class="var-stats" id="varStats">
            <div class="var-stat"><b id="statN">—</b><span>con dato</span></div>
            <div class="var-stat"><b id="statMed">—</b><span>mediana</span></div>
            <div class="var-stat"><b id="statMax">—</b><span>máximo</span></div>
            <div class="var-stat"><b id="statZero">—</b><span>ceros</span></div>
          </div>
          <div class="hist-wrap">
            <svg class="hist" id="hist" viewBox="0 0 320 66" preserveAspectRatio="none" role="img" aria-label="Histograma de la variable en los recursos visibles"></svg>
            <div class="hist-caption">
              <span id="histCaption">Distribución de los visibles</span>
              <span>mediana <b id="histMedian">—</b></span>
            </div>
          </div>
          <p class="zero-note" id="zeroNote" hidden></p>
        </section>

        <section class="side-section" aria-labelledby="sec-representation">
          <div class="section-head">
            <span class="section-num">02</span>
            <h3 id="sec-representation">Representación</h3>
          </div>

          <div class="segmented" id="modeSeg" role="group" aria-label="Modo de representación">
            <button type="button" data-mode="heat" class="active">Calor</button>
            <button type="button" data-mode="graduated">Graduado</button>
            <button type="button" data-mode="category">Categorías</button>
          </div>

          <div class="control-block" id="catFieldBlock" hidden>
            <label class="field-label" for="catFieldSelect">Campo categórico</label>
            <select class="select" id="catFieldSelect"></select>
          </div>

          <div class="control-block" id="classBlock" hidden>
            <div class="control-row">
              <div style="flex:1;min-width:0">
                <label class="field-label" for="classSelect">Clasificación</label>
                <select class="select" id="classSelect">
                  <option value="quantile">Cuantiles</option>
                  <option value="equal">Intervalos iguales</option>
                  <option value="jenks">Natural breaks (Jenks)</option>
                </select>
              </div>
              <div style="flex:0 0 104px">
                <label class="field-label" for="scaleSelect">Escala</label>
                <select class="select" id="scaleSelect">
                  <option value="linear">Lineal</option>
                  <option value="log">Logarítmica</option>
                </select>
              </div>
            </div>
            <p class="control-hint">Los ceros se clasifican como valor mínimo; los valores técnicamente ausentes se dibujan huecos.</p>
          </div>

          <p class="control-hint" id="modeHint">La intensidad del calor es una densidad ponderada, no un valor por recurso.</p>

          <label class="switch-row" for="kdeToggle">
            <input type="checkbox" class="switch" id="kdeToggle">
            <span>Superponer densidad KDE
              <small>Recursos con presencia &gt; 0 · superficie de densidad</small>
            </span>
          </label>
          <div class="opacity-block" id="kdeOpacityBlock" hidden>
            <div class="opacity-label"><span>Opacidad de la capa</span><b id="kdeOpacityVal">82 %</b></div>
            <input type="range" class="simple-range" id="kdeOpacity" min="20" max="100" step="1" value="82" aria-label="Opacidad de la capa KDE">
          </div>
        </section>

        <section class="side-section" aria-labelledby="sec-filters">
          <div class="section-head">
            <span class="section-num">03</span>
            <h3 id="sec-filters">Filtros</h3>
            <button type="button" class="section-action" id="clearFiltersBtn">Limpiar</button>
          </div>

          <div class="search-box">
            <svg><use href="#i-search"/></svg>
            <input type="search" class="text-input" id="searchInput" placeholder="Buscar recurso, categoría u origen…" autocomplete="off" aria-label="Buscar por texto">
          </div>

          <div id="chipGroups">
            {''.join(chips_html)}
          </div>

          <div class="chip-group">
            <div class="chip-head"><span>Presencia en TripAdvisor</span><em>v3con</em></div>
            <div class="segmented" id="binarySeg" role="group" aria-label="Filtro de presencia en TripAdvisor">
              <button type="button" data-binary="all" class="active">Todos</button>
              <button type="button" data-binary="1">Sí</button>
              <button type="button" data-binary="0">No</button>
            </div>
            <p class="chip-note">14 recursos no figuran en TripAdvisor y tienen ranking 0.</p>
          </div>

          <div class="num-block">
            <label class="field-label" for="numField">Filtro numérico</label>
            <select class="select" id="numField"></select>
            <div class="range-wrap" id="numRange">
              <div class="range-track"></div>
              <div class="range-fill" id="numFill"></div>
              <input type="range" id="numLower" aria-label="Valor mínimo">
              <input type="range" id="numUpper" aria-label="Valor máximo">
            </div>
            <div class="range-numbers">
              <input type="number" id="numMin" aria-label="Mínimo exacto">
              <span>—</span>
              <input type="number" id="numMax" aria-label="Máximo exacto">
            </div>
            <button type="button" class="range-reset" id="numReset">Usar el rango completo</button>
            <label class="missing-row" id="missingRow">
              <input type="checkbox" id="includeMissing">
              <span>Incluir registros sin dato</span>
            </label>
          </div>

          <div class="active-filters" id="activeFilters"></div>
        </section>
      </div>

      <div class="side-footer">
        <div class="side-count">
          <b id="visibleCount">142</b> <span>de <span id="visibleTotal">142</span> recursos</span>
          <span class="side-sync" id="syncStatus">Actualizando…</span>
        </div>
        <button type="button" class="reset-all" id="resetAllBtn" title="Restablece filtros, variable y representación">Restablecer</button>
      </div>
    </aside>

    <main class="map-panel" id="mapPanel" aria-label="Mapa interactivo de recursos">
      <div id="map"></div>

      <div class="map-loading" id="mapLoading">
        <div class="loading-inner"><div class="spinner"></div><span>Preparando el mapa…</span></div>
      </div>

      <section class="legend-card" id="legendCard" aria-label="Leyenda del mapa">
        <div class="legend-head">
          <div class="legend-titles">
            <span class="legend-kicker" id="legendKicker">Densidad ponderada</span>
            <div class="legend-title" id="legendTitle">Presencia algorítmica ponderada</div>
            <p class="legend-sub" id="legendSub">Peso relativo de cada recurso</p>
          </div>
        </div>
        <div id="legendBody"></div>
        <div class="legend-foot">
          <span>Fuente: Dataset_TFG.xlsx · H1234</span>
          <span id="legendCount">142 recursos</span>
        </div>
      </section>

      <div class="map-tools" aria-label="Herramientas del mapa">
        <button type="button" class="map-tool" id="fitBtn" title="Ajustar la vista a los recursos visibles" aria-label="Ajustar a los resultados">
          <svg><use href="#i-fit"/></svg>
        </button>
        <button type="button" class="map-tool" id="basemapBtn" title="Cambiar entre OpenStreetMap y fondo neutro" aria-label="Cambiar el fondo del mapa">
          <span class="map-tool-label" id="basemapLabel">OSM</span>
        </button>
        <button type="button" class="map-tool" id="clearSelBtn" title="Quitar la selección" aria-label="Limpiar la selección">
          <svg><use href="#i-target"/></svg>
        </button>
      </div>

      <div class="basemap-banner" id="basemapBanner" hidden role="status">
        <svg><use href="#i-alert"/></svg>
        <div><b id="bannerTitle">No se pudieron cargar las teselas de OpenStreetMap</b><span id="bannerText">Se muestra un fondo neutro. El mapa base necesita conexión; los datos y filtros siguen funcionando.</span></div>
        <button type="button" id="retryTilesBtn">Reintentar</button>
        <button type="button" class="banner-close" id="bannerCloseBtn" aria-label="Cerrar el aviso"><svg style="width:12px;height:12px"><use href="#i-x"/></svg></button>
      </div>

      <div class="info-card" id="infoCard" aria-live="polite">
        <div class="info-empty" id="infoEmpty">
          <div class="info-empty-icon"><svg><use href="#i-pin"/></svg></div>
          <div>
            <b>Explora un recurso</b>
            <p>Haz clic en un punto del mapa para consultar su ficha y sus valores originales.</p>
          </div>
        </div>
        <div id="infoContent" hidden></div>
      </div>

      <div class="map-empty" id="mapEmpty" hidden>
        <div class="map-empty-card">
          <svg><use href="#i-search"/></svg>
          <b>Ningún recurso cumple los filtros</b>
          <p>Prueba a ampliar el rango numérico o a quitar alguna categoría.</p>
          <button type="button" class="btn small" id="emptyResetBtn">Quitar filtros</button>
        </div>
      </div>
    </main>
  </div>

  <div class="scrim" id="scrim"></div>

  <aside class="drawer" id="dataDrawer" role="dialog" aria-modal="true" aria-labelledby="dataTitle" aria-hidden="true">
    <div class="drawer-head">
      <div class="drawer-head-text">
        <div class="eyebrow">Tabla de datos</div>
        <h2 id="dataTitle">Explorar los 33 campos</h2>
        <p>Filas que cumplen los filtros activos · los valores originales se conservan sin redondear.</p>
      </div>
      <button type="button" class="icon-btn drawer-close" data-close-drawer aria-label="Cerrar la tabla">
        <svg><use href="#i-x"/></svg>
      </button>
    </div>
    <div class="drawer-toolbar">
      <div class="search-box">
        <svg><use href="#i-search"/></svg>
        <input type="search" class="text-input" id="tableSearch" placeholder="Buscar en la tabla…" autocomplete="off" aria-label="Buscar en la tabla">
      </div>
      <select class="select" id="pageSize" aria-label="Filas por página">
        <option value="25">25 filas</option>
        <option value="50">50 filas</option>
        <option value="100">100 filas</option>
        <option value="all">Todas</option>
      </select>
      <div class="toolbar-spacer"></div>
      <span class="toolbar-count"><b id="tableCount">142</b> filas</span>
      <button type="button" class="btn small" id="exportCsvBtn" title="Descargar CSV con los valores originales">
        <svg><use href="#i-download"/></svg><span>CSV</span>
      </button>
    </div>
    <div class="table-wrap" id="tableWrap">
      <table class="data-table" id="dataTable">
        <thead id="tableHead"></thead>
        <tbody id="tableBody"></tbody>
      </table>
    </div>
    <div class="table-foot">
      <span id="tableRange">Mostrando 1–25 de 142</span>
      <span class="toolbar-count" style="margin-left:8px">CSV: coma · UTF-8 · 33 columnas</span>
      <div class="pager" id="pager" aria-label="Paginación"></div>
    </div>
  </aside>

  <aside class="drawer drawer-method" id="methodDrawer" role="dialog" aria-modal="true" aria-labelledby="methodTitle" aria-hidden="true">
    <div class="drawer-head">
      <div class="drawer-head-text">
        <div class="eyebrow">Ficha metodológica</div>
        <h2 id="methodTitle">Cómo leer este mapa</h2>
        <p>Datos, decisiones de representación y límites del análisis.</p>
      </div>
      <button type="button" class="icon-btn drawer-close" data-close-drawer aria-label="Cerrar la metodología">
        <svg><use href="#i-x"/></svg>
      </button>
    </div>
    <div class="method-scroll">
      <p class="method-lead">
        Esta aplicación cartografía la <strong>visibilidad algorítmica</strong> de 142 recursos turísticos de Sevilla
        a partir del dataset <code>Dataset_TFG.xlsx</code> (hoja <code>H1234</code>). No es un mapa de flujos turísticos
        ni de demanda real: representa cómo aparecen estos recursos en los resultados de búsqueda y qué índices
        derivados acompañan esa posición.
      </p>

      <div class="fact-grid">
        <div class="fact"><b data-fact="rows">142</b><span>recursos</span></div>
        <div class="fact"><b data-fact="cols">33</b><span>campos originales</span></div>
        <div class="fact"><b data-fact="missing">0</b><span>valores ausentes</span></div>
        <div class="fact"><b data-fact="v4p_positive">50</b><span>con presencia &gt; 0</span></div>
      </div>

      <h3>Cómo leer las capas</h3>
      <p><strong>Calor.</strong> La intensidad es una suma local de pesos normalizados. Cada recurso pesa
      <code>min(valor / p95, 1)</code>, para evitar que los valores extremos dominen la superficie. Para que los
      valores positivos bajos no desaparezcan se aplica un suelo de opacidad del 42 %: no altera el orden relativo,
      pero hace visible la superficie. La mancha indica <em>concentración espacial de valores altos</em>, no el valor
      de un recurso concreto. Los puntos pequeños siguen siendo consultables.</p>
      <p><strong>Graduado.</strong> Cada punto se colorea por la clase de su valor y su tamaño también crece con la
      magnitud. Las clases se calculan sobre los recursos visibles con cuantiles, intervalos iguales o natural breaks
      (Jenks). La escala logarítmica comprime las colas largas; los valores de las fichas nunca se transforman.</p>
      <p><strong>Categorías.</strong> El color representa el campo categórico elegido (categoría, origen o destino final)
      y el tamaño es constante. Las etiquetas de la leyenda muestran el recuento dentro de los filtros activos.</p>

      <div class="method-callout blue">
        <svg><use href="#i-info"/></svg>
        <div><b>Densidad KDE ≠ visibilidad.</b> La capa KDE representa la densidad de los
        <strong>50 recursos con v4p &gt; 0</strong> (recursos por km²), con una malla de <span data-kde="cell">50</span> m
        y una banda gaussiana de <span data-kde="bandwidth">250</span> m. Una zona densa puede deberse a muchos
        recursos poco visibles; no es la intensidad de la variable seleccionada.</div>
      </div>

      <h3>Decisiones sobre los datos</h3>
      <ul class="method-list">
        <li>El dataset se lee <strong>en modo lectura</strong>. No se han modificado, renombrado ni recodificado valores,
          coordenadas ni categorías.</li>
        <li>No se imputan valores ausentes. En esta hoja no hay ninguno, pero el filtro numérico incorpora la opción
          «incluir registros sin dato» para futuras versiones del dataset.</li>
        <li><code>v3 = 0</code> significa <strong>no presente en TripAdvisor</strong> (14 recursos), no el primer puesto
          del ranking. En el mapa graduado se dibuja como punto hueco y se excluye de la clasificación.</li>
        <li><code>origen</code> conserva las dos grafías «Tripadvisor» y «TripAdvisor» porque así figuran en el origen.
          La leyenda las muestra por separado; no se han unificado.</li>
        <li>Los dos registros del Real Alcázar comparten coordenada. Se conservan ambos y se señala la coincidencia en
          las fichas.</li>
        <li><code>v9b</code>, <code>v9c</code> y <code>v9p</code> presentan valores extremos cuando la distancia al punto 0
          es muy pequeña. Son coherentes con la fórmula documentada y no se han corregido.</li>
        <li>La distancia <code>v5</code> se muestra tal como figura en el dataset. La metodología original documenta cinco
          registros con incoherencias entre coordenada y valor; este visor no los altera.</li>
      </ul>

      <h3>Filtros y recuentos</h3>
      <p>Los filtros se combinan con <strong>AND entre campos</strong> y <strong>OR dentro de un mismo campo</strong>.
      La búsqueda de texto ignora tildes y mayúsculas y recorre el nombre, la categoría, el origen y el destino final.
      Los recuentos junto a cada categoría se recalculan con el resto de filtros activos, de modo que muestran cuántos
      recursos quedarían al añadir esa opción. El rango numérico es inclusivo.</p>

      <h3>Diccionario de variables</h3>
      <div class="var-dictionary" id="varDictionary"></div>

      <h3>Fondo y límites</h3>
      <p>El fondo utiliza las <strong>teselas oficiales de OpenStreetMap</strong> con su atribución permanente. No se
      usa ninguna clave de API ni caché local de teselas. Si las teselas no pueden cargarse, la aplicación cambia a un
      <strong>fondo neutro</strong> y lo indica explícitamente: no se simula un mapa offline de OpenStreetMap. Los datos,
      los filtros y la tabla siguen disponibles sin conexión una vez cargada la página.</p>
      <p class="muted">La aplicación es una herramienta exploratoria. Las asociaciones que muestra no implican causalidad.
      Para reproducir el análisis original, consúltese la ficha metodológica y el proyecto QGIS que acompañan al TFG.</p>

      <h3>Créditos</h3>
      <div class="credits">
        Datos: <code>Dataset_TFG.xlsx</code>, hoja <code>H1234</code> · Ráster KDE:
        <code>Visibilidad_Algoritmica_Sevilla_KDE.tif</code>.<br>
        Fondo: © colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>.
        Cartografía web: Leaflet 1.9.4 y leaflet.heat. Aplicación: Quarto + Shiny for Python.<br>
        Uso local y académico. No se utilizan servicios de pago ni se recogen datos personales.
      </div>
    </div>
  </aside>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>
</div>

<script id="app-meta" type="application/json">{meta_json}</script>
<noscript>
  <div style="position:fixed;inset:0;display:grid;place-items:center;background:#f5f1e8;font-family:Segoe UI,sans-serif;padding:24px;text-align:center">
    <div><strong>Esta aplicación necesita JavaScript.</strong><br>Actívalo para visualizar el mapa interactivo.</div>
  </div>
</noscript>
</body>
</html>
"""

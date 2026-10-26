/* ==========================================================================
   Visibilidad algorítmica · Sevilla
   Lógica de cliente: mapa, capas, leyenda, filtros, tabla y sincronización
   con Shiny. El servidor es la fuente de verdad de los filtros.
   ========================================================================== */

(function () {
  "use strict";

  if (window.__visibilidadAppBooted) return;
  window.__visibilidadAppBooted = true;

  /* Rampa cálida para valores (distinta de la rampa azul del KDE). */
  const VALUE_RAMP = ["#F6D8B0", "#EFB27A", "#E9824B", "#D9532B", "#A93D1C"];
  const POSITIVE_RAMP = VALUE_RAMP.slice(1);
  const HEAT_GRADIENT = {
    0.12: "#fbe7c6",
    0.3: "#f5c48b",
    0.5: "#ee9a5c",
    0.7: "#df6a38",
    0.85: "#c74a25",
    1: "#96351a",
  };
  const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const OSM_ATTRIB =
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) =>
    Array.prototype.slice.call((root || document).querySelectorAll(selector));

  const ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  function esc(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
  }

  function toNum(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeText(value) {
    return String(value === null || value === undefined ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  function quantile(sorted, p) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = sorted[Math.min(base + 1, sorted.length - 1)];
    return sorted[base] + rest * (next - sorted[base]);
  }

  function median(sorted) {
    return quantile(sorted, 0.5);
  }

  function signedLog(value) {
    return Math.sign(value) * Math.log10(1 + Math.abs(value));
  }

  function signedExp(value) {
    return Math.sign(value) * (Math.pow(10, Math.abs(value)) - 1);
  }

  function rampColors(count) {
    if (count <= 1) return [VALUE_RAMP[2]];
    return Array.from({ length: count }, (_, i) => {
      const idx = Math.round((i * (VALUE_RAMP.length - 1)) / (count - 1));
      return VALUE_RAMP[idx];
    });
  }

  function niceFilenameDate() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      "_" +
      pad(d.getHours()) +
      pad(d.getMinutes())
    );
  }

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */

  function boot() {
    const metaEl = document.getElementById("app-meta");
    if (!metaEl) return;

    let meta;
    try {
      meta = JSON.parse(metaEl.textContent || "{}");
    } catch (err) {
      console.error("No se pudo leer la configuración de la aplicación.", err);
      return;
    }
    if (!meta || !Array.isArray(meta.columns) || !Array.isArray(meta.variables)) {
      console.error("La configuración de la aplicación está incompleta.");
      return;
    }
    if (typeof window.L === "undefined") {
      console.error("Leaflet no está disponible.");
      return;
    }

    const VAR_BY_CODE = new Map(meta.variables.map((v) => [v.code, v]));
    const COL_BY_KEY = new Map(meta.columns.map((c) => [c.key, c]));
    const CAT_BY_FIELD = new Map(meta.categoricals.map((c) => [c.field, c]));
    const CAT_COLORS = new Map(
      meta.categoricals.map((cat) => [
        cat.field,
        new Map(cat.values.map((v) => [v.value, v.color])),
      ])
    );
    const dataset = meta.dataset || {};
    const defaults = meta.defaults || {};
    const initial = meta.initial || { rows: [], visible: 0, facets: {} };

    const state = {
      variable: defaults.variable || "v4p",
      mode: defaults.mode || "heat",
      categorical: defaults.categorical || "categoria",
      classification: defaults.classification || "quantile",
      scale: "linear",
      kde: false,
      kdeOpacity: 0.82,
      search: "",
      categories: {
        categoria: [],
        origen: [],
        Destino_Final: [],
      },
      binary: "all",
      numeric: {
        field: "v4p",
        min: null,
        max: null,
        active: false,
        includeMissing: false,
      },
      rows: Array.isArray(initial.rows) ? initial.rows.slice() : [],
      facets: initial.facets || {},
      visible: Number(initial.visible) || 0,
      total: Number(dataset.rows) || 142,
      selectedId: null,
      classes: [],
      heatP95: 0,
      table: {
        q: "",
        sortKey: "id",
        sortDir: "asc",
        page: 1,
        pageSize: 25,
      },
      shinyReady: false,
      gotPayload: false,
      seq: 0,
      lastAppliedSeq: null,
      handshakeAttempts: 0,
    };

    /* ---------------------------------------------------------------- */
    /* Referencias DOM                                                  */
    /* ---------------------------------------------------------------- */

    const ui = {
      map: $("#map"),
      mapPanel: $("#mapPanel"),
      mapLoading: $("#mapLoading"),
      mapEmpty: $("#mapEmpty"),
      sidebar: $("#sidebar"),
      scrim: $("#scrim"),
      varSelect: $("#varSelect"),
      varDesc: $("#varDesc"),
      statN: $("#statN"),
      statMed: $("#statMed"),
      statMax: $("#statMax"),
      statZero: $("#statZero"),
      hist: $("#hist"),
      histCaption: $("#histCaption"),
      histMedian: $("#histMedian"),
      zeroNote: $("#zeroNote"),
      modeSeg: $("#modeSeg"),
      catFieldBlock: $("#catFieldBlock"),
      catFieldSelect: $("#catFieldSelect"),
      classBlock: $("#classBlock"),
      classSelect: $("#classSelect"),
      scaleSelect: $("#scaleSelect"),
      modeHint: $("#modeHint"),
      kdeToggle: $("#kdeToggle"),
      kdeOpacityBlock: $("#kdeOpacityBlock"),
      kdeOpacity: $("#kdeOpacity"),
      kdeOpacityVal: $("#kdeOpacityVal"),
      searchInput: $("#searchInput"),
      chipGroups: $("#chipGroups"),
      binarySeg: $("#binarySeg"),
      numField: $("#numField"),
      numLower: $("#numLower"),
      numUpper: $("#numUpper"),
      numMin: $("#numMin"),
      numMax: $("#numMax"),
      numFill: $("#numFill"),
      numReset: $("#numReset"),
      includeMissing: $("#includeMissing"),
      missingRow: $("#missingRow"),
      activeFilters: $("#activeFilters"),
      clearFiltersBtn: $("#clearFiltersBtn"),
      resetAllBtn: $("#resetAllBtn"),
      visibleCount: $("#visibleCount"),
      visibleTotal: $("#visibleTotal"),
      syncStatus: $("#syncStatus"),
      dataCount: $("#dataCount"),
      connStatus: $("#connStatus"),
      legendCard: $("#legendCard"),
      legendKicker: $("#legendKicker"),
      legendTitle: $("#legendTitle"),
      legendSub: $("#legendSub"),
      legendBody: $("#legendBody"),
      legendCount: $("#legendCount"),
      fitBtn: $("#fitBtn"),
      basemapBtn: $("#basemapBtn"),
      basemapLabel: $("#basemapLabel"),
      clearSelBtn: $("#clearSelBtn"),
      basemapBanner: $("#basemapBanner"),
      bannerTitle: $("#bannerTitle"),
      bannerText: $("#bannerText"),
      retryTilesBtn: $("#retryTilesBtn"),
      bannerCloseBtn: $("#bannerCloseBtn"),
      infoCard: $("#infoCard"),
      infoEmpty: $("#infoEmpty"),
      infoContent: $("#infoContent"),
      dataDrawer: $("#dataDrawer"),
      methodDrawer: $("#methodDrawer"),
      openMethodBtn: $("#openMethodBtn"),
      openDataBtn: $("#openDataBtn"),
      openSidebarBtn: $("#openSidebarBtn"),
      sideCloseBtn: $("#sideCloseBtn"),
      tableSearch: $("#tableSearch"),
      pageSize: $("#pageSize"),
      tableCount: $("#tableCount"),
      exportCsvBtn: $("#exportCsvBtn"),
      tableWrap: $("#tableWrap"),
      dataTable: $("#dataTable"),
      tableHead: $("#tableHead"),
      tableBody: $("#tableBody"),
      tableRange: $("#tableRange"),
      pager: $("#pager"),
      varDictionary: $("#varDictionary"),
      toast: $("#toast"),
      emptyResetBtn: $("#emptyResetBtn"),
    };

    /* ---------------------------------------------------------------- */
    /* Utilidades de datos                                              */
    /* ---------------------------------------------------------------- */

    const isLog = () => state.scale === "log";
    const tf = (value) => (isLog() ? signedLog(value) : value);
    const invTf = (value) => (isLog() ? signedExp(value) : value);
    const variableMeta = (code) => VAR_BY_CODE.get(code) || null;
    const columnMeta = (key) => COL_BY_KEY.get(key) || null;

    function fmt(value, decimals) {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "—";
      }
      const d = Math.max(0, Math.min(8, Number(decimals) || 0));
      return new Intl.NumberFormat("es-ES", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }).format(Number(value));
    }

    function fmtVar(value, code) {
      const vm = variableMeta(code);
      return fmt(value, vm ? vm.decimals : 2);
    }

    function unitOf(code) {
      const vm = variableMeta(code);
      return vm && vm.unit ? vm.unit : "";
    }

    function catColor(field, value) {
      const map = CAT_COLORS.get(field);
      if (map && map.has(value)) return map.get(value);
      const cat = CAT_BY_FIELD.get(field);
      return (cat && cat.fallback) || "#7A8785";
    }

    function duplicateSet() {
      return new Set((meta.duplicateIds || []).map(Number));
    }
    const DUPLICATES = duplicateSet();

    function valueStats() {
      const vm = variableMeta(state.variable);
      const zeroMissing = Boolean(vm && vm.zero_missing);
      const values = [];
      let zeros = 0;
      for (const row of state.rows) {
        const v = toNum(row[state.variable]);
        if (v === null) continue;
        if (v === 0) zeros += 1;
        if (zeroMissing && v === 0) continue;
        values.push(v);
      }
      values.sort((a, b) => a - b);
      const positives = values.filter((v) => v > 0);
      return {
        values,
        zeros,
        n: values.length,
        median: values.length ? median(values) : null,
        max: values.length ? values[values.length - 1] : null,
        p95: values.length ? quantile(values, 0.95) : null,
        p95Positive: positives.length ? quantile(positives, 0.95) : null,
      };
    }

    /* ---------------------------------------------------------------- */
    /* Clasificación                                                    */
    /* ---------------------------------------------------------------- */

    function jenksUppers(sorted, k) {
      const n = sorted.length;
      if (!n) return [];
      if (k >= n) return sorted.slice(0, n - 1);
      const pre = [0];
      const pre2 = [0];
      for (const x of sorted) {
        pre.push(pre[pre.length - 1] + x);
        pre2.push(pre2[pre2.length - 1] + x * x);
      }
      const ssd = (i, j) => {
        const w = j - i + 1;
        const s = pre[j + 1] - pre[i];
        const s2 = pre2[j + 1] - pre2[i];
        return s2 - (s * s) / w;
      };
      const dp = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
      const back = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(0));
      dp[0][0] = 0;
      for (let c = 1; c <= k; c++) {
        for (let j = c; j <= n; j++) {
          let best = Infinity;
          let bestI = c - 1;
          for (let i = c - 1; i < j; i++) {
            const cost = dp[c - 1][i] + ssd(i, j - 1);
            if (cost < best) {
              best = cost;
              bestI = i;
            }
          }
          dp[c][j] = best;
          back[c][j] = bestI;
        }
      }
      const uppers = [];
      let j = n;
      for (let c = k; c >= 1; c--) {
        const i = back[c][j];
        if (c > 1) uppers.unshift(sorted[j - 1]);
        j = i;
      }
      return uppers;
    }

    function dedupeSorted(values) {
      const out = [];
      for (const value of values) {
        if (!out.length || value > out[out.length - 1] + 1e-12) out.push(value);
      }
      return out;
    }

    function buildClassModel(values, method) {
      if (!values.length) {
        return { classes: [], min: null, max: null, transformed: false };
      }
      const transformed = isLog();
      const zeroCount = values.filter((v) => v === 0).length;
      const reserveZero =
        method === "quantile" &&
        zeroCount >= Math.max(3, Math.floor(values.length * 0.05)) &&
        zeroCount < values.length;
      const source = reserveZero ? values.filter((v) => v !== 0) : values;
      if (!source.length) {
        return {
          classes: [
            {
              lo: 0,
              hi: 0,
              rawLo: 0,
              rawHi: 0,
              color: VALUE_RAMP[0],
              count: values.length,
              zero: true,
            },
          ],
          min: 0,
          max: 0,
          transformed,
          zeroReserved: true,
        };
      }
      const sorted = source.map(tf).sort((a, b) => a - b);
      const unique = Array.from(new Set(sorted));
      const kMax = reserveZero ? 4 : 5;
      const k = Math.max(1, Math.min(kMax, unique.length));
      let uppers;
      if (k === 1) {
        uppers = [sorted[sorted.length - 1]];
      } else if (method === "equal") {
        const lo = sorted[0];
        const hi = sorted[sorted.length - 1];
        uppers = Array.from({ length: k }, (_, i) =>
          i === k - 1 ? hi : lo + ((hi - lo) * (i + 1)) / k
        );
      } else if (method === "jenks") {
        /* jenksUppers devuelve los cortes internos; el máximo cierra la
           última clase para obtener exactamente k clases. */
        const target = k;
        const ceiling = Math.min(unique.length, target + 4);
        for (let attempt = target; attempt <= ceiling; attempt++) {
          uppers = jenksUppers(sorted, attempt);
          uppers.push(sorted[sorted.length - 1]);
          uppers = dedupeSorted(uppers);
          if (uppers.length >= target) break;
        }
      } else {
        uppers = Array.from({ length: k }, (_, i) =>
          i === k - 1 ? sorted[sorted.length - 1] : quantile(sorted, (i + 1) / k)
        );
      }
      uppers = dedupeSorted(uppers);
      if (!uppers.length) uppers = [sorted[sorted.length - 1]];
      let colors = rampColors(uppers.length);
      if (reserveZero) {
        colors = uppers.map((_, i) =>
          POSITIVE_RAMP[
            Math.round((i * (POSITIVE_RAMP.length - 1)) / Math.max(1, uppers.length - 1))
          ]
        );
      }
      const classes = uppers.map((hi, i) => {
        const lo = i === 0 ? sorted[0] : uppers[i - 1];
        return {
          lo,
          hi,
          rawLo: invTf(lo),
          rawHi: invTf(hi),
          color: colors[i],
          count: 0,
          zero: false,
        };
      });
      for (const t of sorted) {
        let idx = classes.findIndex((cls) => t <= cls.hi + 1e-12);
        if (idx < 0) idx = classes.length - 1;
        classes[idx].count += 1;
      }
      if (reserveZero) {
        classes.unshift({
          lo: 0,
          hi: 0,
          rawLo: 0,
          rawHi: 0,
          color: VALUE_RAMP[0],
          count: zeroCount,
          zero: true,
        });
      }
      return {
        classes,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        transformed,
        zeroReserved: reserveZero,
      };
    }

    function classIndex(value, classes) {
      const t = tf(value);
      for (let i = 0; i < classes.length; i++) {
        if (t <= classes[i].hi + 1e-12) return i;
      }
      return classes.length - 1;
    }

    /* ---------------------------------------------------------------- */
    /* Mapa                                                             */
    /* ---------------------------------------------------------------- */

    const center = dataset.center || { lat: 37.3891, lng: -5.9845 };
    const map = L.map("map", {
      zoomControl: true,
      minZoom: 10,
      maxZoom: 19,
      preferCanvas: false,
    }).setView([center.lat, center.lng], 13);

    map.zoomControl.setPosition("bottomright");
    L.control
      .scale({ position: "bottomright", metric: true, imperial: false, maxWidth: 120 })
      .addTo(map);

    ["kdePane", "heatPane", "pointPane"].forEach((name, index) => {
      const pane = map.createPane(name);
      pane.style.zIndex = String(380 + index * 35);
    });

    const pointLayer = L.layerGroup().addTo(map);

    let osmLayer = null;
    let basemapMode = "osm";
    let tileErrors = 0;
    let heatLayer = null;
    let kdeLayer = null;
    let ringLayer = null;
    const markers = new Map();

    function makeTileLayer() {
      return L.tileLayer(OSM_URL, {
        maxZoom: 19,
        minZoom: 0,
        attribution: OSM_ATTRIB,
      });
    }

    function setBasemapLabel(mode) {
      if (ui.basemapLabel) ui.basemapLabel.textContent = mode === "osm" ? "OSM" : "Neutro";
      if (ui.basemapBtn) {
        ui.basemapBtn.title =
          mode === "osm"
            ? "Cambiar a un fondo neutro sin teselas"
            : "Volver a las teselas de OpenStreetMap";
        ui.basemapBtn.setAttribute("aria-pressed", mode === "osm" ? "true" : "false");
        ui.basemapBtn.classList.toggle("is-on", mode === "osm");
      }
    }

    function showTilesBanner() {
      if (!ui.basemapBanner) return;
      ui.basemapBanner.hidden = false;
      if (ui.mapPanel) {
        /* Desplaza leyenda y herramientas para que el aviso no las tape. */
        const offset = ui.basemapBanner.offsetTop + ui.basemapBanner.offsetHeight + 8;
        ui.mapPanel.style.setProperty("--tiles-banner-offset", `${offset}px`);
        ui.mapPanel.classList.add("has-tiles-banner");
      }
    }

    function hideTilesBanner() {
      if (!ui.basemapBanner) return;
      ui.basemapBanner.hidden = true;
      if (ui.mapPanel) {
        ui.mapPanel.classList.remove("has-tiles-banner");
        ui.mapPanel.style.removeProperty("--tiles-banner-offset");
      }
    }

    function useNeutralBasemap(announce) {
      if (osmLayer && map.hasLayer(osmLayer)) map.removeLayer(osmLayer);
      basemapMode = "neutral";
      ui.map.classList.add("basemap-neutral");
      setBasemapLabel("neutral");
      if (announce) showTilesBanner();
    }

    function useOsmBasemap(announce) {
      if (osmLayer && map.hasLayer(osmLayer)) map.removeLayer(osmLayer);
      tileErrors = 0;
      osmLayer = makeTileLayer();
      osmLayer.on("tileerror", () => {
        tileErrors += 1;
        if (tileErrors >= 3 && basemapMode === "osm") {
          useNeutralBasemap(true);
        }
      });
      osmLayer.on("tileload", () => {
        tileErrors = 0;
      });
      osmLayer.addTo(map);
      basemapMode = "osm";
      ui.map.classList.remove("basemap-neutral");
      setBasemapLabel("osm");
      hideTilesBanner();
      if (announce) showToast("Reintentando cargar las teselas de OpenStreetMap…");
    }

    function fitExtent() {
      const ext = dataset.extent;
      if (!ext) return;
      map.fitBounds(
        [
          [ext.south, ext.west],
          [ext.north, ext.east],
        ],
        { padding: [34, 34], maxZoom: 15 }
      );
    }

    function fitVisible() {
      const pts = [];
      for (const row of state.rows) {
        const lat = toNum(row.Latitud);
        const lng = toNum(row.Longitud);
        if (lat !== null && lng !== null) pts.push([lat, lng]);
      }
      if (!pts.length) {
        fitExtent();
        return;
      }
      if (pts.length === 1) {
        map.setView(pts[0], 16);
        return;
      }
      map.fitBounds(L.latLngBounds(pts), { padding: [52, 52], maxZoom: 16 });
    }

    function addKdeLayer() {
      if (!meta.kde || !meta.kde.url) return false;
      if (!kdeLayer) {
        kdeLayer = L.imageOverlay(meta.kde.url, meta.kde.bounds, {
          opacity: state.kdeOpacity,
          pane: "kdePane",
          className: "kde-overlay",
          interactive: false,
          crossOrigin: false,
        });
      }
      if (!map.hasLayer(kdeLayer)) kdeLayer.addTo(map);
      return true;
    }

    function removeKdeLayer() {
      if (kdeLayer && map.hasLayer(kdeLayer)) map.removeLayer(kdeLayer);
    }

    function clearSelection(options) {
      const opts = options || {};
      state.selectedId = null;
      if (ringLayer) {
        map.removeLayer(ringLayer);
        ringLayer = null;
      }
      clearInfo();
      updateTableSelection();
      if (opts.closePopup !== false) map.closePopup();
    }

    function renderRing() {
      if (ringLayer) {
        map.removeLayer(ringLayer);
        ringLayer = null;
      }
      if (state.selectedId === null) return;
      const marker = markers.get(Number(state.selectedId));
      if (!marker) return;
      const radius = (marker._appRadius || 5) + 6;
      ringLayer = L.circleMarker(marker.getLatLng(), {
        pane: "pointPane",
        radius: radius,
        color: "#D9532B",
        weight: 2,
        opacity: 0.95,
        fill: false,
        interactive: false,
        className: "selected-ring",
      });
      ringLayer.addTo(map);
      marker.bringToFront();
    }

    function selectRow(row, options) {
      const opts = options || {};
      if (!row) return;
      const id = Number(row.id);
      state.selectedId = id;
      renderRing();
      renderInfo(row);
      updateTableSelection();
      const marker = markers.get(id);
      if (marker) marker.bringToFront();
      if (opts.center) {
        const lat = toNum(row.Latitud);
        const lng = toNum(row.Longitud);
        if (lat !== null && lng !== null) {
          map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { duration: 0.65 });
        }
      }
    }

    /* ---------------------------------------------------------------- */
    /* Fichas (popup e información)                                     */
    /* ---------------------------------------------------------------- */

    function infoTags(row) {
      return meta.categoricals
        .map((cat) => {
          const value = row[cat.field];
          if (value === null || value === undefined || value === "") return "";
          return `<span class="info-tag" style="--c:${esc(
            catColor(cat.field, value)
          )}"><i></i>${esc(value)}</span>`;
        })
        .join("");
    }

    function popupTags(row) {
      return meta.categoricals
        .map((cat) => {
          const value = row[cat.field];
          if (value === null || value === undefined || value === "") return "";
          return `<span class="pop-tag" style="--c:${esc(
            catColor(cat.field, value)
          )}"><i></i>${esc(value)}</span>`;
        })
        .join("");
    }

    function valueCell(label, value) {
      return `<div class="pop-row"><span>${esc(label)}</span><b>${value}</b></div>`;
    }

    function popupHtml(row) {
      const vm = variableMeta(state.variable);
      const v = toNum(row[state.variable]);
      const id = Number(row.id);
      const name = row.recurso || "Sin nombre";
      const display =
        v === null ? "—" : vm && vm.zero_missing && v === 0 ? "0" : fmt(v, vm ? vm.decimals : 2);
      const unit = vm && vm.unit ? vm.unit : "";
      const notes = [];
      if (Number(row.v3) === 0) {
        notes.push(
          `<p class="pop-note"><b>v3 = 0</b> significa que el recurso no figura en TripAdvisor; no es el puesto 1.</p>`
        );
      }
      if (DUPLICATES.has(id)) {
        notes.push(
          `<p class="pop-note">Este registro comparte coordenada con otro recurso del dataset. Se conservan ambos.</p>`
        );
      }
      const lat = toNum(row.Latitud);
      const lng = toNum(row.Longitud);
      return `<div class="pop">
        <div class="pop-kicker">Recurso · ID ${id}</div>
        <h3>${esc(name)}</h3>
        <div class="pop-tags">${popupTags(row)}</div>
        <div class="pop-main">
          <span>${esc(vm ? vm.short : state.variable)}</span>
          <div><b>${esc(display)}</b> <i>${esc(unit)}</i></div>
        </div>
        <div class="pop-grid">
          ${valueCell("v4p presencia", fmtVar(row.v4p, "v4p"))}
          ${valueCell("v3 ranking", row.v3 === null || row.v3 === undefined ? "—" : fmtVar(row.v3, "v3"))}
          ${valueCell("v1a reseñas Google", fmtVar(row.v1a, "v1a"))}
          ${valueCell("v1b reseñas TA", fmtVar(row.v1b, "v1b"))}
          ${valueCell("v5 distancia", fmtVar(row.v5, "v5") + " m")}
          ${valueCell("v2p calidad", fmtVar(row.v2p, "v2p"))}
        </div>
        ${notes.join("")}
        <div style="margin-top:7px;font-family:var(--mono);font-size:8.5px;color:var(--muted)">
          ${lat === null ? "—" : fmt(lat, 6)} , ${lng === null ? "—" : fmt(lng, 6)}
        </div>
        <button type="button" class="pop-link" data-pop-table="${id}">
          Ver los 33 campos en la tabla
        </button>
      </div>`;
    }

    function renderInfo(row) {
      ui.infoEmpty.hidden = true;
      ui.infoContent.hidden = false;
      const vm = variableMeta(state.variable);
      const v = toNum(row[state.variable]);
      const id = Number(row.id);
      const stats = valueStats();
      const p95 = stats.p95Positive;
      const pct =
        v !== null && p95 !== null && p95 > 0 ? clamp((v / p95) * 100, 0, 100) : 0;
      const display =
        v === null ? "—" : vm && vm.zero_missing && v === 0 ? "0" : fmt(v, vm ? vm.decimals : 2);
      const unit = vm && vm.unit ? vm.unit : "";
      const mainNote =
        vm && vm.zero_missing && v === 0
          ? "Sin presencia en TripAdvisor: el 0 no es un puesto del ranking."
          : p95 !== null && p95 > 0
          ? `Valor frente al p95 de los visibles (${fmtVar(p95, state.variable)}).`
          : "No hay valores positivos entre los recursos visibles.";
      const ranking =
        row.v3 === null || row.v3 === undefined
          ? "—"
          : fmtVar(row.v3, "v3") + (Number(row.v3) === 0 ? " · ausente" : "");
      const lat = toNum(row.Latitud);
      const lng = toNum(row.Longitud);
      ui.infoContent.innerHTML = `<div class="info-head">
          <span class="info-kicker">Recurso seleccionado</span>
          <span class="info-id">ID ${id}</span>
          <button type="button" class="info-close" data-info-close aria-label="Cerrar la ficha">
            <svg><use href="#i-x"/></svg>
          </button>
        </div>
        <div class="info-body">
          <div class="info-name">${esc(row.recurso || "Sin nombre")}</div>
          <div class="info-tags">${infoTags(row)}</div>
          <div class="info-main">
            <div class="info-main-label">${esc(vm ? vm.short : state.variable)}<br>${esc(unit)}</div>
            <div class="info-value"><b>${esc(display)}</b><i>${esc(unit)}</i></div>
          </div>
          <div class="rank-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
          <p class="rank-caption">${esc(mainNote)}</p>
          <div class="info-grid">
            <div class="info-cell"><span>Ranking TripAdvisor</span><b>${esc(ranking)}</b></div>
            <div class="info-cell"><span>Reseñas Google</span><b>${fmtVar(row.v1a, "v1a")}</b></div>
            <div class="info-cell"><span>Distancia a La Giralda</span><b>${fmtVar(row.v5, "v5")} m</b></div>
            <div class="info-cell"><span>Calidad ponderada</span><b>${fmtVar(row.v2p, "v2p")}</b></div>
          </div>
          <div class="info-coords">
            <code>${lat === null ? "—" : fmt(lat, 6)}, ${lng === null ? "—" : fmt(lng, 6)}</code>
            <button type="button" class="copy-btn" data-copy-coords title="Copiar coordenadas" aria-label="Copiar coordenadas">
              <svg><use href="#i-copy"/></svg>
            </button>
          </div>
          <div class="info-actions">
            <button type="button" class="btn small" data-info-table>Ver en tabla</button>
            <button type="button" class="btn small" data-info-zoom>Centrar</button>
          </div>
        </div>`;
    }

    function clearInfo() {
      ui.infoContent.hidden = true;
      ui.infoContent.innerHTML = "";
      ui.infoEmpty.hidden = false;
    }

    /* ---------------------------------------------------------------- */
    /* Capas                                                            */
    /* ---------------------------------------------------------------- */

    function pointOptions(row) {
      const vm = variableMeta(state.variable);
      const v = toNum(row[state.variable]);
      const isHollow = v === null || (vm && vm.zero_missing && v === 0);

      if (state.mode === "heat") {
        return {
          radius: 2.3,
          color: "#ffffff",
          weight: 0.8,
          opacity: 0.65,
          fillColor: "#16211F",
          fillOpacity: 0.38,
        };
      }

      if (state.mode === "category") {
        return {
          radius: 7,
          color: "#ffffff",
          weight: 1.4,
          opacity: 0.95,
          fillColor: catColor(state.categorical, row[state.categorical]),
          fillOpacity: 0.92,
        };
      }

      if (isHollow) {
        return {
          radius: 5.4,
          color: "#6D7873",
          weight: 1.3,
          opacity: 0.9,
          dashArray: "2.5 2.5",
          fillColor: "#6D7873",
          fillOpacity: 0,
        };
      }

      const classes = state.classes;
      if (!classes.length) {
        return {
          radius: 5,
          color: "#fff",
          weight: 1,
          fillColor: "#7A8785",
          fillOpacity: 0.9,
        };
      }
      const idx = classIndex(v, classes);
      const cls = classes[idx];
      const span = cls.hi - cls.lo;
      const fraction = span > 0 ? clamp((tf(v) - cls.lo) / span, 0, 1) : 0.5;
      const norm = (idx + fraction) / classes.length;
      return {
        radius: 4.2 + 8.6 * norm,
        color: "#ffffff",
        weight: 1.3,
        opacity: 0.95,
        fillColor: cls.color,
        fillOpacity: 0.93,
      };
    }

    function renderPoints() {
      pointLayer.clearLayers();
      markers.clear();
      state.classes = [];

      if (state.mode === "graduated") {
        const vm = variableMeta(state.variable);
        const values = [];
        for (const row of state.rows) {
          const v = toNum(row[state.variable]);
          if (v === null) continue;
          if (vm && vm.zero_missing && v === 0) continue;
          values.push(v);
        }
        state.classes = buildClassModel(values, state.classification).classes;
      }

      for (const row of state.rows) {
        const lat = toNum(row.Latitud);
        const lng = toNum(row.Longitud);
        if (lat === null || lng === null) continue;
        const opts = pointOptions(row);
        const marker = L.circleMarker([lat, lng], Object.assign({}, opts, { pane: "pointPane" }));
        marker._appRadius = opts.radius;
        marker._row = row;
        marker.bindPopup(() => popupHtml(row), {
          maxWidth: 310,
          minWidth: 268,
          className: "app-popup",
          closeButton: true,
          autoPan: true,
          autoPanPadding: [24, 84],
        });
        const vm = variableMeta(state.variable);
        const v = toNum(row[state.variable]);
        const valueText =
          v === null
            ? "sin dato"
            : vm && vm.zero_missing && v === 0
            ? "0 · sin presencia"
            : fmt(v, vm ? vm.decimals : 2) + (vm && vm.unit ? " " + vm.unit : "");
        marker.bindTooltip(
          `<b>${esc(row.recurso || "Sin nombre")}</b><br><span>${esc(
            vm ? vm.short : state.variable
          )}: ${esc(valueText)}</span>`,
          {
            direction: "top",
            className: "app-tooltip",
            opacity: 1,
            offset: [0, -4],
            sticky: false,
          }
        );
        marker.on("click", () => selectRow(row, { center: false }));
        pointLayer.addLayer(marker);
        markers.set(Number(row.id), marker);
      }
      renderRing();
    }

    function renderHeat() {
      if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
      }
      state.heatP95 = 0;
      if (state.mode !== "heat") return;
      const positives = [];
      for (const row of state.rows) {
        const v = toNum(row[state.variable]);
        if (v !== null && v > 0) positives.push(v);
      }
      if (!positives.length) return;
      positives.sort((a, b) => a - b);
      const p95 = quantile(positives, 0.95) || positives[positives.length - 1] || 1;
      state.heatP95 = p95;
      const points = [];
      for (const row of state.rows) {
        const v = toNum(row[state.variable]);
        const lat = toNum(row.Latitud);
        const lng = toNum(row.Longitud);
        if (v === null || v <= 0 || lat === null || lng === null) continue;
        points.push([lat, lng, Math.min(v / p95, 1)]);
      }
      if (!points.length) return;
      heatLayer = L.heatLayer(points, {
        radius: 34,
        blur: 24,
        maxZoom: 17,
        /* Suelo de opacidad: los valores positivos bajos siguen siendo
           visibles; la intensidad relativa la marca v/p95. */
        minOpacity: 0.42,
        gradient: HEAT_GRADIENT,
      });
      heatLayer.addTo(map);
    }

    /* ---------------------------------------------------------------- */
    /* Leyenda                                                          */
    /* ---------------------------------------------------------------- */

    function classificationLabel() {
      if (state.classification === "equal") return "intervalos iguales";
      if (state.classification === "jenks") return "natural breaks (Jenks)";
      return "cuantiles";
    }

    function legendClassRows(classes, decimals, zeroMissing) {
      let html = "";
      if (zeroMissing) {
        const zeroCount = state.rows.filter((row) => toNum(row.v3) === 0).length;
        html += `<div class="legend-class">
          <span class="sw" style="background:transparent;border:1.5px dashed #6D7873"></span>
          <span class="lbl">0 · sin presencia</span>
          <span class="n">${zeroCount}</span>
        </div>`;
      }
      for (const cls of classes) {
        html += `<div class="legend-class">
          <span class="sw" style="background:${cls.color}"></span>
          <span class="lbl">${
            cls.zero ? "0" : `${esc(fmt(cls.rawLo, decimals))} – ${esc(fmt(cls.rawHi, decimals))}`
          }</span>
          <span class="n">${cls.count}</span>
        </div>`;
      }
      return html;
    }

    function renderLegend() {
      const vm = variableMeta(state.variable);
      const decimals = vm ? vm.decimals : 2;
      const zeroMissing = Boolean(vm && vm.zero_missing);
      ui.legendCount.textContent = `${state.visible} recursos`;

      if (state.mode === "heat") {
        ui.legendKicker.textContent = "Densidad ponderada";
        ui.legendTitle.textContent = vm ? vm.short : state.variable;
        ui.legendSub.textContent =
          "Suma local de pesos normalizados · no es el valor de un punto";
        const heatStops = Object.keys(HEAT_GRADIENT)
          .map(Number)
          .sort((a, b) => a - b)
          .map((stop) => `${HEAT_GRADIENT[stop]} ${Math.round(stop * 100)}%`)
          .join(",");
        let body = `<div class="legend-ramp" style="background:linear-gradient(90deg,${heatStops})"></div>
        <div class="legend-scale"><span>0</span><span>peso ≥ 1</span></div>`;
        if (state.heatP95 > 0) {
          body += `<p class="legend-note">Cada recurso pesa <b>min(valor / p95, 1)</b>. p95 de los visibles: <b>${esc(
            fmt(state.heatP95, decimals)
          )}</b>. La mancha indica concentración espacial, no la magnitud de un recurso concreto. Se aplica un suelo de opacidad para que los valores positivos bajos sigan siendo visibles.</p>`;
        } else {
          body += `<p class="legend-note"><b>Ningún recurso visible tiene valor &gt; 0.</b> No se dibuja superficie de calor; los puntos siguen siendo consultables.</p>`;
        }
        ui.legendBody.innerHTML = body;
      } else if (state.mode === "graduated") {
        ui.legendKicker.textContent = `Graduado · ${state.classes.length || 0} clases`;
        ui.legendTitle.textContent = vm ? vm.short : state.variable;
        ui.legendSub.textContent = `${classificationLabel()}${
          isLog() ? " · escala log10(1+|x|)" : " · escala lineal"
        }`;
        if (!state.classes.length) {
          ui.legendBody.innerHTML = `<p class="legend-note">No hay valores clasificables entre los recursos visibles.</p>`;
        } else {
          let body = `<div class="legend-classes">${legendClassRows(
            state.classes,
            decimals,
            zeroMissing
          )}</div>`;
          const hasZeroClass = state.classes.some((cls) => cls.zero);
          body += `<p class="legend-note">El tamaño del punto crece con el valor. ${
            zeroMissing
              ? "Los ceros se dibujan huecos y quedan fuera de la clasificación."
              : hasZeroClass
              ? "Los ceros forman una clase propia; el resto se clasifica sobre los valores positivos."
              : "Los ceros participan como valor mínimo."
          }</p>`;
          ui.legendBody.innerHTML = body;
        }
      } else {
        const cat = CAT_BY_FIELD.get(state.categorical);
        ui.legendKicker.textContent = "Categorías";
        ui.legendTitle.textContent = cat ? cat.label : state.categorical;
        ui.legendSub.textContent = "Color categórico · tamaño constante";
        const counts = new Map();
        for (const row of state.rows) {
          const value = row[state.categorical];
          counts.set(value, (counts.get(value) || 0) + 1);
        }
        let body = `<div class="legend-classes">`;
        if (cat) {
          for (const item of cat.values) {
            body += `<div class="legend-class">
              <span class="sw" style="background:${item.color}"></span>
              <span class="lbl">${esc(item.value)}</span>
              <span class="n">${counts.get(item.value) || 0}</span>
            </div>`;
          }
        }
        body += `</div><p class="legend-note">${esc(
          cat && cat.note ? cat.note : "Recuento dentro de los filtros activos."
        )}</p>`;
        ui.legendBody.innerHTML = body;
      }

      if (state.kde && meta.kde) {
        const kde = meta.kde;
        const colors = kde.classes.map((c) => c.color).join(",");
        let kdeHtml = `<div class="legend-kde">
          <div class="legend-kde-head"><b>Densidad KDE</b><span class="kde-pill">recursos/km²</span></div>
          <div class="kde-ramp" style="background:linear-gradient(90deg,${colors})"></div>
          <div class="kde-breaks">`;
        for (const cls of kde.classes) {
          kdeHtml += `<span><i style="background:${cls.color}"></i>${esc(cls.label)}</span>`;
        }
        kdeHtml += `</div><p class="legend-note">Superficie fija de los <b>${
          dataset.v4p_positive || 50
        } recursos con v4p &gt; 0</b>; no se recalcula con los filtros ni representa la variable seleccionada.</p></div>`;
        ui.legendBody.innerHTML += kdeHtml;
      }
    }

    /* ---------------------------------------------------------------- */
    /* Histograma y estadísticas                                        */
    /* ---------------------------------------------------------------- */

    function renderVariablePanel() {
      const vm = variableMeta(state.variable);
      ui.varDesc.textContent = vm ? vm.desc : "";
      const stats = valueStats();
      ui.statN.textContent = String(stats.n);
      ui.statMed.textContent =
        stats.median === null ? "—" : fmtVar(stats.median, state.variable);
      ui.statMax.textContent =
        stats.max === null ? "—" : fmtVar(stats.max, state.variable);
      ui.statZero.textContent = String(stats.zeros);
      ui.histCaption.textContent = vm && vm.zero_missing
        ? `Distribución de ${stats.n} con presencia`
        : `Distribución de ${stats.n} visibles`;
      ui.histMedian.textContent =
        stats.median === null ? "—" : fmtVar(stats.median, state.variable);

      if (stats.zeros > 0) {
        ui.zeroNote.hidden = false;
        ui.zeroNote.textContent = vm && vm.zero_missing
          ? `${stats.zeros} recursos con 0: no figuran en TripAdvisor. Se dibujan huecos y se excluyen de la clasificación.`
          : `${stats.zeros} recursos con valor 0. Se conservan y participan como valor mínimo; no se imputa ningún dato.`;
      } else {
        ui.zeroNote.hidden = true;
        ui.zeroNote.textContent = "";
      }
      renderHistogram(stats.values, vm);
    }

    function renderHistogram(values, vm) {
      const W = 320;
      const H = 66;
      const bottom = 65;
      if (!values.length) {
        ui.hist.innerHTML = `<line x1="0" y1="${bottom}" x2="${W}" y2="${bottom}" stroke="#e1dbcc" stroke-width="1"/>`;
        return;
      }
      const sorted = values.slice().sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const bins = 22;
      const counts = new Array(bins).fill(0);
      if (min === max) {
        counts[Math.floor(bins / 2)] = sorted.length;
      } else {
        for (const value of sorted) {
          let idx = Math.floor(((value - min) / (max - min)) * bins);
          if (idx >= bins) idx = bins - 1;
          if (idx < 0) idx = 0;
          counts[idx] += 1;
        }
      }
      const maxCount = Math.max.apply(null, counts.concat([1]));
      const barWidth = W / bins;
      let svg = "";
      for (let i = 0; i < bins; i++) {
        if (!counts[i]) continue;
        const h = Math.max(1.5, (counts[i] / maxCount) * 52);
        const x = i * barWidth;
        const lo = min === max ? min : min + ((max - min) * i) / bins;
        const hi = min === max ? max : min + ((max - min) * (i + 1)) / bins;
        const label = `${fmt(lo, vm ? vm.decimals : 2)} – ${fmt(
          hi,
          vm ? vm.decimals : 2
        )}: ${counts[i]}`;
        svg += `<rect x="${(x + 0.7).toFixed(2)}" y="${(bottom - h).toFixed(
          2
        )}" width="${(barWidth - 1.4).toFixed(2)}" height="${h.toFixed(
          2
        )}" rx="1" fill="#D9532B" fill-opacity="0.72"><title>${esc(
          label
        )}</title></rect>`;
      }
      const med = quantile(sorted, 0.5);
      const medX =
        min === max ? W / 2 : ((med - min) / (max - min)) * W;
      svg += `<line x1="${medX.toFixed(2)}" y1="4" x2="${medX.toFixed(
        2
      )}" y2="${bottom}" stroke="#16211F" stroke-width="1" stroke-dasharray="2 2" opacity="0.55" vector-effect="non-scaling-stroke"/>`;
      svg += `<line x1="0" y1="${bottom}" x2="${W}" y2="${bottom}" stroke="#e1dbcc" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      ui.hist.innerHTML = svg;
    }

    /* ---------------------------------------------------------------- */
    /* Controles de variable y representación                           */
    /* ---------------------------------------------------------------- */

    function populateSelects() {
      (meta.variableGroups || []).forEach((group) => {
        const og = document.createElement("optgroup");
        og.label = group;
        meta.variables
          .filter((v) => v.group === group)
          .forEach((v) => {
            const opt = document.createElement("option");
            opt.value = v.code;
            opt.textContent = `${v.code} · ${v.label}`;
            og.appendChild(opt);
          });
        ui.varSelect.appendChild(og);
      });
      ui.varSelect.value = state.variable;

      meta.categoricals.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat.field;
        opt.textContent = `${cat.label} (${cat.field})`;
        ui.catFieldSelect.appendChild(opt);
      });
      ui.catFieldSelect.value = state.categorical;

      const numericFields = meta.numericFields || [];
      (meta.variableGroups || []).forEach((group) => {
        const fields = numericFields.filter((f) => {
          if (f.technical) return false;
          const vm = variableMeta(f.key);
          return vm && vm.group === group;
        });
        if (!fields.length) return;
        const og = document.createElement("optgroup");
        og.label = group;
        fields.forEach((f) => {
          const opt = document.createElement("option");
          opt.value = f.key;
          opt.textContent = f.label;
          og.appendChild(opt);
        });
        ui.numField.appendChild(og);
      });
      const technical = numericFields.filter((f) => f.technical);
      if (technical.length) {
        const og = document.createElement("optgroup");
        og.label = "Campos técnicos (avanzado)";
        technical.forEach((f) => {
          const opt = document.createElement("option");
          opt.value = f.key;
          opt.textContent = `${f.label} · ${f.key}`;
          og.appendChild(opt);
        });
        ui.numField.appendChild(og);
      }
      ui.numField.value = state.numeric.field;

      ui.classSelect.value = state.classification;
      ui.scaleSelect.value = state.scale;

      (meta.categoricals || []).forEach((cat) => {
        const host = document.getElementById("chips-" + cat.field);
        if (!host) return;
        cat.values.forEach((item) => {
          const label = document.createElement("label");
          label.className = "check-chip";
          label.style.setProperty("--c", item.color);
          label.title = `${item.value} · ${item.count} recursos en total`;
          label.innerHTML = `<input type="checkbox" value="${esc(
            item.value
          )}" data-field="${esc(cat.field)}"><span class="dot"></span><span class="lbl">${esc(
            item.value
          )}</span><span class="cnt">${item.count}</span>`;
          host.appendChild(label);
        });
      });

      $$("[data-fact]").forEach((el) => {
        const key = el.getAttribute("data-fact");
        if (key && dataset[key] !== undefined) el.textContent = String(dataset[key]);
      });
      if (meta.kde) {
        $$("[data-kde]").forEach((el) => {
          const key = el.getAttribute("data-kde");
          if (key === "cell") el.textContent = String(meta.kde.cell_m);
          if (key === "bandwidth") el.textContent = String(meta.kde.bandwidth_m);
        });
      }
      renderVarDictionary();
    }

    function renderVarDictionary() {
      if (!ui.varDictionary) return;
      let html = "";
      (meta.variableGroups || []).forEach((group) => {
        const vars = meta.variables.filter((v) => v.group === group);
        if (!vars.length) return;
        html += `<div class="var-dict-group"><div class="var-dict-head">${esc(
          group
        )}</div>`;
        vars.forEach((v) => {
          html += `<div class="var-dict-row"><code>${esc(v.code)}</code><div><b>${esc(
            v.label
          )}</b><span>${esc(v.desc)}</span></div></div>`;
        });
        html += `</div>`;
      });
      ui.varDictionary.innerHTML = html;
    }

    function setMode(mode) {
      state.mode = mode;
      $$("button[data-mode]", ui.modeSeg).forEach((btn) => {
        const on = btn.getAttribute("data-mode") === mode;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      ui.catFieldBlock.hidden = mode !== "category";
      ui.classBlock.hidden = mode !== "graduated";
      ui.modeHint.textContent =
        mode === "heat"
          ? "La intensidad del calor es una densidad ponderada, no un valor por recurso."
          : mode === "graduated"
          ? "Color y tamaño representan el valor del recurso; los ceros ausentes se dibujan huecos."
          : "El color representa el campo categórico elegido y el tamaño es constante.";
      renderPoints();
      renderHeat();
      renderLegend();
      if (state.selectedId !== null) {
        const row = state.rows.find((r) => Number(r.id) === Number(state.selectedId));
        if (row) renderInfo(row);
      }
    }

    function setVariable(code) {
      if (!variableMeta(code)) return;
      state.variable = code;
      ui.varSelect.value = code;
      renderVariablePanel();
      renderPoints();
      renderHeat();
      renderLegend();
      if (state.selectedId !== null) {
        const row = state.rows.find((r) => Number(r.id) === Number(state.selectedId));
        if (row) renderInfo(row);
      }
    }

    /* ---------------------------------------------------------------- */
    /* Filtros                                                          */
    /* ---------------------------------------------------------------- */

    let sendTimer = null;
    let syncTimer = null;

    function setConn(status, label, title) {
      if (!ui.connStatus) return;
      ui.connStatus.dataset.state = status;
      const span = $("span", ui.connStatus);
      if (span) span.textContent = label;
      ui.connStatus.title = title || label;
    }

    function setBusy(on) {
      if (ui.connStatus) ui.connStatus.classList.toggle("is-busy", Boolean(on));
    }

    function showSync(text, keep) {
      if (!ui.syncStatus) return;
      ui.syncStatus.textContent = text;
      ui.syncStatus.classList.add("show");
      clearTimeout(syncTimer);
      if (!keep) {
        syncTimer = setTimeout(() => ui.syncStatus.classList.remove("show"), 1300);
      }
    }

    function currentFilters() {
      return {
        _seq: state.seq,
        q: state.search,
        categories: {
          categoria: state.categories.categoria.slice(),
          origen: state.categories.origen.slice(),
          Destino_Final: state.categories.Destino_Final.slice(),
        },
        binary: state.binary,
        numeric: {
          active: Boolean(state.numeric.active),
          field: state.numeric.field,
          min: state.numeric.min,
          max: state.numeric.max,
          include_missing: Boolean(state.numeric.includeMissing),
        },
      };
    }

    function sendFilters() {
      if (!state.shinyReady || !window.Shiny || !window.Shiny.setInputValue) {
        return;
      }
      clearTimeout(sendTimer);
      state.seq += 1;
      const payload = currentFilters();
      try {
        window.Shiny.setInputValue("filters", payload, { priority: "event" });
      } catch (err) {
        console.error("No se pudieron enviar los filtros.", err);
        setConn("error", "Error", "No se pudieron enviar los filtros al servidor");
        return;
      }
      setBusy(true);
      showSync("Actualizando…", true);
    }

    function scheduleSend(wait) {
      clearTimeout(sendTimer);
      sendTimer = setTimeout(sendFilters, wait || 180);
    }

    function syncChipsFromState() {
      (meta.categoricals || []).forEach((cat) => {
        const selected = new Set(state.categories[cat.field] || []);
        $$(`#chips-${cat.field} input[type="checkbox"]`).forEach((input) => {
          input.checked = selected.has(input.value);
        });
        const clear = document.querySelector(`[data-clear-chip="${cat.field}"]`);
        if (clear) clear.hidden = !selected.size;
      });
      const counts = state.facets || {};
      (meta.categoricals || []).forEach((cat) => {
        const fieldCounts = counts[cat.field] || {};
        $$(`#chips-${cat.field} .check-chip`).forEach((label) => {
          const input = $('input[type="checkbox"]', label);
          if (!input) return;
          const n = fieldCounts[input.value];
          const cnt = $(".cnt", label);
          if (cnt) cnt.textContent = String(n === undefined ? 0 : n);
        });
      });
    }

    function activeFilterChips() {
      const chips = [];
      const removeBtn = (kind, value, field) =>
        `<button type="button" data-remove="${kind}" data-value="${esc(
          value || ""
        )}" data-field="${esc(field || "")}" aria-label="Quitar este filtro">
          <svg><use href="#i-x"/></svg>
        </button>`;
      if (state.search.trim()) {
        chips.push(`<span class="filter-chip"><span>Texto: <b>«${esc(
          state.search.trim()
        )}»</b></span>${removeBtn("search")}</span>`);
      }
      (meta.categoricals || []).forEach((cat) => {
        (state.categories[cat.field] || []).forEach((value) => {
          chips.push(`<span class="filter-chip"><span class="fc-dot" style="--c:${esc(
            catColor(cat.field, value)
          )}"></span><span><b>${esc(cat.short)}:</b> ${esc(value)}</span>${removeBtn(
            "category",
            value,
            cat.field
          )}</span>`);
        });
      });
      if (state.binary !== "all") {
        chips.push(`<span class="filter-chip"><span><b>TripAdvisor:</b> ${
          state.binary === "1" ? "Sí" : "No"
        }</span>${removeBtn("binary")}</span>`);
      }
      if (state.numeric.active) {
        const lo = state.numeric.min === null ? "mín." : fmtNum(state.numeric.min);
        const hi = state.numeric.max === null ? "máx." : fmtNum(state.numeric.max);
        chips.push(`<span class="filter-chip"><span><b>${esc(
          state.numeric.field
        )}:</b> ${esc(lo)} – ${esc(hi)}</span>${removeBtn(
          "numeric"
        )}</span>`);
      }
      if (state.numeric.active && state.numeric.includeMissing) {
        chips.push(`<span class="filter-chip"><span>Incluye sin dato</span>${removeBtn(
          "missing"
        )}</span>`);
      }
      return chips;
    }

    function renderActiveFilters() {
      const chips = activeFilterChips();
      ui.activeFilters.innerHTML = chips.length
        ? chips.join("")
        : `<p class="no-filters">Sin filtros activos · se muestran los ${state.total} recursos.</p>`;
    }

    function readChips() {
      (meta.categoricals || []).forEach((cat) => {
        state.categories[cat.field] = $$(
          `#chips-${cat.field} input[type="checkbox"]:checked`
        ).map((input) => input.value);
      });
    }

    function clearFilters(options) {
      const opts = options || {};
      state.search = "";
      state.categories = { categoria: [], origen: [], Destino_Final: [] };
      state.binary = "all";
      state.numeric.active = false;
      state.numeric.min = null;
      state.numeric.max = null;
      state.numeric.includeMissing = false;
      ui.searchInput.value = "";
      syncChipsFromState();
      $$("button[data-binary]", ui.binarySeg).forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-binary") === "all");
      });
      syncNumericUi();
      renderActiveFilters();
      if (opts.silent !== true) sendFilters();
    }

    function resetAll() {
      state.variable = defaults.variable || "v4p";
      state.mode = defaults.mode || "heat";
      state.categorical = defaults.categorical || "categoria";
      state.classification = defaults.classification || "quantile";
      state.scale = "linear";
      ui.varSelect.value = state.variable;
      ui.catFieldSelect.value = state.categorical;
      ui.classSelect.value = state.classification;
      ui.scaleSelect.value = state.scale;
      state.kdeOpacity = 0.82;
      ui.kdeOpacity.value = "82";
      ui.kdeOpacityVal.textContent = "82 %";
      setKde(false, true);
      clearFilters({ silent: true });
      state.numeric.field = defaults.variable || "v4p";
      ui.numField.value = state.numeric.field;
      clearSelection();
      state.table.q = "";
      state.table.sortKey = "id";
      state.table.sortDir = "asc";
      state.table.page = 1;
      state.table.pageSize = 25;
      ui.tableSearch.value = "";
      ui.pageSize.value = "25";
      setMode(state.mode);
      renderVariablePanel();
      renderTable();
      fitExtent();
      sendFilters();
      showToast("Vista restablecida");
    }

    /* ---------------------------------------------------------------- */
    /* Filtro numérico                                                  */
    /* ---------------------------------------------------------------- */

    function fieldDecimals(field) {
      const col = columnMeta(field);
      return col ? col.decimals : 2;
    }

    function fmtNum(value) {
      const d = Math.min(8, Math.max(fieldDecimals(state.numeric.field), 6));
      return new Intl.NumberFormat("es-ES", {
        maximumFractionDigits: d,
        minimumFractionDigits: 0,
        useGrouping: false,
      }).format(value);
    }

    function fullDomain(field) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const row of initial.rows) {
        const v = toNum(row[field]);
        if (v === null) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
      if (lo === hi) hi = lo + 1;
      return [lo, hi];
    }

    function numericBounds() {
      const domain = fullDomain(state.numeric.field);
      const lo = state.numeric.min === null ? domain[0] : state.numeric.min;
      const hi = state.numeric.max === null ? domain[1] : state.numeric.max;
      return [lo, hi, domain[0], domain[1]];
    }

    function syncNumericUi() {
      const domain = fullDomain(state.numeric.field);
      const [lo, hi] = numericBounds();
      const decimals = fieldDecimals(state.numeric.field);
      ui.numLower.min = String(domain[0]);
      ui.numLower.max = String(domain[1]);
      ui.numUpper.min = String(domain[0]);
      ui.numUpper.max = String(domain[1]);
      ui.numLower.step = "any";
      ui.numUpper.step = "any";
      ui.numLower.value = String(lo);
      ui.numUpper.value = String(hi);
      ui.numMin.min = String(domain[0]);
      ui.numMin.max = String(domain[1]);
      ui.numMax.min = String(domain[0]);
      ui.numMax.max = String(domain[1]);
      ui.numMin.step = "any";
      ui.numMax.step = "any";
      ui.numMin.value = fmtNum(lo);
      ui.numMax.value = fmtNum(hi);
      const span = domain[1] - domain[0] || 1;
      const lowPct = ((lo - domain[0]) / span) * 100;
      const highPct = ((hi - domain[0]) / span) * 100;
      ui.numFill.style.left = `${clamp(lowPct, 0, 100)}%`;
      ui.numFill.style.right = `${clamp(100 - highPct, 0, 100)}%`;
      ui.includeMissing.disabled = !state.numeric.active;
      ui.includeMissing.checked = Boolean(state.numeric.active && state.numeric.includeMissing);
      ui.missingRow.classList.toggle("is-disabled", !state.numeric.active);
      const displayDecimals = Math.min(8, Math.max(decimals, 6));
      ui.numMin.value = String(Number(lo.toFixed(displayDecimals)));
      ui.numMax.value = String(Number(hi.toFixed(displayDecimals)));
    }

    function setNumericActiveFromInputs() {
      const domain = fullDomain(state.numeric.field);
      const lo = state.numeric.min === null ? domain[0] : state.numeric.min;
      const hi = state.numeric.max === null ? domain[1] : state.numeric.max;
      const full = Math.abs(lo - domain[0]) < 1e-9 && Math.abs(hi - domain[1]) < 1e-9;
      state.numeric.active = !full;
      if (!state.numeric.active) state.numeric.includeMissing = false;
      syncNumericUi();
      renderActiveFilters();
    }

    function onRangeInput() {
      const domain = fullDomain(state.numeric.field);
      let lo = Number(ui.numLower.value);
      let hi = Number(ui.numUpper.value);
      if (!Number.isFinite(lo)) lo = domain[0];
      if (!Number.isFinite(hi)) hi = domain[1];
      if (lo > hi) {
        // El pulgar que se mueve empuja al otro.
        if (document.activeElement === ui.numLower) hi = lo;
        else lo = hi;
      }
      state.numeric.min = lo;
      state.numeric.max = hi;
      setNumericActiveFromInputs();
      scheduleSend(140);
    }

    function onNumberInput(which) {
      const domain = fullDomain(state.numeric.field);
      let lo = state.numeric.min === null ? domain[0] : state.numeric.min;
      let hi = state.numeric.max === null ? domain[1] : state.numeric.max;
      const raw = which === "min" ? Number(ui.numMin.value) : Number(ui.numMax.value);
      if (Number.isFinite(raw)) {
        if (which === "min") lo = raw;
        else hi = raw;
      }
      lo = clamp(lo, domain[0], domain[1]);
      hi = clamp(hi, domain[0], domain[1]);
      if (lo > hi) {
        if (which === "min") hi = lo;
        else lo = hi;
      }
      state.numeric.min = lo;
      state.numeric.max = hi;
      setNumericActiveFromInputs();
      scheduleSend(120);
    }

    function resetNumericRange() {
      state.numeric.min = null;
      state.numeric.max = null;
      state.numeric.active = false;
      state.numeric.includeMissing = false;
      syncNumericUi();
      renderActiveFilters();
      sendFilters();
    }

    function setNumericField(field) {
      if (!COL_BY_KEY.has(field)) return;
      state.numeric.field = field;
      ui.numField.value = field;
      state.numeric.min = null;
      state.numeric.max = null;
      state.numeric.active = false;
      state.numeric.includeMissing = false;
      syncNumericUi();
      renderActiveFilters();
      sendFilters();
    }

    /* ---------------------------------------------------------------- */
    /* Tabla                                                            */
    /* ---------------------------------------------------------------- */

    function tableColumns() {
      const recurso = COL_BY_KEY.get("recurso");
      const rest = meta.columns.filter((c) => c.key !== "recurso");
      return recurso ? [recurso].concat(rest) : rest;
    }

    function cellHtml(col, row) {
      const value = row[col.key];
      if (value === null || value === undefined || value === "") {
        return `<span class="cell-null">—</span>`;
      }
      if (col.type === "category") {
        return `<span class="cell-cat" style="--c:${esc(
          catColor(col.key, value)
        )}"><i></i>${esc(value)}</span>`;
      }
      if (col.type === "binary") {
        const yes = Number(value) === 1;
        return `<span class="cell-bool${yes ? "" : " no"}">${yes ? "Sí" : "No"}</span>`;
      }
      if (col.type === "id") {
        return `<span class="cell-num">${esc(fmt(value, 0))}</span>`;
      }
      if (col.type === "coord") {
        return `<span class="cell-num">${esc(fmt(value, 6))}</span>`;
      }
      if (col.type === "number") {
        if (col.zero_missing && Number(value) === 0) {
          return `<span class="cell-muted" title="0 = sin presencia en TripAdvisor">0</span>`;
        }
        return `<span class="cell-num">${esc(fmt(value, col.decimals))}</span>`;
      }
      const text = String(value);
      const short = text.length > 70 ? text.slice(0, 70) + "…" : text;
      return `<span title="${esc(text)}">${esc(short)}</span>`;
    }

    function filteredTableRows() {
      const q = normalizeText(state.table.q.trim());
      let rows = state.rows;
      if (q) {
        rows = rows.filter((row) => {
          const hay = normalizeText(
            meta.columns.map((col) => row[col.key]).join(" ")
          );
          return hay.indexOf(q) !== -1;
        });
      }
      const key = state.table.sortKey;
      const dir = state.table.sortDir === "desc" ? -1 : 1;
      const col = columnMeta(key);
      const numeric = col && ["number", "id", "coord"].indexOf(col.type) !== -1;
      rows = rows.slice().sort((a, b) => {
        if (numeric) {
          const av = toNum(a[key]);
          const bv = toNum(b[key]);
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return (av - bv) * dir;
        }
        const av = a[key] === null || a[key] === undefined ? "" : String(a[key]);
        const bv = b[key] === null || b[key] === undefined ? "" : String(b[key]);
        return av.localeCompare(bv, "es", { numeric: true, sensitivity: "base" }) * dir;
      });
      return rows;
    }

    function renderTableHead() {
      const cols = tableColumns();
      let html = `<tr><th class="sticky-cell col-locate" scope="col"><span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Localizar</span></th>`;
      for (const col of cols) {
        const active = state.table.sortKey === col.key;
        const sortAttr = active
          ? state.table.sortDir === "asc"
            ? "ascending"
            : "descending"
          : "none";
        const sticky = col.key === "recurso";
        html += `<th scope="col" data-key="${esc(col.key)}" aria-sort="${sortAttr}" class="${
          sticky ? "sticky-cell col-name" : ""
        }"><button type="button" data-sort-key="${esc(col.key)}" title="${esc(
          col.description || col.label
        )}">${esc(col.label)}<span class="sort-ind">${
          active ? (state.table.sortDir === "asc" ? "▲" : "▼") : "↕"
        }</span></button></th>`;
      }
      html += `</tr>`;
      ui.tableHead.innerHTML = html;
    }

    function renderTable() {
      const all = filteredTableRows();
      const total = all.length;
      const size = state.table.pageSize === "all" ? Math.max(total, 1) : Number(state.table.pageSize);
      const pages = Math.max(1, Math.ceil(total / size));
      state.table.page = clamp(state.table.page, 1, pages);
      const start = (state.table.page - 1) * size;
      const end = Math.min(start + size, total);
      const rows = all.slice(start, end);
      const scrollLeft = ui.tableWrap ? ui.tableWrap.scrollLeft : 0;

      renderTableHead();

      if (!rows.length) {
        const cols = tableColumns().length + 1;
        ui.tableBody.innerHTML = `<tr><td colspan="${cols}" class="table-empty">Ninguna fila coincide con la búsqueda de la tabla.</td></tr>`;
      } else {
        const cols = tableColumns();
        let html = "";
        for (const row of rows) {
          const id = Number(row.id);
          const selected = state.selectedId !== null && Number(state.selectedId) === id;
          html += `<tr data-id="${id}" class="${selected ? "selected" : ""}">
            <td class="sticky-cell col-locate"><button type="button" class="locate-btn" data-locate="${id}" title="Centrar y destacar en el mapa" aria-label="Centrar ${esc(
            row.recurso || "recurso"
          )} en el mapa"><svg><use href="#i-target"/></svg></button></td>
            <td class="sticky-cell col-name" title="${esc(row.recurso || "")}">${esc(
            row.recurso || "—"
          )}</td>`;
          for (const col of cols) {
            if (col.key === "recurso") continue;
            html += `<td${
              col.type === "number" ? ' class="cell-num"' : ""
            }>${cellHtml(col, row)}</td>`;
          }
          html += `</tr>`;
        }
        ui.tableBody.innerHTML = html;
      }
      if (ui.tableCount) ui.tableCount.textContent = String(total);
      if (ui.tableRange) {
        ui.tableRange.textContent = total
          ? `Mostrando ${start + 1}–${end} de ${total}`
          : "Sin filas";
      }
      renderPager(pages);
      if (ui.tableWrap) ui.tableWrap.scrollLeft = scrollLeft;
    }

    function renderPager(pages) {
      if (!ui.pager) return;
      const page = state.table.page;
      ui.pager.innerHTML = `<button type="button" data-page="first" ${
        page <= 1 ? "disabled" : ""
      } aria-label="Primera página">«</button>
        <button type="button" data-page="prev" ${page <= 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>
        <span class="page-info">${page} / ${pages}</span>
        <button type="button" data-page="next" ${
          page >= pages ? "disabled" : ""
        } aria-label="Página siguiente">›</button>
        <button type="button" data-page="last" ${
          page >= pages ? "disabled" : ""
        } aria-label="Última página">»</button>`;
    }

    function updateTableSelection() {
      $$("#tableBody tr[data-id]").forEach((tr) => {
        tr.classList.toggle(
          "selected",
          state.selectedId !== null && Number(tr.getAttribute("data-id")) === Number(state.selectedId)
        );
      });
    }

    function openTableForRow(id) {
      const numericId = Number(id);
      ui.tableSearch.value = "";
      state.table.q = "";
      state.table.sortKey = "id";
      state.table.sortDir = "asc";
      state.table.page = 1;
      openDrawer(ui.dataDrawer);
      const rows = filteredTableRows();
      const idx = rows.findIndex((r) => Number(r.id) === numericId);
      const size =
        state.table.pageSize === "all"
          ? Math.max(rows.length, 1)
          : Number(state.table.pageSize);
      if (idx >= 0) state.table.page = Math.floor(idx / size) + 1;
      renderTable();
      updateTableSelection();
      const row = state.rows.find((r) => Number(r.id) === numericId);
      if (row) selectRow(row, { center: true });
      requestAnimationFrame(() => {
        const tr = ui.tableBody.querySelector(`tr[data-id="${numericId}"]`);
        if (tr) tr.scrollIntoView({ block: "center", inline: "nearest" });
      });
      showToast(`Fila ${numericId} destacada · filtros activos conservados`);
    }

    function exportCsv() {
      const rows = filteredTableRows();
      const cols = meta.columns.map((c) => c.key);
      const csvCell = (value) => {
        if (value === null || value === undefined) return "";
        const text = String(value);
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const lines = [cols.map(csvCell).join(",")];
      for (const row of rows) {
        lines.push(cols.map((key) => csvCell(row[key])).join(","));
      }
      const blob = new Blob(["\ufeff" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `visibilidad_alg_sevilla_${niceFilenameDate()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast(`CSV exportado · ${rows.length} filas · 33 columnas`);
    }

    /* ---------------------------------------------------------------- */
    /* Cajones, foco y avisos                                           */
    /* ---------------------------------------------------------------- */

    let lastFocus = null;

    function showScrim(zIndex) {
      ui.scrim.style.zIndex = String(zIndex);
      ui.scrim.style.top =
        zIndex < 80 ? (window.innerWidth <= 640 ? "58px" : "66px") : "0px";
      ui.scrim.classList.add("show");
    }

    function hideScrimIfIdle() {
      const drawerOpen =
        ui.dataDrawer.classList.contains("open") || ui.methodDrawer.classList.contains("open");
      if (drawerOpen) {
        showScrim(80);
        return;
      }
      if (ui.sidebar.classList.contains("open")) {
        showScrim(65);
        return;
      }
      ui.scrim.classList.remove("show");
      ui.scrim.style.zIndex = "";
      ui.scrim.style.top = "";
    }

    function openDrawer(drawer) {
      if (!drawer) return;
      lastFocus = document.activeElement;
      closeSidebar(true);
      const other = drawer === ui.dataDrawer ? ui.methodDrawer : ui.dataDrawer;
      if (other.classList.contains("open")) closeDrawer(other, true);
      if (drawer === ui.dataDrawer) renderTable();
      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
      showScrim(80);
      setTimeout(() => {
        const close = drawer.querySelector("[data-close-drawer]");
        if (close) close.focus();
      }, 90);
    }

    function closeDrawer(drawer, keepScrim) {
      if (!drawer) return;
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      if (!keepScrim) hideScrimIfIdle();
      if (lastFocus && typeof lastFocus.focus === "function") {
        try {
          lastFocus.focus({ preventScroll: true });
        } catch (err) {
          /* ignora */
        }
      }
    }

    function openSidebar() {
      if (ui.dataDrawer.classList.contains("open")) closeDrawer(ui.dataDrawer, true);
      if (ui.methodDrawer.classList.contains("open")) closeDrawer(ui.methodDrawer, true);
      ui.sidebar.classList.add("open");
      showScrim(65);
    }

    function closeSidebar(keepScrim) {
      ui.sidebar.classList.remove("open");
      if (!keepScrim) hideScrimIfIdle();
    }

    function closeAllOverlays() {
      closeDrawer(ui.dataDrawer, true);
      closeDrawer(ui.methodDrawer, true);
      closeSidebar(true);
      ui.scrim.classList.remove("show");
      ui.scrim.style.zIndex = "";
      ui.scrim.style.top = "";
    }

    let toastTimer = null;
    function showToast(message, isError) {
      if (!ui.toast) return;
      ui.toast.textContent = message;
      ui.toast.classList.toggle("error", Boolean(isError));
      ui.toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 3400);
    }

    function copyCoords() {
      const row = state.rows.find((r) => Number(r.id) === Number(state.selectedId));
      if (!row) return;
      const text = `${fmt(row.Latitud, 6)}, ${fmt(row.Longitud, 6)}`;
      const done = () => showToast("Coordenadas copiadas");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
      } else {
        fallbackCopy(text, done);
      }
    }

    function fallbackCopy(text, done) {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        done();
      } catch (err) {
        showToast("No se pudieron copiar las coordenadas", true);
      }
      document.body.removeChild(area);
    }

    /* ---------------------------------------------------------------- */
    /* KDE y opacidad                                                   */
    /* ---------------------------------------------------------------- */

    function setKde(enabled, silent) {
      if (enabled && (!meta.kde || !meta.kde.url)) {
        ui.kdeToggle.checked = false;
        state.kde = false;
        ui.kdeOpacityBlock.hidden = true;
        if (!silent) showToast("La capa KDE no está disponible en esta compilación.", true);
        return;
      }
      state.kde = Boolean(enabled);
      ui.kdeToggle.checked = state.kde;
      ui.kdeOpacityBlock.hidden = !state.kde;
      if (state.kde) addKdeLayer();
      else removeKdeLayer();
      renderLegend();
    }

    /* ---------------------------------------------------------------- */
    /* Sincronización Shiny                                             */
    /* ---------------------------------------------------------------- */

    function applyPayload(msg) {
      if (!msg || msg.ok !== true) return;
      const seq = msg.seq === null || msg.seq === undefined ? null : Number(msg.seq);
      if (
        seq !== null &&
        state.lastAppliedSeq !== null &&
        seq < state.lastAppliedSeq
      ) {
        return;
      }
      if (seq !== null) state.lastAppliedSeq = seq;
      state.gotPayload = true;
      state.rows = Array.isArray(msg.rows) ? msg.rows : [];
      state.visible = Number(msg.visible) || 0;
      state.total = Number(msg.total) || state.total;
      state.facets = msg.facets || state.facets;
      if (
        state.selectedId !== null &&
        !state.rows.some((row) => Number(row.id) === Number(state.selectedId))
      ) {
        clearSelection();
      }
      renderAll();
      setBusy(false);
      setConn("ready", "Conectado", "Servidor Shiny conectado · filtros sincronizados");
      showSync("Vista actualizada", false);
    }

    function renderAll() {
      ui.visibleCount.textContent = String(state.visible);
      ui.visibleTotal.textContent = String(state.total);
      ui.dataCount.textContent = String(state.visible);
      syncChipsFromState();
      renderVariablePanel();
      renderPoints();
      renderHeat();
      renderLegend();
      renderActiveFilters();
      syncNumericUi();
      renderTable();
      ui.mapEmpty.hidden = state.visible !== 0;
      if (state.selectedId !== null) {
        const row = state.rows.find((r) => Number(r.id) === Number(state.selectedId));
        if (row) renderInfo(row);
      }
    }

    function waitForConnection() {
      let tries = 0;
      const tick = () => {
        if (state.gotPayload) return;
        let connected = true;
        if (
          window.Shiny &&
          window.Shiny.shinyapp &&
          typeof window.Shiny.shinyapp.isConnected === "function"
        ) {
          connected = window.Shiny.shinyapp.isConnected();
        }
        if (connected) {
          startHandshake();
          return;
        }
        tries += 1;
        if (tries > 140) {
          setConn("error", "Sin conexión", "No se pudo conectar con el servidor Shiny");
          showSync("Servidor sin respuesta", true);
          showToast(
            "No se pudo conectar con Shiny. Los filtros no se actualizarán hasta recuperar la conexión.",
            true
          );
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    }

    function startHandshake() {
      if (state.gotPayload || !state.shinyReady) return;
      sendFilters();
      try {
        window.Shiny.setInputValue("client_ready", Date.now(), { priority: "event" });
      } catch (err) {
        console.error("No se pudo iniciar el protocolo con Shiny.", err);
      }
      state.handshakeAttempts += 1;
      if (!state.gotPayload && state.handshakeAttempts < 7) {
        setTimeout(startHandshake, 1300);
      }
    }

    function registerShiny() {
      let tries = 0;
      const timer = setInterval(() => {
        if (
          window.Shiny &&
          typeof window.Shiny.addCustomMessageHandler === "function" &&
          typeof window.Shiny.setInputValue === "function"
        ) {
          clearInterval(timer);
          window.Shiny.addCustomMessageHandler("app_payload", applyPayload);
          window.Shiny.addCustomMessageHandler("app_error", (msg) => {
            console.error("Error del servidor:", msg);
            setConn("error", "Error", "El servidor devolvió un error");
            showSync("Error al filtrar", true);
            setBusy(false);
            showToast("No se pudieron aplicar los filtros en el servidor.", true);
          });
          state.shinyReady = true;
          waitForConnection();
        } else {
          tries += 1;
          if (tries > 200) {
            clearInterval(timer);
            setConn("error", "Sin conexión", "Shiny no está disponible en esta página");
            showSync("Shiny no disponible", true);
          }
        }
      }, 50);

      setInterval(() => {
        if (
          state.gotPayload &&
          window.Shiny &&
          window.Shiny.shinyapp &&
          typeof window.Shiny.shinyapp.isConnected === "function" &&
          !window.Shiny.shinyapp.isConnected()
        ) {
          setConn("error", "Desconectado", "Se perdió la conexión con el servidor Shiny");
          showSync("Sin conexión", true);
        }
      }, 4000);
    }

    /* ---------------------------------------------------------------- */
    /* Eventos                                                          */
    /* ---------------------------------------------------------------- */

    function bindEvents() {
      ui.varSelect.addEventListener("change", () => setVariable(ui.varSelect.value));

      ui.modeSeg.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-mode]");
        if (btn) setMode(btn.getAttribute("data-mode"));
      });

      ui.catFieldSelect.addEventListener("change", () => {
        const field = ui.catFieldSelect.value;
        if (CAT_BY_FIELD.has(field)) {
          state.categorical = field;
          renderPoints();
          renderLegend();
        }
      });

      ui.classSelect.addEventListener("change", () => {
        state.classification = ui.classSelect.value;
        renderPoints();
        renderLegend();
      });

      ui.scaleSelect.addEventListener("change", () => {
        state.scale = ui.scaleSelect.value;
        renderPoints();
        renderLegend();
      });

      ui.kdeToggle.addEventListener("change", () => setKde(ui.kdeToggle.checked));
      ui.kdeOpacity.addEventListener("input", () => {
        state.kdeOpacity = clamp(Number(ui.kdeOpacity.value) / 100, 0.2, 1);
        ui.kdeOpacityVal.textContent = `${Math.round(state.kdeOpacity * 100)} %`;
        if (kdeLayer) kdeLayer.setOpacity(state.kdeOpacity);
      });

      ui.searchInput.addEventListener("input", () => {
        state.search = ui.searchInput.value;
        renderActiveFilters();
        scheduleSend(240);
      });

      ui.chipGroups.addEventListener("change", (event) => {
        const input = event.target.closest('input[type="checkbox"]');
        if (!input) return;
        readChips();
        const cat = meta.categoricals.find((c) => c.field === input.getAttribute("data-field"));
        if (cat) {
          const clear = document.querySelector(`[data-clear-chip="${cat.field}"]`);
          if (clear) clear.hidden = !(state.categories[cat.field] || []).length;
        }
        renderActiveFilters();
        sendFilters();
      });

      $$("[data-clear-chip]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const field = btn.getAttribute("data-clear-chip");
          state.categories[field] = [];
          syncChipsFromState();
          renderActiveFilters();
          sendFilters();
        });
      });

      ui.binarySeg.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-binary]");
        if (!btn) return;
        state.binary = btn.getAttribute("data-binary");
        $$("button[data-binary]", ui.binarySeg).forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        renderActiveFilters();
        sendFilters();
      });

      ui.numField.addEventListener("change", () => setNumericField(ui.numField.value));
      ui.numLower.addEventListener("input", onRangeInput);
      ui.numUpper.addEventListener("input", onRangeInput);
      ui.numMin.addEventListener("change", () => onNumberInput("min"));
      ui.numMax.addEventListener("change", () => onNumberInput("max"));
      ui.numReset.addEventListener("click", resetNumericRange);
      ui.includeMissing.addEventListener("change", () => {
        state.numeric.includeMissing = ui.includeMissing.checked;
        renderActiveFilters();
        sendFilters();
      });

      ui.clearFiltersBtn.addEventListener("click", () => {
        clearFilters();
        showToast("Filtros eliminados");
      });

      ui.resetAllBtn.addEventListener("click", resetAll);
      ui.emptyResetBtn.addEventListener("click", () => {
        clearFilters();
        showToast("Filtros eliminados");
      });

      ui.activeFilters.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-remove]");
        if (!btn) return;
        const kind = btn.getAttribute("data-remove");
        const value = btn.getAttribute("data-value");
        const field = btn.getAttribute("data-field");
        if (kind === "search") {
          state.search = "";
          ui.searchInput.value = "";
        } else if (kind === "category" && field) {
          state.categories[field] = (state.categories[field] || []).filter((v) => v !== value);
          syncChipsFromState();
        } else if (kind === "binary") {
          state.binary = "all";
          $$("button[data-binary]", ui.binarySeg).forEach((b) =>
            b.classList.toggle("active", b.getAttribute("data-binary") === "all")
          );
        } else if (kind === "numeric") {
          state.numeric.min = null;
          state.numeric.max = null;
          state.numeric.active = false;
          state.numeric.includeMissing = false;
          syncNumericUi();
        } else if (kind === "missing") {
          state.numeric.includeMissing = false;
          ui.includeMissing.checked = false;
        }
        renderActiveFilters();
        sendFilters();
      });

      ui.fitBtn.addEventListener("click", fitVisible);
      ui.clearSelBtn.addEventListener("click", () => clearSelection());
      ui.basemapBtn.addEventListener("click", () => {
        if (basemapMode === "osm") useNeutralBasemap(false);
        else useOsmBasemap(true);
      });
      ui.retryTilesBtn.addEventListener("click", () => useOsmBasemap(true));
      ui.bannerCloseBtn.addEventListener("click", hideTilesBanner);

      ui.infoCard.addEventListener("click", (event) => {
        if (event.target.closest("[data-info-close]")) {
          clearSelection();
          return;
        }
        if (event.target.closest("[data-info-table]")) {
          if (state.selectedId !== null) openTableForRow(state.selectedId);
          return;
        }
        if (event.target.closest("[data-info-zoom]")) {
          if (state.selectedId !== null) {
            const row = state.rows.find((r) => Number(r.id) === Number(state.selectedId));
            if (row) selectRow(row, { center: true });
          }
          return;
        }
        if (event.target.closest("[data-copy-coords]")) copyCoords();
      });

      document.addEventListener("click", (event) => {
        const popBtn = event.target.closest("[data-pop-table]");
        if (popBtn) {
          event.preventDefault();
          openTableForRow(Number(popBtn.getAttribute("data-pop-table")));
        }
      });

      ui.openDataBtn.addEventListener("click", () => openDrawer(ui.dataDrawer));
      ui.openMethodBtn.addEventListener("click", () => openDrawer(ui.methodDrawer));
      ui.openSidebarBtn.addEventListener("click", openSidebar);
      ui.sideCloseBtn.addEventListener("click", () => closeSidebar());
      $$("[data-close-drawer]").forEach((btn) =>
        btn.addEventListener("click", () => {
          closeDrawer(btn.closest(".drawer"));
        })
      );
      ui.scrim.addEventListener("click", closeAllOverlays);

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          if (
            ui.dataDrawer.classList.contains("open") ||
            ui.methodDrawer.classList.contains("open")
          ) {
            closeAllOverlays();
            event.preventDefault();
          } else if (ui.sidebar.classList.contains("open")) {
            closeSidebar();
            event.preventDefault();
          } else if (state.selectedId !== null) {
            clearSelection();
            event.preventDefault();
          }
          return;
        }
        if (event.key !== "Tab") return;
        const drawer = ui.dataDrawer.classList.contains("open")
          ? ui.dataDrawer
          : ui.methodDrawer.classList.contains("open")
          ? ui.methodDrawer
          : null;
        if (!drawer) return;
        const focusables = $$(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          drawer
        ).filter((el) => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          last.focus();
          event.preventDefault();
        } else if (!event.shiftKey && document.activeElement === last) {
          first.focus();
          event.preventDefault();
        }
      });

      ui.tableSearch.addEventListener("input", () => {
        state.table.q = ui.tableSearch.value;
        state.table.page = 1;
        renderTable();
      });
      ui.pageSize.addEventListener("change", () => {
        state.table.pageSize =
          ui.pageSize.value === "all" ? "all" : Number(ui.pageSize.value);
        state.table.page = 1;
        renderTable();
      });
      ui.exportCsvBtn.addEventListener("click", exportCsv);

      ui.tableHead.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-sort-key]");
        if (!btn) return;
        const key = btn.getAttribute("data-sort-key");
        if (state.table.sortKey === key) {
          state.table.sortDir = state.table.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.table.sortKey = key;
          state.table.sortDir = "asc";
        }
        state.table.page = 1;
        renderTable();
      });

      ui.tableBody.addEventListener("click", (event) => {
        const locate = event.target.closest("button[data-locate]");
        if (locate) {
          event.stopPropagation();
          const id = Number(locate.getAttribute("data-locate"));
          const row = state.rows.find((r) => Number(r.id) === id);
          if (row) {
            selectRow(row, { center: true });
            closeDrawer(ui.dataDrawer);
            showToast(`Recurso ${id} centrado en el mapa`);
          }
          return;
        }
        const tr = event.target.closest("tr[data-id]");
        if (tr) {
          const id = Number(tr.getAttribute("data-id"));
          const row = state.rows.find((r) => Number(r.id) === id);
          if (row) {
            selectRow(row, { center: true });
            closeDrawer(ui.dataDrawer);
            showToast(`Recurso ${id} centrado en el mapa`);
          }
        }
      });

      ui.pager.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-page]");
        if (!btn || btn.disabled) return;
        const pages = Math.max(
          1,
          Math.ceil(
            filteredTableRows().length /
              (state.table.pageSize === "all"
                ? Math.max(filteredTableRows().length, 1)
                : Number(state.table.pageSize))
          )
        );
        const action = btn.getAttribute("data-page");
        if (action === "first") state.table.page = 1;
        else if (action === "prev") state.table.page = Math.max(1, state.table.page - 1);
        else if (action === "next") state.table.page = Math.min(pages, state.table.page + 1);
        else if (action === "last") state.table.page = pages;
        renderTable();
      });

      map.on("click", () => {
        if (state.selectedId !== null) clearSelection();
      });

      window.addEventListener(
        "resize",
        debounce(() => {
          map.invalidateSize();
          if (window.innerWidth > 940 && ui.sidebar.classList.contains("open")) {
            closeSidebar();
          }
        }, 150)
      );
    }

    /* ---------------------------------------------------------------- */
    /* Inicio                                                           */
    /* ---------------------------------------------------------------- */

    populateSelects();
    setMode(state.mode);
    syncChipsFromState();
    syncNumericUi();
    renderAll();
    useOsmBasemap(false);
    setConn("connecting", "Conectando", "Estableciendo conexión con Shiny");
    fitExtent();
    bindEvents();
    setTimeout(() => map.invalidateSize(), 80);
    setTimeout(() => {
      ui.mapLoading.classList.add("hidden");
    }, 350);
    registerShiny();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

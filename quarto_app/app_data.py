"""Datos, metadatos y filtrado de la aplicación de visibilidad algorítmica.

Lee el dataset original en modo lectura y no modifica ningún valor. Toda la
lógica de filtrado vive aquí (el servidor Shiny es la fuente de verdad); el
cliente recibe filas ya filtradas y se limita a dibujarlas.
"""

from __future__ import annotations

import json
import math
import unicodedata
from collections.abc import Mapping, Sequence
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

APP_DIR = Path(__file__).resolve().parent
DATASET_PATH = APP_DIR.parent / "Dataset_TFG.xlsx"
SHEET_NAME = "H1234"

CATEGORICAL_FIELDS = ("categoria", "origen", "Destino_Final")
TECHNICAL_FIELDS = ("id", "Latitud", "Longitud")
BINARY_FIELD = "v3con"

TOTAL_ROWS = 142
TOTAL_COLS = 33

# ---------------------------------------------------------------------------
# Metadatos de variables
# ---------------------------------------------------------------------------

VARIABLES: list[dict[str, Any]] = [
    # Visibilidad algorítmica
    {
        "code": "v4p",
        "label": "Presencia algorítmica ponderada",
        "short": "Presencia ponderada",
        "group": "Visibilidad algorítmica",
        "unit": "índice",
        "decimals": 2,
        "desc": (
            "Síntesis ponderada de la presencia del recurso en la web, en Google Maps "
            "con búsqueda libre y con búsqueda forzada. Es el indicador principal de "
            "visibilidad algorítmica del dataset."
        ),
    },
    {
        "code": "v4a",
        "label": "Presencia algorítmica · web",
        "short": "Presencia web",
        "group": "Visibilidad algorítmica",
        "unit": "índice",
        "decimals": 2,
        "desc": "Grado de presencia del recurso en los resultados web del buscador.",
    },
    {
        "code": "v4b",
        "label": "Presencia algorítmica · Maps libre",
        "short": "Presencia Maps libre",
        "group": "Visibilidad algorítmica",
        "unit": "índice",
        "decimals": 2,
        "desc": "Presencia en Google Maps cuando la búsqueda se realiza sin forzar la marca.",
    },
    {
        "code": "v4c",
        "label": "Presencia algorítmica · Maps forzado",
        "short": "Presencia Maps forzado",
        "group": "Visibilidad algorítmica",
        "unit": "índice",
        "decimals": 2,
        "desc": "Presencia en Google Maps cuando se fuerza la búsqueda del recurso por su nombre.",
    },
    {
        "code": "v9p",
        "label": "Visibilidad espacial algorítmica ponderada",
        "short": "Visibilidad espacial ponderada",
        "group": "Visibilidad algorítmica",
        "unit": "índice",
        "decimals": 2,
        "desc": (
            "Relación entre presencia algorítmica y distancia al punto 0 (La Giralda), "
            "con factor de escala. Aproxima la capacidad del algoritmo de proyectar un "
            "recurso más allá de su ubicación física."
        ),
    },
    {
        "code": "v9a",
        "label": "Visibilidad espacial · web",
        "short": "Visibilidad espacial web",
        "group": "Visibilidad algorítmica",
        "unit": "índice",
        "decimals": 2,
        "desc": "Visibilidad espacial calculada sobre la presencia web.",
    },
    {
        "code": "v9b",
        "label": "Visibilidad espacial · Maps libre",
        "short": "Visibilidad espacial Maps libre",
        "group": "Visibilidad algorítmica",
        "unit": "índice",
        "decimals": 2,
        "desc": (
            "Visibilidad espacial sobre Maps libre. Presenta valores extremos cuando la "
            "distancia al punto 0 es muy pequeña; se conservan los valores originales."
        ),
    },
    {
        "code": "v9c",
        "label": "Visibilidad espacial · Maps forzado",
        "short": "Visibilidad espacial Maps forzado",
        "group": "Visibilidad algorítmica",
        "unit": "índice",
        "decimals": 2,
        "desc": (
            "Visibilidad espacial sobre Maps forzado. Presenta valores extremos cuando la "
            "distancia al punto 0 es muy pequeña; se conservan los valores originales."
        ),
    },
    # Presión y atención digital
    {
        "code": "v11p",
        "label": "Presión turística digital ponderada",
        "short": "Presión turística ponderada",
        "group": "Presión y atención digital",
        "unit": "índice",
        "decimals": 2,
        "desc": (
            "Relación entre la popularidad acumulada (reseñas) y la visibilidad que el "
            "algoritmo concede. Valores altos sugieren recursos con fama real pero poca "
            "presencia algorítmica; valores bajos, visibilidad privilegiada."
        ),
    },
    {
        "code": "v11a",
        "label": "Presión turística digital · web",
        "short": "Presión web",
        "group": "Presión y atención digital",
        "unit": "índice",
        "decimals": 2,
        "desc": "Presión turística digital calculada sobre la presencia web.",
    },
    {
        "code": "v11b",
        "label": "Presión turística digital · Maps libre",
        "short": "Presión Maps libre",
        "group": "Presión y atención digital",
        "unit": "índice",
        "decimals": 2,
        "desc": "Presión turística digital calculada sobre Maps libre.",
    },
    {
        "code": "v11c",
        "label": "Presión turística digital · Maps forzado",
        "short": "Presión Maps forzado",
        "group": "Presión y atención digital",
        "unit": "índice",
        "decimals": 2,
        "desc": "Presión turística digital calculada sobre Maps forzado.",
    },
    {
        "code": "v7",
        "label": "Atención turística digital según ubicación",
        "short": "Atención según ubicación",
        "group": "Presión y atención digital",
        "unit": "reseñas/m",
        "decimals": 2,
        "desc": (
            "Total de reseñas dividido por la distancia al punto 0. Aproxima cuánta "
            "atención digital recibe un lugar en relación con su ubicación."
        ),
    },
    {
        "code": "v10",
        "label": "Ventaja algorítmica entre plataformas",
        "short": "Ventaja entre plataformas",
        "group": "Presión y atención digital",
        "unit": "ratio",
        "decimals": 2,
        "desc": (
            "Cociente entre reseñas de Google y de TripAdvisor. Valores bajos indican "
            "mayor peso relativo de TripAdvisor; valores altos, dependencia de Google Maps."
        ),
    },
    {
        "code": "v8",
        "label": "Capital reputacional digital",
        "short": "Capital reputacional",
        "group": "Masa y reputación",
        "unit": "log10",
        "decimals": 2,
        "desc": "Logaritmo decimal del cociente entre reseñas totales y valoración ponderada.",
    },
    # Masa y reputación
    {
        "code": "v1a",
        "label": "Reseñas en Google",
        "short": "Reseñas Google",
        "group": "Masa y reputación",
        "unit": "reseñas",
        "decimals": 0,
        "desc": "Número de reseñas acumuladas en Google. Mide la masa crítica de opiniones.",
    },
    {
        "code": "v1b",
        "label": "Reseñas en TripAdvisor",
        "short": "Reseñas TripAdvisor",
        "group": "Masa y reputación",
        "unit": "reseñas",
        "decimals": 0,
        "desc": "Número de reseñas acumuladas en TripAdvisor.",
    },
    {
        "code": "v2p",
        "label": "Calidad ponderada",
        "short": "Calidad ponderada",
        "group": "Masa y reputación",
        "unit": "0–5",
        "decimals": 2,
        "desc": "Valoración combinada de Google y TripAdvisor (escala 0–5).",
    },
    {
        "code": "v2a",
        "label": "Puntuación en Google",
        "short": "Puntuación Google",
        "group": "Masa y reputación",
        "unit": "0–5",
        "decimals": 2,
        "desc": "Valoración media de usuarios en Google (escala 0–5).",
    },
    {
        "code": "v2b",
        "label": "Puntuación en TripAdvisor",
        "short": "Puntuación TripAdvisor",
        "group": "Masa y reputación",
        "unit": "0–5",
        "decimals": 2,
        "desc": "Valoración media de usuarios en TripAdvisor (escala 0–5).",
    },
    # Desviación de calidad
    {
        "code": "v6a",
        "label": "Desviación de calidad · contraste",
        "short": "Desviación Google–TripAdvisor",
        "group": "Desviación de calidad",
        "unit": "0–5",
        "decimals": 2,
        "desc": "Diferencia absoluta entre las puntuaciones de Google y TripAdvisor.",
    },
    {
        "code": "v6b",
        "label": "Desviación · contraste-ponderada",
        "short": "Desviación Google–ponderada",
        "group": "Desviación de calidad",
        "unit": "0–5",
        "decimals": 3,
        "desc": "Diferencia entre la puntuación de Google y la calidad ponderada.",
    },
    {
        "code": "v6c",
        "label": "Desviación · origen-ponderada",
        "short": "Desviación TripAdvisor–ponderada",
        "group": "Desviación de calidad",
        "unit": "0–5",
        "decimals": 3,
        "desc": "Diferencia entre la puntuación de TripAdvisor y la calidad ponderada.",
    },
    # Ubicación y ranking
    {
        "code": "v5",
        "label": "Distancia a La Giralda",
        "short": "Distancia a La Giralda",
        "group": "Ubicación y ranking",
        "unit": "m",
        "decimals": 0,
        "desc": (
            "Proximidad al punto 0 (La Giralda), en metros, tal como figura en el dataset. "
            "La metodología original documenta cinco registros con incoherencias entre "
            "coordenada y valor; no se han corregido."
        ),
    },
    {
        "code": "v3",
        "label": "Ranking en TripAdvisor",
        "short": "Ranking TripAdvisor",
        "group": "Ubicación y ranking",
        "unit": "puesto",
        "decimals": 0,
        "desc": "Posición en el ranking de TripAdvisor.",
        "zero_missing": True,
    },
]

VARIABLES_BY_CODE = {v["code"]: v for v in VARIABLES}
VARIABLE_GROUPS = [
    "Visibilidad algorítmica",
    "Presión y atención digital",
    "Masa y reputación",
    "Desviación de calidad",
    "Ubicación y ranking",
]

CATEGORICAL_META: list[dict[str, Any]] = [
    {
        "field": "categoria",
        "label": "Categoría del recurso",
        "short": "Categoría",
        "colors": {
            "Hotel": "#2A6F97",
            "Atracción Turística": "#E4572E",
            "Restauración": "#2A9D8F",
            "Apartamento": "#B08968",
        },
        "fallback": "#7A8785",
        "note": None,
    },
    {
        "field": "origen",
        "label": "Origen del recurso",
        "short": "Origen",
        "colors": {
            "Tripadvisor": "#2A6F97",
            "TripAdvisor": "#8FC1D4",
            "Publicidad": "#E9C46A",
            "Intruso": "#9B5DE5",
        },
        "fallback": "#7A8785",
        "note": (
            "«Tripadvisor» y «TripAdvisor» son la misma fuente con distinta capitalización "
            "en el origen de los datos. Se muestran por separado para no alterar el dataset."
        ),
    },
    {
        "field": "Destino_Final",
        "label": "Destino final en la búsqueda",
        "short": "Destino final",
        "colors": {
            "Invisibles": "#6C757D",
            "Anuncios": "#E9C46A",
            "Google Maps Libre": "#2A9D8F",
            "Local Pack": "#2A6F97",
            "Google Maps Forzado": "#E4572E",
        },
        "fallback": "#7A8785",
        "note": "Clasificación de la visibilidad efectiva del recurso en los resultados de búsqueda.",
    },
]

COLUMN_EXTRA: dict[str, dict[str, Any]] = {
    "id": {"label": "ID", "type": "id", "decimals": 0},
    "categoria": {"label": "Categoría", "type": "category", "decimals": 0},
    "recurso": {"label": "Recurso", "type": "text", "decimals": 0},
    "origen": {"label": "Origen", "type": "category", "decimals": 0},
    "v3con": {"label": "v3con · En TripAdvisor", "type": "binary", "decimals": 0},
    "Destino_Final": {"label": "Destino final", "type": "category", "decimals": 0},
    "Latitud": {"label": "Latitud", "type": "coord", "decimals": 6},
    "Longitud": {"label": "Longitud", "type": "coord", "decimals": 6},
}


class AppData:
    """Contenedor inmutable con el dataset y sus metadatos."""

    def __init__(self, df: pd.DataFrame) -> None:
        self.df = df.reset_index(drop=True)
        self.total = int(len(df))
        # to_dict conserva el float original; to_json lo recortaba a 10 decimales.
        self.records: list[dict[str, Any]] = self.df.to_dict(orient="records")
        for record in self.records:
            for key, value in record.items():
                if isinstance(value, float) and not math.isfinite(value):
                    record[key] = None
        self._haystack = self._build_haystack()
        self.duplicate_ids = self._duplicate_ids()
        self.facts = self._build_facts()
        self.categoricals = self._build_categoricals()
        self.columns = self._build_columns()
        self.meta = self._build_meta()

    # -- construcción ------------------------------------------------------
    def _build_haystack(self) -> list[str]:
        parts = []
        for _, row in self.df.iterrows():
            text = " ".join(
                str(row.get(c, "")) for c in ("recurso",) + CATEGORICAL_FIELDS
            )
            parts.append(normalize_text(text))
        return parts

    def _duplicate_ids(self) -> list[int]:
        dup = self.df[self.df.duplicated(subset=["Latitud", "Longitud"], keep=False)]
        return sorted(int(v) for v in dup["id"].tolist())

    def _build_facts(self) -> dict[str, Any]:
        v4p_pos = int((self.df["v4p"] > 0).sum())
        coords_dup = int(self.df.duplicated(subset=["Latitud", "Longitud"]).sum())
        missing_total = int(self.df.isna().sum().sum())
        return {
            "source": DATASET_PATH.name,
            "sheet": SHEET_NAME,
            "rows": self.total,
            "cols": int(self.df.shape[1]),
            "missing": missing_total,
            "v4p_positive": v4p_pos,
            "v4p_zero": self.total - v4p_pos,
            "duplicate_pairs": coords_dup,
            "v3_absent": int((self.df["v3con"] == 0).sum()),
            "extent": {
                "west": float(self.df["Longitud"].min()),
                "south": float(self.df["Latitud"].min()),
                "east": float(self.df["Longitud"].max()),
                "north": float(self.df["Latitud"].max()),
            },
            "center": {
                "lat": float(self.df["Latitud"].mean()),
                "lng": float(self.df["Longitud"].mean()),
            },
            "generated_with": "Quarto + Shiny for Python",
        }

    def _build_categoricals(self) -> list[dict[str, Any]]:
        out = []
        for spec in CATEGORICAL_META:
            field = spec["field"]
            counts = self.df[field].value_counts(dropna=False)
            values = []
            for value, count in counts.items():
                if pd.isna(value):
                    continue
                value = str(value)
                values.append(
                    {
                        "value": value,
                        "count": int(count),
                        "color": spec["colors"].get(value, spec["fallback"]),
                    }
                )
            out.append({**{k: v for k, v in spec.items() if k != "colors"}, "values": values})
        return out

    def _build_columns(self) -> list[dict[str, Any]]:
        cols = []
        for key in self.df.columns:
            if key in COLUMN_EXTRA:
                extra = COLUMN_EXTRA[key]
                label = extra["label"]
                typ = extra["type"]
                decimals = extra["decimals"]
            else:
                var = VARIABLES_BY_CODE.get(key)
                label = f"{key} · {var['short']}" if var else key
                typ = "number"
                decimals = int(var["decimals"]) if var else 2
            cols.append(
                {
                    "key": key,
                    "label": label,
                    "type": typ,
                    "decimals": decimals,
                    "unit": VARIABLES_BY_CODE.get(key, {}).get("unit", ""),
                    "description": VARIABLES_BY_CODE.get(key, {}).get("desc", ""),
                    "zero_missing": bool(VARIABLES_BY_CODE.get(key, {}).get("zero_missing", False)),
                }
            )
        return cols

    def _build_meta(self) -> dict[str, Any]:
        variables = []
        for spec in VARIABLES:
            series = pd.to_numeric(self.df[spec["code"]], errors="coerce")
            finite = series[np.isfinite(series)]
            variables.append(
                {
                    **spec,
                    "zero_missing": bool(spec.get("zero_missing", False)),
                    "domain": [float(finite.min()), float(finite.max())],
                    "global_stats": {
                        "median": float(finite.median()),
                        "mean": float(finite.mean()),
                        "zeros": int((finite == 0).sum()),
                        "positive": int((finite > 0).sum()),
                        "missing": int(series.isna().sum()),
                    },
                }
            )

        cat_values = {c["field"]: [v["value"] for v in c["values"]] for c in self.categoricals}
        return {
            "dataset": self.facts,
            "variables": variables,
            "variableGroups": VARIABLE_GROUPS,
            "categoricals": self.categoricals,
            "categoricalValues": cat_values,
            "columns": self.columns,
            "numericFields": [
                {
                    "key": c["key"],
                    "label": c["label"],
                    "unit": c["unit"],
                    "decimals": c["decimals"],
                    "technical": c["key"] in TECHNICAL_FIELDS,
                }
                for c in self.columns
                if c["type"] in ("number", "id", "coord")
            ],
            "technicalFields": list(TECHNICAL_FIELDS),
            "duplicateIds": self.duplicate_ids,
            "defaults": {
                "variable": "v4p",
                "mode": "heat",
                "categorical": "categoria",
                "classification": "quantile",
                "basemap": "osm",
            },
            "initial": {
                "rows": self.records,
                "visible": self.total,
                "facets": self.facets(empty_filters()),
            },
        }

    # -- filtrado ----------------------------------------------------------
    def mask(self, norm: dict[str, Any]) -> np.ndarray:
        df = self.df
        mask = np.ones(len(df), dtype=bool)

        query = norm.get("q") or ""
        if query:
            tokens = [t for t in normalize_text(query).split() if t]
            if tokens:
                hay = self._haystack
                mask &= np.array(
                    [all(tok in h for tok in tokens) for h in hay], dtype=bool
                )

        selected = norm.get("categories") or {}
        for field in CATEGORICAL_FIELDS:
            values = selected.get(field) or []
            if values:
                mask &= df[field].isin(values).to_numpy()

        binary = norm.get("binary") or "all"
        if binary in ("0", "1"):
            mask &= (df[BINARY_FIELD].astype(int) == int(binary)).to_numpy()

        num = norm.get("numeric") or {}
        if num.get("active"):
            field = num.get("field")
            if field in self.df.columns:
                series = pd.to_numeric(df[field], errors="coerce")
                finite = np.isfinite(series)
                lo = num.get("min")
                hi = num.get("max")
                cond = finite
                if lo is not None:
                    cond = cond & (series >= lo)
                if hi is not None:
                    cond = cond & (series <= hi)
                if not num.get("include_missing", False):
                    mask &= cond.to_numpy()
                else:
                    mask &= (cond | ~finite).to_numpy()
        return mask

    def facets(self, norm: dict[str, Any]) -> dict[str, dict[str, int]]:
        out: dict[str, dict[str, int]] = {}
        for field in CATEGORICAL_FIELDS:
            sub = dict(norm)
            cats = dict(norm.get("categories") or {})
            cats.pop(field, None)
            sub["categories"] = cats
            mask = self.mask(sub)
            counts = self.df.loc[mask, field].value_counts(dropna=False)
            all_values = next(c for c in self.categoricals if c["field"] == field)["values"]
            out[field] = {
                v["value"]: int(counts.get(v["value"], 0)) for v in all_values
            }
        return out

    def payload(self, raw: Any) -> dict[str, Any]:
        norm = normalize_filters(raw)
        mask = self.mask(norm)
        idx = np.flatnonzero(mask)
        rows = [self.records[int(i)] for i in idx]
        seq = raw.get("_seq") if isinstance(raw, Mapping) else None
        return {
            "ok": True,
            "seq": seq,
            "visible": len(rows),
            "total": self.total,
            "rows": rows,
            "facets": self.facets(norm),
            "filters": norm,
        }


# ---------------------------------------------------------------------------
# Normalización y utilidades
# ---------------------------------------------------------------------------


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("\u200b", "").replace("\ufeff", "")
    return text.casefold().strip()


def _safe_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value)
        except ValueError:
            return None
    else:
        return None
    if not math.isfinite(number):
        return None
    return number


def empty_filters() -> dict[str, Any]:
    return {
        "q": "",
        "categories": {field: [] for field in CATEGORICAL_FIELDS},
        "binary": "all",
        "numeric": {"active": False, "field": "v4p", "min": None, "max": None, "include_missing": False},
    }


def normalize_filters(raw: Any) -> dict[str, Any]:
    norm = empty_filters()
    if not isinstance(raw, Mapping):
        return norm

    query = raw.get("q")
    if isinstance(query, str):
        norm["q"] = query[:200]

    raw_categories = raw.get("categories")
    if isinstance(raw_categories, Mapping):
        for field in CATEGORICAL_FIELDS:
            norm["categories"][field] = _safe_string_list(raw_categories.get(field))

    binary = raw.get("binary")
    if binary in ("0", "1", "all"):
        norm["binary"] = binary

    raw_numeric = raw.get("numeric")
    if isinstance(raw_numeric, Mapping):
        field = raw_numeric.get("field")
        if isinstance(field, str) and field:
            norm["numeric"]["field"] = field
        norm["numeric"]["active"] = bool(raw_numeric.get("active"))
        norm["numeric"]["min"] = _safe_float(raw_numeric.get("min"))
        norm["numeric"]["max"] = _safe_float(raw_numeric.get("max"))
        norm["numeric"]["include_missing"] = bool(
            raw_numeric.get("include_missing", False)
        )

    return norm


def _safe_string_list(value: Any) -> list[str]:
    # Shiny puede entregar los arrays JSON como listas o como tuplas.
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str) and item not in out:
            out.append(item[:200])
    return out


def _validate(df: pd.DataFrame) -> None:
    if df.shape != (TOTAL_ROWS, TOTAL_COLS):
        raise ValueError(
            f"El dataset H1234 tiene {df.shape[0]} filas y {df.shape[1]} columnas; "
            f"se esperaban {TOTAL_ROWS} × {TOTAL_COLS}."
        )
    required = {
        "id",
        "categoria",
        "recurso",
        "origen",
        "Destino_Final",
        "Latitud",
        "Longitud",
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Faltan columnas obligatorias: {sorted(missing)}")
    lat = pd.to_numeric(df["Latitud"], errors="coerce")
    lng = pd.to_numeric(df["Longitud"], errors="coerce")
    if lat.isna().any() or lng.isna().any():
        raise ValueError("Hay coordenadas no numéricas o ausentes.")
    if not lat.between(37.30, 37.46).all() or not lng.between(-6.10, -5.88).all():
        raise ValueError("Hay coordenadas fuera del ámbito esperado de Sevilla.")
    if not df["id"].is_unique:
        raise ValueError("Los identificadores no son únicos.")


@lru_cache(maxsize=1)
def load_data() -> AppData:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"No se encuentra el dataset: {DATASET_PATH}")
    df = pd.read_excel(DATASET_PATH, sheet_name=SHEET_NAME, engine="openpyxl")
    _validate(df)
    return AppData(df)


DATA = load_data()


if __name__ == "__main__":
    print(json.dumps(DATA.meta["dataset"], ensure_ascii=False, indent=2))

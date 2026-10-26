"""Genera los recursos estáticos de la aplicación.

1. Reproyecta el ráster KDE existente (EPSG:25830) a una malla Web Mercator
   para que Leaflet lo coloque sin distorsión y lo colorea por clases.
2. Empaqueta Leaflet, leaflet.heat, la hoja de estilos y el JavaScript en un
   único `_head.html` que Quarto inserta en el documento.

No modifica el GeoTIFF original ni el dataset.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image
from pyproj import Transformer

APP_DIR = Path(__file__).resolve().parent
KDE_SOURCE = APP_DIR.parent / "Visibilidad_Algoritmica_Sevilla_KDE.tif"
KDE_DIR = APP_DIR / "assets" / "kde"
KDE_PNG = KDE_DIR / "kde.png"
KDE_META = KDE_DIR / "kde_meta.json"
VENDOR = APP_DIR / "assets" / "vendor"
HEAD_FILE = APP_DIR / "_head.html"

# Cortes documentados en la ficha metodológica original (cuantiles 20/40/60/80
# de los valores positivos del KDE).
KDE_BREAKS = [0.0016, 0.0306, 0.3227, 1.4288]
KDE_MAX = 11.4346
KDE_MEAN = 0.337
KDE_CLASSES = [
    {"label": "0,0000 – 0,0016", "color": "#DCEEF4", "alpha": 60},
    {"label": "0,0016 – 0,0306", "color": "#A9D6E5", "alpha": 110},
    {"label": "0,0306 – 0,3227", "color": "#61A9C6", "alpha": 150},
    {"label": "0,3227 – 1,4288", "color": "#2A7FA3", "alpha": 190},
    {"label": "1,4288 – 11,4346", "color": "#0F4C68", "alpha": 220},
]


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def build_kde() -> dict:
    KDE_DIR.mkdir(parents=True, exist_ok=True)
    if not KDE_SOURCE.exists():
        raise FileNotFoundError(f"No se encuentra el ráster KDE: {KDE_SOURCE}")

    with tifffile.TiffFile(KDE_SOURCE) as tif:
        page = tif.pages[0]
        data = page.asarray().astype("float64")
        pixel_x, pixel_y = page.tags["ModelPixelScaleTag"].value[:2]
        tie = page.tags["ModelTiepointTag"].value
        x0, y0 = float(tie[3]), float(tie[4])
        # El GeoTIFF existente declara ETRS89 / UTM 30N (EPSG:25830).
        epsg = 25830

    height, width = data.shape
    x1 = x0 + width * pixel_x
    y1 = y0 - height * pixel_y

    to_mercator = Transformer.from_crs(epsg, 3857, always_xy=True)
    to_source = Transformer.from_crs(3857, epsg, always_xy=True)
    to_wgs84 = Transformer.from_crs(3857, 4326, always_xy=True)

    corners = [(x0, y0), (x1, y0), (x0, y1), (x1, y1)]
    mx, my = zip(*(to_mercator.transform(x, y) for x, y in corners))
    mx0, mx1 = min(mx), max(mx)
    my0, my1 = min(my), max(my)

    target_width = 640
    target_height = int(round(target_width * (my1 - my0) / (mx1 - mx0)))
    target_height = max(200, min(1400, target_height))

    xs = mx0 + (np.arange(target_width) + 0.5) * (mx1 - mx0) / target_width
    ys = my1 - (np.arange(target_height) + 0.5) * (my1 - my0) / target_height
    gx, gy = np.meshgrid(xs, ys)
    sx, sy = to_source.transform(gx, gy)
    u = (sx - x0) / pixel_x - 0.5
    v = (y0 - sy) / pixel_y - 0.5

    iu = np.floor(u).astype(int)
    iv = np.floor(v).astype(int)
    fu = u - iu
    fv = v - iv
    valid = (iu >= 0) & (iu < width - 1) & (iv >= 0) & (iv < height - 1)
    safe_u = np.clip(iu, 0, width - 2)
    safe_v = np.clip(iv, 0, height - 2)

    sampled = (
        data[safe_v, safe_u] * (1 - fu) * (1 - fv)
        + data[safe_v, safe_u + 1] * fu * (1 - fv)
        + data[safe_v + 1, safe_u] * (1 - fu) * fv
        + data[safe_v + 1, safe_u + 1] * fu * fv
    )
    sampled = np.where(valid, sampled, 0.0)
    sampled = np.nan_to_num(sampled, nan=0.0, posinf=0.0, neginf=0.0)
    sampled = np.clip(sampled, 0.0, KDE_MAX)

    rgba = np.zeros((target_height, target_width, 4), dtype=np.uint8)
    edges = KDE_BREAKS + [np.inf]
    for idx, spec in enumerate(KDE_CLASSES):
        low = 0.0 if idx == 0 else edges[idx - 1]
        high = edges[idx]
        mask = (sampled > 0) & (sampled >= low) & (sampled < high)
        if idx == len(KDE_CLASSES) - 1:
            mask = (sampled >= KDE_BREAKS[-1]) & (sampled > 0)
        r, g, b = hex_to_rgb(spec["color"])
        rgba[mask, 0] = r
        rgba[mask, 1] = g
        rgba[mask, 2] = b
        rgba[mask, 3] = spec["alpha"]

    Image.fromarray(rgba, mode="RGBA").save(KDE_PNG, optimize=True)

    west, south = to_wgs84.transform(mx0, my0)
    east, north = to_wgs84.transform(mx1, my1)
    meta = {
        "url": "data:image/png;base64,"
        + base64.b64encode(KDE_PNG.read_bytes()).decode("ascii"),
        "bounds": [[south, west], [north, east]],
        "breaks": KDE_BREAKS,
        "classes": KDE_CLASSES,
        "max": KDE_MAX,
        "mean": KDE_MEAN,
        "bandwidth_m": 250,
        "cell_m": pixel_x,
        "source_crs": f"EPSG:{epsg}",
        "grid": [target_height, target_width],
        "note": (
            "Densidad espacial de los 50 recursos con v4p > 0. No representa la "
            "intensidad de la variable seleccionada: una zona densa puede deberse a "
            "muchos recursos poco visibles."
        ),
    }
    KDE_META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    return meta


def build_head() -> None:
    leaflet_css = (VENDOR / "leaflet.css").read_text(encoding="utf-8")
    app_css = (APP_DIR / "assets" / "app.css").read_text(encoding="utf-8")
    leaflet_js = (VENDOR / "leaflet.js").read_text(encoding="utf-8")
    heat_js = (VENDOR / "leaflet-heat.js").read_text(encoding="utf-8")
    app_js = (APP_DIR / "assets" / "app.js").read_text(encoding="utf-8")

    def strip_maps(text: str) -> str:
        return "\n".join(
            line for line in text.splitlines() if "sourceMappingURL=" not in line
        )

    head = f"""<!-- Generado por build_assets.py. No editar a mano. -->
<style>
{leaflet_css}
</style>
<style>
{app_css}
</style>
<script>
{strip_maps(leaflet_js)}
</script>
<script>
{strip_maps(heat_js)}
</script>
<script>
{app_js}
</script>
"""
    HEAD_FILE.write_text(head, encoding="utf-8")
    print(f"_head.html: {len(head) / 1024:.0f} KB")


if __name__ == "__main__":
    meta = build_kde()
    print(
        f"kde.png: {KDE_PNG.stat().st_size / 1024:.0f} KB · "
        f"{meta['grid'][1]}×{meta['grid'][0]} px · bounds {meta['bounds']}"
    )
    build_head()

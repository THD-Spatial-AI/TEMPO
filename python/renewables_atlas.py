"""
renewables_atlas.py — Global Solar Atlas / Global Wind Atlas country rasters (V1–V4).

`ensure` downloads a country GeoTIFF once into <cache>/atlas/<country>/<layer>.tif;
`render` cuts a viewport out of it as a colour-mapped RGBA PNG (nodata transparent).
Global Solar Atlas 2.0 (Solargis / World Bank–ESMAP), Global Wind Atlas (DTU /
World Bank–ESMAP): CC BY 4.0. Bounds order in Python: (south, west, north, east).
"""
import io
import os
import re
import threading
import zipfile
from pathlib import Path
from urllib.parse import quote

import numpy as np

# layer -> (source, member file in the GSA zip, colour range min, max)
LAYERS = {
    "pvout": ("gsa", "PVOUT.tif", 700.0, 2300.0),
    "ghi": ("gsa", "GHI.tif", 800.0, 2800.0),
    "wind100": ("gwa", None, 2.0, 12.0),
}
GSA_API = "https://api.globalsolaratlas.info/download"
GWA_URL = "https://globalwindatlas.info/api/gis/country/{iso3}/wind-speed/100"
GSA_ZIP_SUFFIX = "_GISdata_LTAym_YearlyMonthlyTotals_GlobalSolarAtlas-v2_GEOTIFF.zip"
CHUNK = 1 << 20
MAX_WIDTH = 1024
ISO3_OVERRIDES = {
    "Bolivia": "BOL", "Brunei": "BRN", "Czech Republic": "CZE", "Iran": "IRN", "Kosovo": "XKX",
    "Laos": "LAO", "Moldova": "MDA", "North Korea": "PRK", "Russia": "RUS", "South Korea": "KOR",
    "Syria": "SYR", "Taiwan": "TWN", "Tanzania": "TZA", "Venezuela": "VEN", "Vietnam": "VNM",
    # Global Solar Atlas spellings that pycountry resolves wrongly (Korea) or not at all
    "Republic of Korea": "KOR", "Democratic Peoples Republic of Korea": "PRK", "Cote d Ivoire": "CIV",
    "Democratic Republic of the Congo": "COD", "Guinea Bissau": "GNB", "New Caledonia (FR)": "NCL",
    "Taiwan (China)": "TWN", "Timor Leste": "TLS", "Turkey": "TUR", "West Bank And Gaza": "PSE",
}
PALETTES = {
    "solar": ["#2c7bb6", "#abd9e9", "#ffffbf", "#fdae61", "#f46d43", "#a50026"],
    "wind": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b", "#3f007d"],
}
ALPHA = 200

_countries_cache = []
_countries_lock = threading.Lock()
_ensure_locks = {}
_ensure_locks_guard = threading.Lock()


def _get(http_get):
    if http_get is None:
        import requests
        return requests.get
    return http_get


def countries(http_get=None):
    """English country names Global Solar Atlas offers (cached in memory)."""
    with _countries_lock:
        if not _countries_cache:
            resp = _get(http_get)(GSA_API, timeout=60)
            resp.raise_for_status()
            _countries_cache[:] = resp.json()["countries"]
        return list(_countries_cache)


def iso3(name):
    if name in ISO3_OVERRIDES:
        return ISO3_OVERRIDES[name]
    import pycountry
    try:
        return pycountry.countries.lookup(name).alpha_3
    except LookupError:
        pass
    try:
        return pycountry.countries.search_fuzzy(name)[0].alpha_3
    except LookupError:
        return None


def layer_path(layer, country, cache_dir):
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", country)
    if not safe.strip("."):
        raise ValueError(f"invalid country name {country!r}")
    return Path(cache_dir) / "atlas" / safe / f"{layer}.tif"


def _tmp_name(dest, suffix):
    return dest.with_name(f"{dest.name}.{os.getpid()}.{threading.get_ident()}.{suffix}")


def _lock_for(key):
    with _ensure_locks_guard:
        return _ensure_locks.setdefault(key, threading.Lock())


def _stream(http_get, url, dest, on_progress, **kw):
    """Stream `url` to dest via a .part file, then os.replace; no partial file survives a failure.
    on_progress(done, total) reports total 0 when the server sends no content-length."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = _tmp_name(dest, "part")
    try:
        with http_get(url, stream=True, timeout=60, **kw) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("content-length") or 0)
            done = 0
            with open(part, "wb") as f:
                for chunk in resp.iter_content(CHUNK):
                    f.write(chunk)
                    done += len(chunk)
                    if on_progress:
                        on_progress(done, total)
        os.replace(part, dest)
    except BaseException:
        part.unlink(missing_ok=True)
        raise


def ensure(layer, country, cache_dir, http_get=None, on_progress=None):
    """Path of the layer's GeoTIFF, downloading it when absent. One download per (source, country)
    at a time: concurrent callers wait on the lock and then find the file in place."""
    if layer not in LAYERS:
        raise ValueError(f"unknown layer {layer!r}")
    path = layer_path(layer, country, cache_dir)
    if path.exists():
        return path
    http_get = _get(http_get)
    source = LAYERS[layer][0]
    with _lock_for((source, country)):
        if path.exists():
            return path
        if source == "gwa":
            code = iso3(country)
            if not code:
                raise ValueError(f"no ISO3 code for {country!r}: wind atlas unavailable")
            _stream(http_get, GWA_URL.format(iso3=code), path, on_progress)
            return path
        resp = http_get(f"{GSA_API}/{quote(country)}", timeout=60)
        resp.raise_for_status()
        names = [e["name"] for e in resp.json() if e["name"].endswith(GSA_ZIP_SUFFIX)]
        if not names:
            raise ValueError(f"no GeoTIFF download for {country!r} in Global Solar Atlas")
        zpath = _tmp_name(path.parent / "atlas", "zip")
        _stream(http_get, f"{GSA_API}/{quote(country)}/{quote(names[0])}", zpath, on_progress)
        try:
            with zipfile.ZipFile(zpath) as z:
                for lay, (_, member, _, _) in LAYERS.items():
                    if member is None:
                        continue
                    for name in z.namelist():
                        if name.endswith("/" + member) and "monthly/" not in name:
                            dest = layer_path(lay, country, cache_dir)
                            part = _tmp_name(dest, "part")
                            try:
                                with z.open(name) as src, open(part, "wb") as out:
                                    while True:
                                        block = src.read(CHUNK)
                                        if not block:
                                            break
                                        out.write(block)
                                os.replace(part, dest)
                            except BaseException:
                                part.unlink(missing_ok=True)
                                raise
                            break
        finally:
            zpath.unlink(missing_ok=True)
        if not path.exists():
            raise ValueError(f"{layer} raster not found in the Global Solar Atlas download for {country!r}")
        return path


def _hex(c):
    return [int(c[i:i + 2], 16) for i in (1, 3, 5)]


def colorize(values, layer):
    """float array (NaN = nodata) -> uint8 RGBA, 6-stop palette over the layer range."""
    source, _, lo, hi = LAYERS[layer]
    stops = np.array([_hex(c) for c in PALETTES["wind" if source == "gwa" else "solar"]], dtype=float)
    values = np.asarray(values, dtype=float)
    t = np.clip((values - lo) / (hi - lo), 0.0, 1.0)
    pos = np.nan_to_num(t) * (len(stops) - 1)
    i0 = np.minimum(pos.astype(int), len(stops) - 2)
    frac = (pos - i0)[..., None]
    rgb = stops[i0] * (1 - frac) + stops[i0 + 1] * frac
    out = np.zeros(values.shape + (4,), dtype=np.uint8)
    out[..., :3] = np.round(rgb).astype(np.uint8)
    out[..., 3] = np.where(np.isfinite(values), ALPHA, 0)
    return out


def render(layer, country, cache_dir, south, west, north, east, width):
    """(png_bytes, (w, s, e, n)) for the viewport clipped to the raster."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import from_bounds
    path = layer_path(layer, country, cache_dir)
    if not path.exists():
        raise FileNotFoundError(f"{layer} for {country} not downloaded")
    with rasterio.open(path) as src:
        b = src.bounds
        w0, s0, e0, n0 = max(west, b.left), max(south, b.bottom), min(east, b.right), min(north, b.top)
        if w0 >= e0 or s0 >= n0:
            raise ValueError("bounds outside the raster")
        win = from_bounds(w0, s0, e0, n0, transform=src.transform)
        w_px = max(1, min(int(width), MAX_WIDTH, int(round(win.width))))
        h_px = max(1, int(round(w_px * win.height / win.width)))
        if h_px > MAX_WIDTH:                      # tall raster: shrink the width so the aspect ratio holds
            w_px = max(1, int(round(w_px * MAX_WIDTH / h_px)))
            h_px = MAX_WIDTH
        data = src.read(1, window=win, out_shape=(h_px, w_px), resampling=Resampling.bilinear, masked=True)
        values = data.astype("float64").filled(np.nan)
    rgba = colorize(values, layer)
    with rasterio.io.MemoryFile() as mem:
        with mem.open(driver="PNG", height=h_px, width=w_px, count=4, dtype="uint8") as dst:
            dst.write(np.moveaxis(rgba, -1, 0))
        png = mem.read()
    return png, (w0, s0, e0, n0)

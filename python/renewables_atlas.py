"""
renewables_atlas.py — Global Solar Atlas / Global Wind Atlas overlays read remotely (no download).

`render_view` picks the countries in view (python/data/country_bboxes.json), reads each one's
window straight from the official country GeoTIFF over HTTP (GDAL /vsicurl/, GSA via /vsizip/)
and stitches them into one colour-mapped RGBA PNG covering the requested bounds.
Open dataset handles are kept in an LRU; each (layer, ISO3) handle is used under its own lock
because rasterio handles are not thread-safe.
Global Solar Atlas 2.0 (Solargis / World Bank–ESMAP), Global Wind Atlas (DTU /
World Bank–ESMAP): CC BY 4.0. Bounds order in Python: (south, west, north, east).
"""
import functools
import json
import math
import os
import re
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote

import numpy as np

for _k, _v in {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_USE_HEAD": "NO",
               "CPL_VSIL_CURL_CACHE_SIZE": "200000000", "VSI_CACHE": "TRUE",
               "GDAL_HTTP_MAX_RETRY": "2", "GDAL_HTTP_TIMEOUT": "30"}.items():
    os.environ.setdefault(_k, _v)

# layer -> (source, member file in the GSA zip, colour range min, max)
LAYERS = {
    "pvout": ("gsa", "PVOUT.tif", 700.0, 2300.0),
    "wind100": ("gwa", None, 2.0, 12.0),
}
GSA_API = "https://api.globalsolaratlas.info/download"
GWA_URL = "https://globalwindatlas.info/api/gis/country/{iso3}/wind-speed/100"
GSA_ZIP_SUFFIX = "_GISdata_LTAym_YearlyMonthlyTotals_GlobalSolarAtlas-v2_GEOTIFF.zip"
DATA_DIR = Path(__file__).resolve().parent / "data"
ZIP_TAIL = 200_000          # bytes at the end of the zip fetched to read its central directory
MAX_WIDTH = 1024
MAX_COUNTRIES = 6
MAX_HANDLES = 12
MAX_LAT = 85.0
MAX_GAP = 8                 # px; seams between country rasters up to this wide are filled for display
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
_gsa_iso3 = {}                      # ISO3 -> GSA name, built once from countries() or the bundled list
_handles = OrderedDict()            # (layer, ISO3) -> open rasterio dataset, LRU order
_key_locks = {}
_guard = threading.Lock()           # protects _handles, _key_locks and _gsa_iso3


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


@functools.lru_cache(maxsize=1)
def country_bboxes():
    """{ISO3: [[w, s, e, n], …]}, one bbox per polygon part (Natural Earth 1:50m)."""
    return json.loads((DATA_DIR / "country_bboxes.json").read_text(encoding="utf-8"))


def countries_in_view(south, west, north, east, limit=MAX_COUNTRIES):
    """ISO3 codes whose parts intersect the view, largest intersection first, at most `limit`."""
    areas = {}
    for code, parts in country_bboxes().items():
        a = 0.0
        for w, s, e, n in parts:
            dx, dy = min(e, east) - max(w, west), min(n, north) - max(s, south)
            if dx > 0 and dy > 0:
                a += dx * dy
        if a > 0:
            areas[code] = a
    return sorted(areas, key=lambda c: -areas[c])[:limit]


def _gsa_map():
    with _guard:
        if not _gsa_iso3:
            try:
                names = countries()
            except Exception:
                names = json.loads((DATA_DIR / "gsa_countries.json").read_text(encoding="utf-8"))
            for name in names:
                code = iso3(name)
                if code:
                    _gsa_iso3.setdefault(code, name)
        return _gsa_iso3


def gsa_name(code):
    """Global Solar Atlas country name for an ISO3 code, or None."""
    return _gsa_map().get(code)


def country_name(code):
    """Display name: the GSA name when there is one, else the ISO3 code."""
    return gsa_name(code) or code


@functools.lru_cache(maxsize=64)
def _gsa_member(name):
    """(zip URL, PVOUT member path) for a GSA country. The root folder inside the zip differs from
    the zip name (LTAy vs LTAym), so it is read from the central directory at the end of the zip."""
    zip_url = f"{GSA_API}/{quote(name)}/{quote(name + GSA_ZIP_SUFFIX)}"
    resp = _get(None)(zip_url, headers={"Range": f"bytes=-{ZIP_TAIL}"}, timeout=30)
    resp.raise_for_status()
    tail = resp.content
    for m in re.finditer(rb"PK\x01\x02", tail):              # central directory file header
        i = m.start()
        n = int.from_bytes(tail[i + 28:i + 30], "little")
        member = tail[i + 46:i + 46 + n].decode("utf-8", "replace")
        if (member == "PVOUT.tif" or member.endswith("/PVOUT.tif")) and "monthly/" not in member:
            return zip_url, member
    raise LookupError(f"PVOUT.tif not found in the Global Solar Atlas zip for {name!r}")


def dataset_path(layer, code):
    """GDAL path of the remote country raster; LookupError when the atlas has no entry."""
    if LAYERS[layer][0] == "gwa":
        return "/vsicurl/" + GWA_URL.format(iso3=code)
    name = gsa_name(code)
    if not name:
        raise LookupError(f"no Global Solar Atlas entry for {code}")
    zip_url, member = _gsa_member(name)
    return f"/vsizip//vsicurl/{zip_url}/{member}"


def _with_dataset(layer, code, fn):
    """fn(dataset) under the (layer, ISO3) lock, opening the remote raster on first use.
    Evicted handles are closed under their own lock after this one is released, so a thread
    never holds two key locks."""
    import rasterio
    key = (layer, code)
    with _guard:
        lock = _key_locks.setdefault(key, threading.Lock())
    evicted = []
    with lock:
        with _guard:
            ds = _handles.get(key)
            if ds is not None:
                _handles.move_to_end(key)
        if ds is None:
            ds = rasterio.open(dataset_path(layer, code))
            with _guard:
                _handles[key] = ds
                while len(_handles) > MAX_HANDLES:
                    evicted.append(_handles.popitem(last=False))
        result = fn(ds)
    for old_key, old in evicted:
        with _key_locks[old_key]:
            old.close()
    return result


def _read_country(layer, code, shape, south, west, north, east):
    """(row0, col0, values) of the country's block in the output grid `shape` over the view,
    or None when its raster does not cover the view."""
    from rasterio.enums import Resampling
    from rasterio.windows import Window, from_bounds
    h, w = shape
    dx, dy = (east - west) / w, (north - south) / h

    def read(ds):
        b = ds.bounds
        w0, s0, e0, n0 = max(west, b.left), max(south, b.bottom), min(east, b.right), min(north, b.top)
        if w0 >= e0 or s0 >= n0:
            return None
        # output cells whose centres fall inside the raster
        c0 = max(0, math.ceil((w0 - west) / dx - 0.5))
        c1 = min(w, math.floor((e0 - west) / dx - 0.5) + 1)
        r0 = max(0, math.ceil((north - n0) / dy - 0.5))
        r1 = min(h, math.floor((north - s0) / dy - 0.5) + 1)
        if c0 >= c1 or r0 >= r1:
            return None
        win = from_bounds(west + c0 * dx, north - r1 * dy, west + c1 * dx, north - r0 * dy,
                          transform=ds.transform)
        win = win.intersection(Window(0, 0, ds.width, ds.height))
        data = ds.read(1, window=win, out_shape=(r1 - r0, c1 - c0), resampling=Resampling.bilinear,
                       masked=True)
        return r0, c0, data.astype("float64").filled(np.nan)

    return _with_dataset(layer, code, read)


def _nearest_finite(a, axis, sign, reach):
    """(value, distance) of the nearest finite pixel within `reach` px along axis/sign; inf = none."""
    val = np.full(a.shape, np.nan)
    dist = np.full(a.shape, np.inf)
    n = a.shape[axis]
    for k in range(1, min(reach, n - 1) + 1):
        sh = np.full(a.shape, np.nan)
        src = [slice(None)] * a.ndim
        dst = [slice(None)] * a.ndim
        if sign > 0:                                  # neighbour at index + k
            src[axis], dst[axis] = slice(k, None), slice(None, n - k)
        else:                                         # neighbour at index - k
            src[axis], dst[axis] = slice(None, n - k), slice(k, None)
        sh[tuple(dst)] = a[tuple(src)]
        m = np.isinf(dist) & np.isfinite(sh)
        val[m] = sh[m]
        dist[m] = k
    return val, dist


def fill_thin_gaps(a, passes=3, max_gap=MAX_GAP):
    """Fill seams up to `max_gap` px wide between stitched country rasters, in place.
    Cosmetic only (display PNG); never applied to data used for profiles.
    A NaN pixel is filled only with finite pixels on opposite sides (left and right, else up and
    down) bounding a gap of at most `max_gap` px, with their mean, so coasts and outer edges,
    which have data on one side only, stay transparent."""
    for _ in range(passes):
        nan = np.isnan(a)
        if not nan.any():
            break
        filled = False
        for axis in (1, 0):
            lo_v, lo_d = _nearest_finite(a, axis, -1, max_gap)
            hi_v, hi_d = _nearest_finite(a, axis, 1, max_gap)
            m = np.isnan(a) & nan & (lo_d + hi_d - 1 <= max_gap)
            a[m] = (lo_v[m] + hi_v[m]) / 2
            filled = filled or bool(m.any())
        if not filled:
            break
    return a


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


def render_view(layer, south, west, north, east, width):
    """(png_bytes | None, (w, s, e, n), used names, skipped names) for the requested bounds
    (latitude clipped to ±85°). A pixel comes from the first country in view with finite data;
    a country whose remote raster cannot be opened or read is skipped. png is None without pixels.
    Countries are opened and read in parallel (each under its own key lock), then stitched in
    ranked order."""
    import rasterio
    south, north = max(south, -MAX_LAT), min(north, MAX_LAT)
    bounds = (west, south, east, north)
    if south >= north or west >= east:
        return None, bounds, [], []
    w_px = max(1, min(int(width), MAX_WIDTH))
    h_px = max(1, int(round(w_px * (north - south) / (east - west))))
    if h_px > MAX_WIDTH:                          # tall view: shrink the width so the aspect ratio holds
        w_px = max(1, int(round(w_px * MAX_WIDTH / h_px)))
        h_px = MAX_WIDTH
    out = np.full((h_px, w_px), np.nan)
    used, skipped = [], []
    codes = countries_in_view(south, west, north, east)
    if codes:
        with ThreadPoolExecutor(max_workers=min(len(codes), MAX_COUNTRIES)) as pool:
            futures = [pool.submit(_read_country, layer, code, out.shape, south, west, north, east)
                       for code in codes]
        for code, fut in zip(codes, futures):
            try:
                block = fut.result()
            except Exception:                     # 404, no GSA entry, network error
                skipped.append(country_name(code))
                continue
            if block is None:
                continue
            r0, c0, vals = block
            sub = out[r0:r0 + vals.shape[0], c0:c0 + vals.shape[1]]
            fill = np.isnan(sub) & np.isfinite(vals)
            sub[fill] = vals[fill]
            if fill.any():
                used.append(country_name(code))
    if not used:
        return None, bounds, used, skipped
    rgba = colorize(fill_thin_gaps(out), layer)
    with rasterio.io.MemoryFile() as mem:
        with mem.open(driver="PNG", height=h_px, width=w_px, count=4, dtype="uint8") as dst:
            dst.write(np.moveaxis(rgba, -1, 0))
        png = mem.read()
    return png, bounds, used, skipped

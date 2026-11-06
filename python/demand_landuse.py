"""
demand_landuse.py — OSM land-use polygons and per-pixel class coverage.

Land-use ways/relations are fetched from Overpass (cached on disk), parsed to
WGS84 polygons per class, and rasterised on a sub-grid aligned to the EC raster
pixels to give each pixel's covered fraction per class (decision D6a/D6e).
Relation inner rings are ignored (documented approximation).
"""
import hashlib
import json
import os
import time
import urllib.request
from pathlib import Path

import numpy as np
import shapely
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import LineString, Polygon
from shapely.validation import make_valid

LANDUSE_CLASSES = ("residential", "commercial", "industrial", "farmland")
_TAG_TO_CLASS = {"residential": "residential", "commercial": "commercial", "retail": "commercial",
                 "industrial": "industrial", "farmland": "farmland", "farmyard": "farmland"}
# Same order as the Go proxy (backend-go/internal/overpass/client.go).
OVERPASS_MIRRORS = ("https://overpass.openstreetmap.fr/api/interpreter", "https://overpass-api.de/api/interpreter",
                    "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter")
MIRROR_TIMEOUT_S = 60.0
FETCH_DEADLINE_S = 150.0
_REMARK_ERRORS = ("error", "timed out", "out of memory")
_GAP_PX = 64   # pixels further apart than this in x are rasterised in separate windows


def overpass_query(bbox):
    """bbox = (minlon, minlat, maxlon, maxlat); Overpass wants (south,west,north,east)."""
    minlon, minlat, maxlon, maxlat = bbox
    b = f"({minlat},{minlon},{maxlat},{maxlon})"
    tags = "|".join(_TAG_TO_CLASS)
    return (f'[out:json][timeout:{int(MIRROR_TIMEOUT_S)}];(way["landuse"~"^({tags})$"]{b};'
            f'relation["landuse"~"^({tags})$"]{b};);out geom;')


def _post(url, query, timeout):
    req = urllib.request.Request(url, data=query.encode("utf-8"), headers={"User-Agent": "TEMPO-demand"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_landuse(bbox, cache_dir, fetch=None, clock=time.monotonic):
    """Raw Overpass JSON for the bbox; cached by query. Mirrors are tried in turn (MIRROR_TIMEOUT_S each)
    until FETCH_DEADLINE_S has passed; raises the last error if none succeeds."""
    fetch = fetch or _post
    query = overpass_query(bbox)
    path = Path(cache_dir) / "landuse" / f"{hashlib.sha1(query.encode('utf-8')).hexdigest()}.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            path.unlink()
    deadline = clock() + FETCH_DEADLINE_S
    data, last = None, None
    for url in OVERPASS_MIRRORS:
        remaining = deadline - clock()
        if remaining <= 0:
            last = last or TimeoutError("Overpass deadline passed")
            break
        try:
            reply = fetch(url, query, min(MIRROR_TIMEOUT_S, remaining))
            remark = str(reply.get("remark") or "").lower()
            if any(e in remark for e in _REMARK_ERRORS):   # HTTP 200 carrying a server-side failure
                raise IOError(f"{url}: remark: {reply['remark']}")
            data = reply
            break
        except Exception as exc:  # noqa: BLE001 - any mirror failure falls through to the next
            last = exc
    if data is None:
        raise last or IOError("no Overpass mirror available")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data), encoding="utf-8")
    os.replace(tmp, path)
    return data


def _coords(geom):
    """(lon, lat) points; Overpass `out geom` gives null for vertices outside the bbox — skipped."""
    return [(p["lon"], p["lat"]) for p in geom if p is not None]


def _areal_parts(geom):
    """Polygon parts of a (made-valid) geometry; lines/points dropped."""
    if geom is None or geom.is_empty:
        return []
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return [p for p in shapely.get_parts(geom) if not p.is_empty]
    if geom.geom_type == "GeometryCollection":
        return [p for g in shapely.get_parts(geom) for p in _areal_parts(g)]
    return []


def _way_polygons(geom):
    """A closed way's polygon. Null (outside-bbox) vertices are dropped; a closing vertex that is null at
    both ends still counts as closed."""
    if geom[0] != geom[-1]:
        return []
    coords = _coords(geom)
    if len(coords) < 3:
        return []
    return _areal_parts(make_valid(Polygon(coords)))


def _relation_polygons(members):
    """Outer rings (role "outer", or "" in legacy multipolygons) polygonised; inner rings ignored."""
    parts = [_coords(m.get("geometry") or []) for m in members
             if m.get("type") == "way" and m.get("role") in ("outer", "")]
    lines = [LineString(c) for c in parts if len(c) >= 2]
    if not lines:
        return []
    return [q for p in shapely.polygonize(lines).geoms for q in _areal_parts(make_valid(p))]


def parse_overpass(data):
    """{class: [Polygon, ...]} in WGS84; unclosed ways and non-areal results dropped."""
    out = {c: [] for c in LANDUSE_CLASSES}
    for el in data.get("elements", []):
        cls = _TAG_TO_CLASS.get((el.get("tags") or {}).get("landuse"))
        if cls is None:
            continue
        if el.get("type") == "way" and el.get("geometry"):
            out[cls].extend(_way_polygons(el["geometry"]))
        elif el.get("type") == "relation":
            out[cls].extend(_relation_polygons(el.get("members", [])))
    return out


def _band_fractions(px, py, class_trees, pixel_size, sub):
    """Coverage fractions for pixels sharing one band of rows; rasterises only the band's extent."""
    out = np.zeros((len(px), len(LANDUSE_CLASSES)))
    half = pixel_size / 2
    x0, y0 = px.min() - half, py.max() + half
    x1, y1 = px.max() + half, py.min() - half
    cell = pixel_size / sub
    ncols = int(round((x1 - x0) / pixel_size)) * sub
    nrows = int(round((y0 - y1) / pixel_size)) * sub
    transform = from_origin(x0, y0, cell, cell)
    pc = np.rint((px - half - x0) / pixel_size).astype(int)
    pr = np.rint((y0 - (py + half)) / pixel_size).astype(int)
    window = shapely.box(x0, y1, x1, y0)
    for k, cls in enumerate(LANDUSE_CLASSES):
        tree = class_trees.get(cls)
        if tree is None:
            continue
        polys = tree.geometries[tree.query(window, predicate="intersects")]
        if len(polys) == 0:
            continue
        mask = rasterize([(p, 1) for p in polys], out_shape=(nrows, ncols), transform=transform,
                         fill=0, dtype="uint8", all_touched=False)
        blocks = mask.reshape(nrows // sub, sub, ncols // sub, sub).sum(axis=(1, 3))
        out[:, k] = blocks[pr, pc] / float(sub * sub)
    return out


def pixel_class_fractions(px, py, class_polys, pixel_size, sub=10, band=256):
    """(n_pixels, len(LANDUSE_CLASSES)) share of each pixel square covered by each class.
    px/py = pixel centres, class_polys in the SAME projected CRS. Rows are scaled so sums are <= 1.
    Pixels are processed in bands of `band` pixel rows, each split where pixels lie more than _GAP_PX
    pixels apart in x, so memory stays bounded for country-size or far-apart (±180°, islands) areas."""
    px, py = np.asarray(px, float), np.asarray(py, float)
    n = len(px)
    out = np.zeros((n, len(LANDUSE_CLASSES)))
    if n == 0:
        return out
    trees = {cls: shapely.STRtree(polys) for cls, polys in class_polys.items() if len(polys)}
    row = np.rint((py.max() - py) / pixel_size).astype(np.int64)
    bands = row // max(int(band), 1)
    for b in np.unique(bands):
        sel = np.nonzero(bands == b)[0]
        sel = sel[np.argsort(px[sel], kind="stable")]
        cuts = np.nonzero(np.diff(px[sel]) > _GAP_PX * pixel_size)[0] + 1
        for group in np.split(sel, cuts):
            out[group] = _band_fractions(px[group], py[group], trees, pixel_size, sub)
    total = out.sum(axis=1)
    over = total > 1
    out[over] /= total[over][:, None]
    return out

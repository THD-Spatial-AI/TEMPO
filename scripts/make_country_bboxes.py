"""
make_country_bboxes.py — write python/data/country_bboxes.json ({ISO3: [[w,s,e,n], …]}).

One bbox per polygon part (mainland, each island), a part larger than 5° split into one bbox
per 5° tile, rounded outward to 0.01°, from Natural Earth 1:50m admin-0 countries (public domain), GeoJSON edition:
https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson

    python scripts/make_country_bboxes.py path/to/ne_50m_admin_0_countries.geojson
"""
import json
import math
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "python" / "data" / "country_bboxes.json"
TILE = 5                          # degrees; large parts are split into tiles of this size
CODE_OVERRIDES = {"KOS": "XKX"}   # renewables_atlas.ISO3_OVERRIDES spells Kosovo XKX
# Global Solar Atlas countries that Natural Earth folds into France or omits (Tokelau)
EXTRA = {"GUF": [[-54.62, 2.12, -51.65, 5.79]], "REU": [[55.23, -21.37, 55.84, -20.86]],
         "TKL": [[-172.53, -9.45, -171.18, -8.53]]}


def iso3(props):
    for key in ("ISO_A3", "ISO_A3_EH", "ADM0_A3"):
        code = props.get(key)
        if code and code != "-99":
            return CODE_OVERRIDES.get(code, code)
    return None


def bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return [math.floor(min(xs) * 100) / 100, math.floor(min(ys) * 100) / 100,
            math.ceil(max(xs) * 100) / 100, math.ceil(max(ys) * 100) / 100]


def clip(ring, w, s, e, n):
    """Sutherland–Hodgman clip of a ring to a rectangle (concave rings may gain edges along the
    rectangle border, which only makes the bbox slightly larger)."""
    for inside, cut in (
        (lambda p: p[0] >= w, lambda a, b: (w, a[1] + (b[1] - a[1]) * (w - a[0]) / (b[0] - a[0]))),
        (lambda p: p[0] <= e, lambda a, b: (e, a[1] + (b[1] - a[1]) * (e - a[0]) / (b[0] - a[0]))),
        (lambda p: p[1] >= s, lambda a, b: (a[0] + (b[0] - a[0]) * (s - a[1]) / (b[1] - a[1]), s)),
        (lambda p: p[1] <= n, lambda a, b: (a[0] + (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]), n)),
    ):
        out = []
        for i, b in enumerate(ring):
            a = ring[i - 1]
            if inside(b):
                if not inside(a):
                    out.append(cut(a, b))
                out.append(b)
            elif inside(a):
                out.append(cut(a, b))
        ring = out
        if not ring:
            break
    return ring


def part_bboxes(ring):
    """One bbox for a small part; a large part is clipped to TILE° tiles, one bbox per tile, so a
    long coastline (e.g. Brazil reaching -33.7°) does not claim the whole rectangle around it."""
    w, s, e, n = bbox(ring)
    if e - w <= TILE and n - s <= TILE:
        return [[w, s, e, n]]
    out = []
    for tx in range(math.floor(w / TILE), math.ceil(e / TILE)):
        for ty in range(math.floor(s / TILE), math.ceil(n / TILE)):
            piece = clip(ring, tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE)
            if len(piece) >= 3:
                out.append(bbox(piece))
    return out


def main(src):
    features = json.loads(Path(src).read_text(encoding="utf-8"))["features"]
    out = {}
    for f in features:
        code = iso3(f["properties"])
        geom = f["geometry"]
        if not code or not geom:
            continue
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        for poly in polys:
            out.setdefault(code, []).extend(part_bboxes(poly[0]))
    for code, parts in EXTRA.items():
        out.setdefault(code, []).extend(parts)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(sorted(out.items())), separators=(",", ":")), encoding="utf-8")
    print(f"{len(out)} countries, {sum(len(v) for v in out.values())} parts -> {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main(sys.argv[1])

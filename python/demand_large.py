"""
demand_large.py — large consumers (Inc 7): which OSM objects count as mine sites.

Shared by scripts/make_mine_footprints.py (the bundled per-country table) and the
run-time study-area query, so both apply the same rules:
- a site is inactive if it has a disused:/abandoned:/construction/proposed key or a past end_date;
- a `landuse=quarry` counts only when large and not a bulk / low-load material;
- tailings ponds lying inside a site (representative point) carry no load and are cut out.

It also holds the run-time mining split (plan L1, L3, L5): the national mining share
(UNSD), the per-country mine-area table and the site → substation allocation, and the
study-area site lookup (plan "Decision update 2", hybrid): OSM sites from one Overpass
query for `osm`-source countries, Maus footprints for `maus`-source countries.
"""
import datetime
import json
import re
from pathlib import Path

import numpy as np
import shapely
from pyproj import Geod
from shapely.geometry import LineString, Polygon, shape
from shapely.ops import polygonize

import demand_growth as dg
import demand_seeds as ds
import demand_landuse as dlu

DEFAULT_SHARE_TABLE = Path(__file__).parent / "data" / "heavy_industry_share.csv"
DEFAULT_MINE_AREA = Path(__file__).parent / "data" / "mine_area_by_country.csv"
MAUS_CAP_KM2 = 50.0            # a Maus polygon counts at most this much in the area key
HV_KM = 15.0                   # a mine is metered at a high-voltage substation this close to it
HV_MIN_KV = 110.0

INACTIVE_PREFIXES = ("disused:", "abandoned:", "construction", "proposed")
LOW_LOAD_RESOURCES = frozenset({"sand", "gravel", "clay", "stone", "limestone", "aggregate", "peat"})
QUARRY_MIN_KM2 = 1.0           # quarry with a non-excluded resource
QUARRY_UNTAGGED_MIN_KM2 = 5.0  # quarry without a resource tag

MINE_SELECTOR = '["industrial"="mine"]'
# Server-side narrowing (exact low-load values, perimeter > 3.5 km, necessary for >= 1 km2: a 1 km2
# circle has 3.54 km); is_large_quarry applies the full rule client-side.
QUARRY_SELECTOR = (f'["landuse"="quarry"]["resource"!~"^({"|".join(sorted(LOW_LOAD_RESOURCES))})$"]'
                   '(if:length()>3500)')
TAILINGS_SELECTOR = '["man_made"="tailings_pond"]'
_GEOD = Geod(ellps="WGS84")


def is_active(tags, today=None):
    """False for disused/abandoned/construction/proposed sites and an end_date before today."""
    if any(k.startswith(INACTIVE_PREFIXES) for k in tags):
        return False
    today = today or datetime.date.today().isoformat()
    end = tags.get("end_date", "")
    return not (end[:4].isdigit() and end[:10] < today)


def is_large_quarry(tags, km2):
    """Quarry rule: >= 1 km2 unless every resource value is low-load; untagged only >= 5 km2."""
    res = {v.strip() for v in tags.get("resource", "").split(";") if v.strip()}
    if not res:
        return km2 >= QUARRY_UNTAGGED_MIN_KM2
    return km2 >= QUARRY_MIN_KM2 and not res <= LOW_LOAD_RESOURCES


def subtract_tailings(site, tailings):
    """site minus the tailings polygons whose representative point lies inside it."""
    inside = [t for t in tailings if site.contains(t.representative_point())]
    return site.difference(shapely.union_all(inside)) if inside else site


def _num(value):
    return float(value) if str(value or "").strip() else 0.0


def load_mining_share(path=DEFAULT_SHARE_TABLE):
    """{ISO2: {year: {total_twh, mining_twh, nonferrous_twh}}} from the UNSD table (blank = 0)."""
    table = {}
    for row in dg._rows(path):
        table.setdefault(row["iso2"].upper(), {})[int(row["year"])] = {
            k: _num(row.get(k)) for k in ("total_twh", "mining_twh", "nonferrous_twh")}
    return table


def mining_share(table, iso2, model_year):
    """{year, mining_twh, share, rule} for the latest year <= model_year (else the latest), or None.

    L1: mining_twh / total_twh. Some countries (Peru, Zambia) book mining under non-ferrous
    metals, so when mining_twh is 0 and nonferrous_twh > 0 the non-ferrous figure is used
    (rule "nonferrous"). None when the country has no row or no mining energy."""
    series = table.get(str(iso2 or "").upper()) or {}
    if not series:
        return None
    earlier = [y for y in series if y <= model_year]
    year = max(earlier) if earlier else max(series)
    row = series[year]
    twh, rule = row["mining_twh"], "mining"
    if twh == 0 and row["nonferrous_twh"] > 0:
        twh, rule = row["mining_twh"] + row["nonferrous_twh"], "nonferrous"
    if twh <= 0 or row["total_twh"] <= 0:
        return None
    return {"year": year, "mining_twh": twh, "share": twh / row["total_twh"], "rule": rule}


def load_mine_area(path=DEFAULT_MINE_AREA):
    """{ISO2: {iso3, source, osm_km2, maus_capped_km2}} from the bundled per-country mine-area table."""
    return {row["iso2"].upper(): {"iso3": row["iso3"], "source": row["source"],
                                  "osm_km2": _num(row["osm_km2"]), "maus_capped_km2": _num(row["maus_capped_km2"])}
            for row in dg._rows(path)}


def country_mine_km2(row):
    """Area-key denominator of a country: its OSM total, or its capped Maus total."""
    return row["osm_km2"] if row["source"] == "osm" else row["maus_capped_km2"]


def substation_kv(value):
    """Highest voltage in kV of a voltage value ('220;66', 220, '220000'); values > 1000 are volts."""
    kv = ds._kv(value)
    return kv / 1000.0 if kv is not None and kv > 1000 else kv


def allocate_mines(sites, sub_xy, h_gwh, country_km2, far_km=30.0, voltages=None, hv_km=HV_KM):
    """Mine energy per substation (L3, L5). All geometry in one projected plane (metres).

    sites: [{geometry, iso2, name, km2_key}] already clipped to the study area and split by country;
    sub_xy: (x array, y array) of every substation; voltages: per-substation voltage values (or None);
    h_gwh / country_km2: {ISO2: national mining GWh / area-key denominator km2}. A site's energy is
    h_gwh × km2_key / country_km2. Withdrawal point: among substations inside the site or within hv_km
    of its polygon, the highest voltage >= 110 kV (ties: nearest to the polygon, then lower index), since
    mines are metered at transmission level; with none, a substation inside the site (nearest to its
    representative point), else the nearest substation. Returns {gwh (per substation), assignments, warnings}."""
    sx, sy = np.asarray(sub_xy[0], float), np.asarray(sub_xy[1], float)
    kv = np.array([substation_kv(v) or 0.0 for v in (voltages if voltages is not None else [None] * len(sx))])
    points = shapely.points(sx, sy)
    gwh = np.zeros(len(sx))
    assignments, warnings = [], []
    for i, site in enumerate(sites):
        pt = site["geometry"].representative_point()
        dist = np.hypot(sx - pt.x, sy - pt.y)
        to_poly = shapely.distance(site["geometry"], points)
        hv = np.flatnonzero((to_poly <= hv_km * 1000.0) & (kv >= HV_MIN_KV))
        inside = np.flatnonzero(shapely.contains_xy(site["geometry"], sx, sy))
        if len(hv):
            j = int(hv[np.lexsort((hv, to_poly[hv], -kv[hv]))[0]])
        elif len(inside):
            j = int(inside[np.argmin(dist[inside])])
        else:
            j = int(np.argmin(dist))
        if not len(hv) and not len(inside) and dist[j] > far_km * 1000.0:
            warnings.append({"code": "MINE_FAR_FROM_SUBSTATION",
                             "message": f"Mine site {site.get('name') or '(unnamed)'} is {dist[j] / 1000:.0f} km "
                                        "from the nearest substation; its demand is placed there anyway."})
        energy = h_gwh[site["iso2"]] * site["km2_key"] / country_km2[site["iso2"]]
        gwh[j] += energy
        assignments.append({"site": i, "sub": j, "gwh": energy, "dist_km": float(dist[j]) / 1000.0})
    return {"gwh": gwh, "assignments": assignments, "warnings": warnings}


# ── Study-area mine sites (run time) ──────────────────────────────────────────

def geodesic_km2(g):
    return abs(_GEOD.geometry_area_perimeter(g)[0]) / 1e6


def _line(geom):
    return [(p["lon"], p["lat"]) for p in geom if p]


def osm_polygon(el):
    """Shapely polygon of a closed way or a multipolygon relation (outer minus inner rings), else None."""
    if el["type"] == "way":
        pts = _line(el.get("geometry", []))
        if len(pts) < 4 or pts[0] != pts[-1]:
            return None
        g = shapely.make_valid(Polygon(pts))
    else:
        rings = {"outer": [], "inner": []}
        for m in el.get("members", []):
            if m["type"] == "way" and len(m.get("geometry") or []) >= 2:
                rings["inner" if m.get("role") == "inner" else "outer"].append(LineString(_line(m["geometry"])))
        outer = shapely.union_all(list(polygonize(rings["outer"])))
        inner = shapely.union_all(list(polygonize(rings["inner"])))
        g = shapely.make_valid(outer.difference(inner))
    g = shapely.union_all([p for p in getattr(g, "geoms", [g]) if p.geom_type.endswith("Polygon")])
    return None if g.is_empty else g


def mine_query(bbox):
    """One Overpass query for mines, large-quarry candidates and tailings ponds in bbox
    (minlon, minlat, maxlon, maxlat)."""
    minlon, minlat, maxlon, maxlat = bbox
    b = f"({minlat},{minlon},{maxlat},{maxlon})"
    parts = "".join(f"wr{sel}{b};" for sel in (MINE_SELECTOR, QUARRY_SELECTOR, TAILINGS_SELECTOR))
    return f"[out:json][timeout:{int(dlu.MIRROR_TIMEOUT_S)}];({parts});out geom;"


def parse_mine_sites(data, today=None):
    """[{geometry, name, km2}] from a mine_query reply, with the rules of make_mine_footprints.py:
    inactive sites dropped, quarries kept only when large and not inside a mine envelope,
    tailings ponds inside a site subtracted."""
    today = today or datetime.date.today().isoformat()
    mines, quarries, tails = [], [], []
    for el in data.get("elements", []):
        tags = el.get("tags") or {}
        g = osm_polygon(el)
        if g is None:
            continue
        if tags.get("man_made") == "tailings_pond":
            tails.append(g)
        if not is_active(tags, today):
            continue
        if tags.get("industrial") == "mine":
            mines.append((tags, g))
        elif tags.get("landuse") == "quarry" and is_large_quarry(tags, geodesic_km2(g)):
            quarries.append((tags, g))
    if mines and quarries:
        tree = shapely.STRtree([g for _, g in mines])
        quarries = [(t, g) for t, g in quarries
                    if len(tree.query(g.representative_point(), predicate="within")) == 0]
    out = []
    for tags, g in mines + quarries:
        g = subtract_tailings(g, tails)
        out.append({"geometry": g, "name": tags.get("name"), "km2": geodesic_km2(g)})
    return out


def fetch_osm_mine_sites(bbox, cache_dir, fetch=None, today=None):
    """Active OSM mine sites (envelopes + large quarries, tailings cut out) in bbox. The Overpass reply is
    cached under cache_dir/mines (same mirrors, deadline and remark handling as land use)."""
    data = dlu.fetch_overpass(mine_query(bbox), Path(cache_dir) / "mines", fetch=fetch)
    return parse_mine_sites(data, today)


_BBOX = re.compile(r'"bbox":\[([^\]]*)\]')


def load_maus_sites(footprints_path, area_geom):
    """[{geometry, iso2, name: None, km2}] of the footprint (GeoJSON-seq) polygons intersecting area_geom.
    Each line's bbox is checked before its geometry is parsed."""
    minx, miny, maxx, maxy = area_geom.bounds
    shapely.prepare(area_geom)
    out = []
    with open(footprints_path, encoding="utf-8") as fh:
        for line in fh:
            m = _BBOX.search(line)
            if m:
                x0, y0, x1, y1 = map(float, m.group(1).split(","))
                if x0 > maxx or x1 < minx or y0 > maxy or y1 < miny:
                    continue
            feat = json.loads(line)
            g = shape(feat["geometry"])
            if not area_geom.intersects(g):
                continue
            props = feat.get("properties") or {}
            out.append({"geometry": g, "iso2": str(props.get("iso2") or "").upper(), "name": None,
                        "km2": float(props.get("km2") or 0.0)})
    return out


def _country_of(geom, areas):
    """Code of the area part overlapping geom most, or None."""
    best, code = 0.0, None
    for c, part in areas.items():
        a = shapely.intersection(geom, part).area
        if a > best:
            best, code = a, c
    return code


def study_area_sites(areas, codes, mine_area, *, cache_dir, footprints_path, query_osm=True, fetch=None):
    """(sites, missing) for the study-area countries `codes` (hybrid per country).

    areas: {ISO2: WGS84 geometry} (demand_estimate.country_areas); codes: countries with a mining split.
    `osm`-source countries take the OSM sites of one Overpass query over their bbox, each site assigned
    to the country part it overlaps most; `maus`-source countries take the footprints of their iso2.
    missing: {ISO2: (warning code, reason)} for countries whose sites could not be obtained
    (query_osm=False, Overpass failure, footprint file absent)."""
    sites, missing = [], {}
    osm = [c for c in codes if mine_area[c]["source"] == "osm"]
    maus = [c for c in codes if mine_area[c]["source"] != "osm"]
    if osm and not query_osm:
        missing.update({c: ("MINES_SKIPPED", "study area too large for an OSM mine query") for c in osm})
    elif osm:
        try:
            found = fetch_osm_mine_sites(shapely.union_all([areas[c] for c in osm]).bounds, cache_dir, fetch=fetch)
        except Exception as exc:  # noqa: BLE001 - reported as a warning; the estimate runs on
            missing.update({c: ("MINES_UNAVAILABLE", f"OSM mine sites could not be fetched ({exc})") for c in osm})
        else:
            for s in found:
                code = _country_of(s["geometry"], {c: areas[c] for c in osm})
                if code:
                    sites.append({**s, "iso2": code})
    if maus:
        if footprints_path is None or not Path(footprints_path).exists():
            missing.update({c: ("MINES_UNAVAILABLE", "mine footprints are not downloaded") for c in maus})
        else:
            union = shapely.union_all([areas[c] for c in maus])
            sites.extend(s for s in load_maus_sites(footprints_path, union) if s["iso2"] in maus)
    return sites, missing

"""
Regenerate python/data/mine_area_by_country.csv (Inc 7, plan "Decision update 2", hybrid).

osm_km2         - geodesic area of active OpenStreetMap sites: `industrial=mine` envelopes plus
                  large quarries (`landuse=quarry` >= 1 km2 whose resource is not a bulk or
                  low-load material incl. peat; untagged resource only >= 5 km2; rules in
                  python/demand_large.py; a quarry inside a mine envelope
                  is part of it and skipped). Tailings ponds whose representative point lies
                  inside a site are subtracted. Country = Natural Earth 1:10m admin-0 country
                  containing the site's representative point. One global Overpass query per
                  tag (60x60 deg tiles if every mirror refuses it); replies cached in --cache.
                  Excluded: disused:*/abandoned:*/construction*/proposed* keys, past end_date.
maus_km2,       - Maus et al. (2022) global mining polygons v2, per country from the GPKG's
maus_capped_km2   AREA column; capped = sum of min(AREA, 50 km2) (the run-time area key).
source          - osm if osm_km2 >= 0.2 x maus_km2, else maus; n_sites counts that source.
iso3            - the run-time ISO3 -> ISO2 map for demand_data.maus_to_footprints.

Dev-only: needs `pycountry`, a local Maus GPKG
(https://download.pangaea.de/dataset/942325/files/global_mining_polygons_v2.gpkg) and
network access. Regenerate, don't hand-edit the CSV.

    & "$env:APPDATA\\TEMPO\\demand-venv\\Scripts\\python.exe" scripts/make_mine_footprints.py `
        --maus-gpkg path\\to\\global_mining_polygons_v2.gpkg [--cache dir]
"""
import argparse
import csv
import datetime
import json
import sqlite3
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import pycountry
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))
from demand_landuse import OVERPASS_MIRRORS  # noqa: E402
from demand_large import (LOW_LOAD_RESOURCES, MINE_SELECTOR as MINE, QUARRY_SELECTOR as QUARRY,  # noqa: E402
                          TAILINGS_SELECTOR, is_active, is_large_quarry, subtract_tailings)
from demand_large import geodesic_km2 as km2, osm_polygon as polygon  # noqa: E402
from make_ec_country_totals import countries  # noqa: E402  (Natural Earth admin-0 by ISO2)

OUT = ROOT / "python" / "data" / "mine_area_by_country.csv"
QUERY_TIMEOUT_S = 900
NEAREST_MAX_DEG = 0.1
MAUS_CAP_KM2 = 50.0
GATE = 0.2


def _post(url, query):
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "TEMPO-demand"})
    with urllib.request.urlopen(req, timeout=QUERY_TIMEOUT_S + 60) as resp:
        reply = json.loads(resp.read())
    if "remark" in reply and "error" in reply["remark"].lower():
        raise IOError(reply["remark"])
    return reply


def _query(selector, bbox=""):
    q = f'[out:json][timeout:{QUERY_TIMEOUT_S}][maxsize:1073741824];wr{selector}{bbox};out geom;'
    for url in OVERPASS_MIRRORS:
        try:
            return _post(url, q)
        except Exception as e:  # noqa: BLE001 - try the next mirror
            print(f"  {url}: {e}")
    raise IOError("all Overpass mirrors failed")


def fetch(selector, cache):
    """Overpass reply {osm3s, elements} for all ways/relations matching selector, cached as raw JSON."""
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    print("Overpass", selector)
    try:
        reply = _query(selector)
    except IOError:
        print("  global query failed; tiling 60x60 deg")
        seen, base = {}, []
        for s in range(-90, 90, 60):
            for w in range(-180, 180, 60):
                tile = _query(selector, f"({s},{w},{s + 60},{w + 60})")
                base.append(tile["osm3s"]["timestamp_osm_base"])
                for el in tile["elements"]:
                    seen[(el["type"], el["id"])] = el
        reply = {"osm3s": {"timestamp_osm_base": min(base)}, "elements": list(seen.values())}
    cache.write_text(json.dumps(reply), encoding="utf-8")
    return reply


def maus_by_country(gpkg):
    """{iso2: [iso3, n, km2, capped_km2]} from the GPKG's AREA column."""
    con = sqlite3.connect(f"file:{Path(gpkg).as_posix()}?mode=ro", uri=True)
    rows = con.execute("SELECT ISO3_CODE, COUNT(*), SUM(AREA), SUM(MIN(AREA, ?)) FROM mining_polygons "
                       "GROUP BY ISO3_CODE", (MAUS_CAP_KM2,)).fetchall()
    con.close()
    out = {}
    for iso3, n, area, capped in rows:
        rec = pycountry.countries.get(alpha_3=iso3)
        iso2 = rec.alpha_2 if rec else {"XKX": "XK", "KOS": "XK"}[iso3]
        out[iso2] = [iso3, n, area, capped]
    return out


def iso3_of(iso2):
    rec = pycountry.countries.get(alpha_2=iso2)
    return rec.alpha_3 if rec else {"XK": "XKX"}.get(iso2, "")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--maus-gpkg", required=True, help="local global_mining_polygons_v2.gpkg")
    ap.add_argument("--cache", default=".", help="directory for the raw Overpass replies")
    a = ap.parse_args()
    cache = Path(a.cache)
    today = datetime.date.today().isoformat()

    def sites(selector, name):
        reply = fetch(selector, cache / name)
        out = [(el, polygon(el)) for el in reply["elements"] if is_active(el.get("tags", {}), today)]
        return reply["osm3s"]["timestamp_osm_base"][:10], [(el, g) for el, g in out if g is not None]

    osm_date, mines = sites(MINE, "osm_industrial_mine.json")
    q_date, quarries = sites(QUARRY, "osm_quarry_large.json")
    mine_tree = STRtree([g for _, g in mines])
    n_q = len(quarries)
    quarries = [(el, g) for el, g in quarries if is_large_quarry(el.get("tags", {}), km2(g))
                and len(mine_tree.query(g.representative_point(), predicate="within")) == 0]
    tails = [g for g in (polygon(el) for el in fetch(TAILINGS_SELECTOR, cache / "osm_tailings.json")["elements"])
             if g is not None]
    tail_tree = STRtree([t.representative_point() for t in tails])

    ne = countries()
    isos = list(ne)
    ne_tree = STRtree([ne[i] for i in isos])
    osm, unassigned = {}, 0
    for el, g in mines + quarries:
        g = subtract_tailings(g, [tails[i] for i in tail_tree.query(g, predicate="contains")])
        pt = g.representative_point()
        hit = ne_tree.query(pt, predicate="within")
        if len(hit) == 0:  # coastal / offshore point: nearest country within ~10 km
            i = ne_tree.nearest(pt)
            if ne[isos[i]].distance(pt) > NEAREST_MAX_DEG:
                unassigned += 1
                continue
            hit = [i]
        t = osm.setdefault(isos[hit[0]], [0, 0.0])
        t[0] += 1
        t[1] += km2(g)

    maus = maus_by_country(a.maus_gpkg)
    n_src = {"osm": 0, "maus": 0}
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        f.write(f"# Sources: osm_km2 = OpenStreetMap industrial=mine envelopes + large quarries (>= 1 km2, resource not "
                f"{'/'.join(sorted(LOW_LOAD_RESOURCES))}; untagged >= 5 km2) minus "
                f"tailings ponds (Overpass, OSM data of {min(osm_date, q_date)}), (c) OpenStreetMap contributors, "
                "ODbL 1.0; maus_km2/maus_capped_km2 = Maus, V. et al. (2022) Global-scale mining polygons v2, "
                "https://doi.org/10.1594/PANGAEA.942325 (Sci. Data 9, 433, https://doi.org/10.1038/s41597-022-01547-4), "
                f"CC BY-SA 4.0; capped = sum of min(polygon km2, {MAUS_CAP_KM2:g}). source = osm if osm_km2 >= "
                f"{GATE:g} x maus_km2 else maus. Regenerate with scripts/make_mine_footprints.py\n")
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["iso2", "iso3", "n_sites", "osm_km2", "maus_km2", "maus_capped_km2", "source"])
        for iso in sorted(set(osm) | set(maus)):
            n_osm, k = osm.get(iso, (0, 0.0))
            iso3, n_maus, mk, mc = maus.get(iso, [iso3_of(iso), 0, 0.0, 0.0])
            src = "osm" if k > 0 and k >= GATE * mk else "maus"
            n_src[src] += 1
            w.writerow([iso, iso3, n_osm if src == "osm" else n_maus, round(k, 3), round(mk, 3), round(mc, 3), src])
    print(f"{len(mines)} active mine envelopes, {len(quarries)} of {n_q} quarry candidates kept, "
          f"{unassigned} sites outside Natural Earth, {len(tails)} tailings ponds; countries: {n_src} -> {OUT}")


if __name__ == "__main__":
    main()

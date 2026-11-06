"""Real-network smoke run of the substation-demand pipeline (estimate + shapes) for Arica, Chile.

Run: <demand-venv>\\python.exe scripts/smoke_demand_arica.py
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "python"))

import numpy as np  # noqa: E402

import demand_data as dd  # noqa: E402
import demand_estimate as de  # noqa: E402
import demand_growth as dg  # noqa: E402
import demand_landuse as dl  # noqa: E402
import demand_shapes as dsh  # noqa: E402

UA = {"User-Agent": "TEMPO-demand-smoke"}
CACHE = Path(os.environ["APPDATA"]) / "TEMPO" / "demand-data"
MODEL_YEAR = 2024
GATE_GWH, GATE_TOL = 739.0, 0.05


def get(url, data=None, timeout=200):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_area(name="Arica, Chile"):
    q = urllib.parse.urlencode({"q": name, "format": "jsonv2", "polygon_geojson": 1, "limit": 5})
    hits = get("https://nominatim.openstreetmap.org/search?" + q, timeout=60)
    geom_of = lambda h: h["geometry"] if "geometry" in h else h["geojson"]  # noqa: E731
    hit = next((h for h in hits if geom_of(h)["type"] in ("Polygon", "MultiPolygon")), hits[0])
    geom = geom_of(hit)
    print(f"Nominatim: {hit.get('display_name')} ({geom['type']})")
    return {"type": "FeatureCollection",
            "features": [{"type": "Feature", "geometry": geom, "properties": {"countryCode": "CL"}}]}


def parse_kv(v):
    best = 0.0
    for part in (v or "").split(";"):
        try:
            x = float(part.strip())
        except ValueError:
            continue
        best = max(best, x / 1000.0 if x > 1000 else x)
    return best


def fetch_substations(bbox):
    minlon, minlat, maxlon, maxlat = bbox
    q = (f'[out:json][timeout:120];(node["power"="substation"]({minlat},{minlon},{maxlat},{maxlon});'
         f'way["power"="substation"]({minlat},{minlon},{maxlat},{maxlon}););out center tags;')
    last = None
    for url in dl.OVERPASS_MIRRORS:
        try:
            data = get(url, q.encode("utf-8"))
            break
        except Exception as exc:  # noqa: BLE001
            last = exc
            print(f"  mirror failed {url}: {exc}")
    else:
        raise last
    subs = []
    for el in data["elements"]:
        lon = el.get("lon", (el.get("center") or {}).get("lon"))
        lat = el.get("lat", (el.get("center") or {}).get("lat"))
        if lon is None or lat is None:
            continue
        tags = el.get("tags") or {}
        kind = tags.get("substation")
        if kind in ("transmission", "generation", "traction", "minor_distribution"):
            if kind != "minor_distribution":
                continue
        subs.append({"id": f"{el['type'][0]}{el['id']}", "name": tags.get("name") or f"{el['type']}/{el['id']}",
                     "lon": float(lon), "lat": float(lat), "substation": kind,
                     "voltage_kv": parse_kv(tags.get("voltage"))})
    return subs


def main():
    t = {}
    t0 = time.time()
    area = fetch_area()
    time.sleep(1.1)
    area_geom = de.area_geometry(area)
    bbox = area_geom.bounds
    print(f"bbox {tuple(round(v, 4) for v in bbox)}")
    t["area"] = time.time() - t0

    t0 = time.time()
    subs = fetch_substations(bbox)
    t["substations"] = time.time() - t0
    kinds = defaultdict(int)
    for s in subs:
        kinds[s["substation"]] += 1
    print(f"{len(subs)} substations {dict(kinds)}")

    t0 = time.time()
    ec = dd.ensure_ec_raster(2019, CACHE)
    t["raster"] = time.time() - t0

    t0 = time.time()
    raw = dl.fetch_landuse(bbox, CACHE)
    landuse = dl.parse_overpass(raw)
    t["landuse"] = time.time() - t0
    print("landuse polygons:", {k: len(v) for k, v in landuse.items()})

    t0 = time.time()
    res = de.estimate(area, subs, ec_path=ec, model_year=MODEL_YEAR, country="CL",
                      national_table=dg.load_national_table(), raster_totals=dg.load_raster_totals(),
                      landuse=landuse)
    t["estimate"] = time.time() - t0

    cx, cy = de.area_centre(area_geom)
    t0 = time.time()
    shp = dsh.shape_substations(res["substations"], "2024-01-01", "2024-12-31", "60min", country="CL", latitude=cy)
    t["shapes"] = time.time() - t0

    print("\nCHAIN:", json.dumps(res["chain"], indent=1))
    print("WARNINGS:", json.dumps(res["warnings"], indent=1))
    print(f"\n{'name':36} {'GWh':>9} {'avgMW':>8} {'peakMW':>8} {'cover':>6}  mix")
    bad_mix = []
    for s in res["substations"]:
        if not s.get("mix"):
            continue
        tot = sum(s["mix"].values())
        if abs(tot - 100) > 1e-6:
            bad_mix.append((s["id"], tot))
        print(f"{str(s['name'])[:36]:36} {s['annual_gwh']:9.2f} {s['avg_mw']:8.3f} "
              f"{shp['peak_mw'][s['id']]:8.3f} {s.get('landuseCoverage', 0):6.2f}  {s['mix']}")
    print(f"\nsubstations with demand: {sum(1 for s in res['substations'] if s.get('mix'))}; "
          f"unique mixes: {shp['unique_mixes']}; southern={shp['southern']} tropical={shp['tropical']}")

    total = np.sum([np.asarray(v, float) for v in shp["series"].values()], axis=0)
    dts = np.array(shp["datetimes"], dtype="datetime64[s]")
    months = dts.astype("datetime64[M]").astype(int) % 12 + 1
    means = {m: float(total[months == m].mean()) for m in range(1, 13)}
    print("\nMonthly mean MW (area total):")
    for m, v in means.items():
        print(f"  {m:2d}: {v:9.2f}")
    avg, peak = float(total.mean()), float(total.max())
    ratio = peak / avg
    print(f"area total avg {avg:.2f} MW, peak {peak:.2f} MW, peak/avg {ratio:.3f}, "
          f"energy from series {total.sum() / 1000:.1f} GWh")
    print("\nTimings (s):", {k: round(v, 1) for k, v in t.items()})

    top3 = sorted(means, key=means.get, reverse=True)[:3]
    print("\nGATE")
    g1 = abs(res["totalGWh"] - GATE_GWH) / GATE_GWH <= GATE_TOL
    print(f" total {res['totalGWh']:.1f} GWh vs {GATE_GWH} +-5%: {'PASS' if g1 else 'FAIL'}")
    print(f" mixes sum to 100: {'PASS' if not bad_mix else 'FAIL ' + str(bad_mix)}")
    print(f" peak/avg {ratio:.3f} in [1.2, 2.5]: {'PASS' if 1.2 <= ratio <= 2.5 else 'FAIL'}")
    print(f" top-3 months {top3} (expect Jun-Aug): {'PASS' if set(top3) <= {5, 6, 7, 8, 9} and 6 in top3 or 7 in top3 else 'CHECK'}")
    print(f" top month {max(means, key=means.get)} in Jun-Aug: {'PASS' if max(means, key=means.get) in (6, 7, 8) else 'FAIL'}")


if __name__ == "__main__":
    main()

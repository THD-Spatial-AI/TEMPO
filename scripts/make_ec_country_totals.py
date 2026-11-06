"""
Regenerate python/data/ec_country_totals.csv: the cached Chen & Gao EC2019 raster
summed inside each Natural Earth 1:10m admin-0 country (public domain). The
estimate calibrates each country's pixels to national demand with it (D4).
Dev-only; needs the cached raster (downloads ~91 MB on first run). Regenerate,
don't hand-edit the CSV.

    & "$env:APPDATA\TEMPO\demand-venv\Scripts\python.exe" scripts/make_ec_country_totals.py
"""
import csv
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

import shapely  # noqa: E402
from shapely.geometry import shape  # noqa: E402
from shapely.ops import unary_union  # noqa: E402

import demand_data  # noqa: E402
import demand_raster  # noqa: E402

NE_URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
          "geojson/ne_10m_admin_0_countries.geojson")
OUT = ROOT / "python" / "data" / "ec_country_totals.csv"
RASTER_YEAR = 2019


def countries():
    """{ISO2: geometry}; features sharing an ISO-2 are merged."""
    req = urllib.request.Request(NE_URL, headers={"User-Agent": "TEMPO-demand"})
    fc = json.loads(urllib.request.urlopen(req, timeout=300).read())
    groups = {}
    for f in fc["features"]:
        p = f["properties"]
        iso = p.get("ISO_A2_EH") if p.get("ISO_A2_EH") not in (None, "", "-99") else p.get("ISO_A2")
        if iso in (None, "", "-99"):
            continue
        groups.setdefault(iso.upper(), []).append(shapely.make_valid(shape(f["geometry"])))
    return {iso: unary_union(geoms) for iso, geoms in groups.items()}


def main():
    t0 = time.perf_counter()
    cache = Path(os.environ["APPDATA"]) / "TEMPO" / "demand-data"
    tif = demand_data.ensure_ec_raster(RASTER_YEAR, cache)
    rows = []
    for iso, geom in sorted(countries().items()):
        _, _, kwh = demand_raster.read_area_pixels(tif, geom)
        rows.append((iso, RASTER_YEAR, round(float(kwh.sum()) / 1e9, 6)))
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        fh.write(f"# Source: Chen & Gao (2022) EC{RASTER_YEAR} raster (CC BY 4.0) summed over Natural Earth "
                 "1:10m admin-0 countries (public domain). Regenerate with scripts/make_ec_country_totals.py\n")
        writer = csv.writer(fh)
        writer.writerow(["iso2", "raster_year", "twh"])
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows -> {OUT} ({time.perf_counter() - t0:.0f} s)")


if __name__ == "__main__":
    main()

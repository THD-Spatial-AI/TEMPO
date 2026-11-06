"""
Sanity-check the Chen & Gao EC raster: country pixel sums vs OWID national
electricity demand (2019). Downloads EC2019 (~91 MB) into the TEMPO cache on
first run. Manual check — expect each ratio within 0.85–1.15.

    & "$env:APPDATA\TEMPO\demand-venv\Scripts\python.exe" scripts/check_ec_raster.py
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

import rasterio  # noqa: E402
from shapely.geometry import shape  # noqa: E402

import demand_data  # noqa: E402
import demand_growth  # noqa: E402
import demand_raster  # noqa: E402

COUNTRIES = {"DE": "Germany", "CL": "Chile", "KE": "Kenya"}


def country_polygon(name):
    query = urllib.parse.urlencode({"country": name, "format": "jsonv2", "polygon_geojson": 1,
                                    "polygon_threshold": 0.01, "limit": 1})
    req = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{query}",
                                 headers={"User-Agent": "TEMPO-demand-check"})
    return shape(json.loads(urllib.request.urlopen(req, timeout=60).read())[0]["geojson"])


def main():
    cache = Path(os.environ["APPDATA"]) / "TEMPO" / "demand-data"
    tif = demand_data.ensure_ec_raster(2019, cache, progress=lambda d, t: print(f"\r{d / t:6.1%}", end=""))
    print()
    with rasterio.open(tif) as src:
        print(f"raster: crs={src.crs} res={src.res} dtype={src.dtypes[0]} nodata={src.nodata} size={src.width}x{src.height} "
              f"compression={src.compression} file={tif.stat().st_size / 1e6:.0f} MB")
    table = demand_growth.load_national_table()
    for iso, name in COUNTRIES.items():
        area = country_polygon(name)
        t0 = time.perf_counter()
        _, _, kwh = demand_raster.read_area_pixels(tif, area)
        secs = time.perf_counter() - t0
        twh = kwh.sum() / 1e9
        ref = table.get(iso, {}).get(2019)
        ratio = f"{twh / ref:.3f}" if ref else "n/a"
        print(f"{iso}: raster {twh:9.2f} TWh   OWID 2019 {ref} TWh   ratio {ratio}   ({len(kwh)} px, {secs:.1f} s)")


if __name__ == "__main__":
    main()

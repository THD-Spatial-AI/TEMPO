"""HTTP smoke of the local demand service (Inc 3) with the Arica, Chile area.

The service must already be running:
    python -m uvicorn demand_service:app --app-dir python --host 127.0.0.1 --port 5006
Run with the demand-venv python (reuses the fetch helpers of smoke_demand_arica.py):
    python scripts/smoke_demand_service.py [--url http://127.0.0.1:5006]
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402

import smoke_demand_arica as sm  # noqa: E402

MODEL_YEAR = 2024
# /estimate defaults to largeConsumers=True: Chile's mining share (~36 %) leaves the lit part,
# and Arica has no mine site, so its total drops from the plain-raster 739 GWh (smoke_demand_arica.py).
GATE_GWH = 473.0


def call(base, path, body=None, timeout=600):
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(base + path, data=data, headers=headers,
                                 method="POST" if data is not None or path == "/data/ensure" else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"{path} -> HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:5006")
    base = ap.parse_args().url.rstrip("/")
    t = {}

    t0 = time.time()
    health = call(base, "/health")
    t["health"] = time.time() - t0
    print("HEALTH:", json.dumps(health))
    assert health.get("engine") == "demand", "not the demand service"

    t0 = time.time()
    st = call(base, "/data/ensure", {})
    while st["state"] == "downloading":
        print(f"  downloading {st['done']}/{st['total']}")
        time.sleep(2)
        st = call(base, "/data/status")
    t["ensure"] = time.time() - t0
    print("DATA:", st)
    if st["state"] != "ready":
        raise SystemExit("data not ready")

    t0 = time.time()
    area = sm.fetch_area()
    time.sleep(1.1)
    bbox = sm.de.area_geometry(area).bounds
    subs = sm.fetch_substations(bbox)
    t["osm"] = time.time() - t0
    print(f"{len(subs)} substations")

    t0 = time.time()
    res = call(base, "/estimate", {"area": area, "substations": subs, "modelYear": MODEL_YEAR,
                                   "country": "CL", "landuse": True})
    t["estimate"] = time.time() - t0
    print("\nCHAIN:", json.dumps(res["chain"], indent=1))
    print("WARNINGS:", json.dumps(res["warnings"], indent=1))
    print(f"latitude {res['latitude']:.3f} southern={res['southern']} tropical={res['tropical']}")

    t0 = time.time()
    shp = call(base, "/shape", {
        "substations": [{"id": s["id"], "avg_mw": s["avg_mw"], "mix": s.get("mix")} for s in res["substations"]],
        "start": f"{MODEL_YEAR}-01-01", "end": f"{MODEL_YEAR}-12-31", "resolution": "60min",
        "country": "CL", "family": "classic", "latitude": res["latitude"]})
    t["shape"] = time.time() - t0

    print(f"\n{'name':36} {'GWh':>9} {'avgMW':>8} {'peakMW':>8} {'cover':>6}")
    bad_mix = []
    for s in res["substations"]:
        if not s.get("mix"):
            continue
        if abs(sum(s["mix"].values()) - 100) > 1e-6:
            bad_mix.append((s["id"], sum(s["mix"].values())))
        print(f"{str(s['name'])[:36]:36} {s['annual_gwh']:9.2f} {s['avg_mw']:8.3f} "
              f"{shp['peak_mw'][s['id']]:8.3f} {s.get('landuseCoverage', 0):6.2f}")

    total = np.sum([np.asarray(v, float) for v in shp["series"].values()], axis=0)
    months = np.array(shp["datetimes"], dtype="datetime64[s]").astype("datetime64[M]").astype(int) % 12 + 1
    means = {m: float(total[months == m].mean()) for m in range(1, 13)}
    avg, peak = float(total.mean()), float(total.max())
    ratio = peak / avg
    top3 = sorted(means, key=means.get, reverse=True)[:3]
    print(f"\narea avg {avg:.2f} MW, peak {peak:.2f} MW, peak/avg {ratio:.3f}; unique mixes {shp['unique_mixes']}")
    print("monthly mean MW:", {m: round(v, 1) for m, v in means.items()})
    print("top-3 months:", top3)
    print("Timings (s):", {k: round(v, 1) for k, v in t.items()})

    print("\nGATE")
    print(f" total {res['totalGWh']:.1f} GWh vs {GATE_GWH} +-5%: "
          f"{'PASS' if abs(res['totalGWh'] - GATE_GWH) / GATE_GWH <= sm.GATE_TOL else 'FAIL'}")
    print(f" mixes sum to 100: {'PASS' if not bad_mix else 'FAIL ' + str(bad_mix)}")
    print(f" peak/avg {ratio:.3f} in [1.2, 2.5]: {'PASS' if 1.2 <= ratio <= 2.5 else 'FAIL'}")
    print(f" top months {top3} within Jun-Aug: {'PASS' if set(top3) <= {6, 7, 8} else 'CHECK'}"
          f" (top month {top3[0]}: {'PASS' if top3[0] in (6, 7, 8) else 'FAIL'})")


if __name__ == "__main__":
    main()

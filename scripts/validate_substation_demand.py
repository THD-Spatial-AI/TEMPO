"""Validate the substation-demand estimate against CEN 2024 metered withdrawals per barra (Chile).

Per commune: area total (estimate vs CEN barras inside the area) and the spatial split (CEN barras
mapped to their nearest seed; estimate rescaled to the CEN area total). Network responses are cached
under --cache-dir so reruns are offline.

Run: <demand-venv>\\python.exe scripts/validate_substation_demand.py --cache-dir <dir>
"""
import argparse
import csv
import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))
sys.path.insert(0, str(ROOT / "scripts"))

import demand_cells as dc  # noqa: E402
import demand_data as dd  # noqa: E402
import demand_estimate as de  # noqa: E402
import demand_growth as dg  # noqa: E402
import smoke_demand_arica as smoke  # noqa: E402

CEN_CSV = ROOT / "python" / "data" / "validation" / "cen_withdrawals_2024.csv"
CEN_NATIONAL_TWH = 79.732
DEFAULT_OUT = Path(os.environ.get("TEMP", "/tmp")) / "claude" / \
    "C--Users-user-Desktop-THD-SPATIAL-AI-TEMPO-calliope-editiontool" / \
    "5cfa988d-48ee-4fd3-8718-b3653c3b55c8" / "scratchpad" / "validation_2024.md"
# (Nominatim query, barra-name keywords used to spot coordinate-less barras that probably belong here)
AREAS = [
    ("Arica, Chile", ["ARICA", "CHINCHORRO", "PARINACOTA", "QUIANI", "PUKARA"]),
    ("Iquique, Chile", ["IQUIQUE", "CAVANCHA", "PALAFITOS", "ALTO_HOSPICIO"]),
    ("Antofagasta, Chile", ["ANTOFAGASTA", "ANTOF", "LA_PORTADA", "URIBE", "CENTRO_ANT", "SUR_ANT"]),
    ("Calama, Chile", ["CALAMA", "CHUQUI", "SALAR", "RADOMIRO", "ELCOBRE"]),
    ("La Serena, Chile", ["SERENA", "S.JOAQUIN", "SAN_JOAQUIN", "MARQUESA", "EL_PENON", "E.PENON"]),
    ("Rancagua, Chile", ["RANCAGUA", "CACHAPOAL", "ALAMEDA", "LOSLIRIOS", "TUNICHE"]),
    ("Temuco, Chile", ["TEMUCO", "PILLANLELBUN", "PADRE_LAS_CASAS", "PLASCASAS", "LABRANZA"]),
    ("Puerto Montt, Chile", ["MONTT", "PMONTT", "P.MONTT", "MELIPULLI", "CHINQUIHUE", "ALERCE"]),
]
BUFFER_M, MATCH_M = 2000.0, 5000.0


def make_cached_get(cache_dir):
    cache_dir.mkdir(parents=True, exist_ok=True)
    last = {"nominatim": 0.0}

    def get(url, data=None, timeout=200):
        key = hashlib.sha1((url + "|" + (data or b"").decode("utf-8")).encode("utf-8")).hexdigest()
        f = cache_dir / f"{key}.json"
        if f.exists():
            return json.loads(f.read_text(encoding="utf-8"))
        if "nominatim" in url:
            wait = 1.1 - (time.time() - last["nominatim"])
            if wait > 0:
                time.sleep(wait)
            last["nominatim"] = time.time()
        req = urllib.request.Request(url, data=data, headers={"User-Agent": "TEMPO-demand-validation"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8")
        out = json.loads(body)
        f.write_text(body, encoding="utf-8")
        return out
    return get


def load_cen():
    rows = []
    with open(CEN_CSV, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            rows.append({"barra": r["barra"], "kv": r["kv"], "gwh": float(r["annual_gwh"]),
                         "reg": float(r["regulated_gwh"]), "free": float(r["free_gwh"]),
                         "lat": float(r["lat"]) if r["lat"] else None, "lon": float(r["lon"]) if r["lon"] else None,
                         "infotecnica": r["infotecnica_subestacion"]})
    return rows


def pct(est, ref):
    return 100.0 * (est - ref) / ref if ref else float("nan")


MIN_GROUP_GWH = 1.0  # groups below this are kept in the tables but left out of the % statistics


def split_metrics(seeds, groups, est_total, key, cen_target):
    """Per matched seed group: estimate rescaled to cen_target vs CEN sum of `key` (gwh or reg)."""
    scale = cen_target / est_total if est_total else 0.0
    out = []
    for i, rs in groups.items():
        c = sum(r[key] for r in rs)
        e = seeds[i]["annual_gwh"] * scale
        out.append({"seed": seeds[i]["name"], "seed_id": seeds[i]["id"], "est_gwh_raw": seeds[i]["annual_gwh"],
                    "est_gwh_scaled": e, "cen_gwh": c,
                    "abs_pct_err": abs(e - c) / c * 100 if c >= MIN_GROUP_GWH else None,
                    "barras": [f"{r['barra']} ({r['gwh']:.1f}, free {r['free']:.1f})" for r in rs]})
    return out


def summary(per_seed):
    errs = np.array([p["abs_pct_err"] for p in per_seed if p["abs_pct_err"] is not None])
    ok = [p for p in per_seed if p["abs_pct_err"] is not None]
    cen = sum(p["cen_gwh"] for p in ok)
    return {"n_stat_groups": len(errs),
            "median_abs_pct": float(np.median(errs)) if len(errs) else None,
            "iqr_abs_pct": [float(np.percentile(errs, 25)), float(np.percentile(errs, 75))] if len(errs) else None,
            "wmae_pct": 100 * sum(abs(p["est_gwh_scaled"] - p["cen_gwh"]) for p in ok) / cen if cen > 0 else None}


def validate_area(name, keywords, cen, tables, ec):
    area = smoke.fetch_area(name)
    geom = de.area_geometry(area)
    subs = smoke.fetch_substations(geom.bounds)
    res = de.estimate(area, subs, ec_path=ec, model_year=2024, country="CL",
                      national_table=tables[0], raster_totals=tables[1], landuse=None)
    seeds = [s for s in res["substations"] if s["seed"]]
    seed_by_id = {s["id"]: s for s in subs}
    est_total = res["totalGWh"]

    fwd, _ = dc.local_projection(*de.area_centre(geom))
    geom_xy = shapely.transform(geom, fwd.transform, interleaved=False)
    buf = geom_xy.buffer(BUFFER_M)
    inside = []
    for r in cen:
        if r["lat"] is None:
            continue
        x, y = fwd.transform(r["lon"], r["lat"])
        if buf.contains(Point(x, y)):
            inside.append({**r, "x": x, "y": y})
    cen_total = sum(r["gwh"] for r in inside)
    cen_reg = sum(r["reg"] for r in inside)
    nocoord = [r for r in cen if r["lat"] is None and any(k in r["barra"] for k in keywords)]

    # spatial split: each barra -> nearest seed within MATCH_M
    sx, sy = fwd.transform(np.array([seed_by_id[s["id"]]["lon"] for s in seeds]),
                           np.array([seed_by_id[s["id"]]["lat"] for s in seeds]))
    groups, unmatched = {}, []
    for r in inside:
        d = np.hypot(sx - r["x"], sy - r["y"])
        i = int(np.argmin(d))
        if d[i] <= MATCH_M:
            groups.setdefault(i, []).append(r)
        else:
            unmatched.append({**r, "dist_km": float(d[i]) / 1000})
    per_seed = split_metrics(seeds, groups, est_total, "gwh", cen_total)
    reg = split_metrics(seeds, groups, est_total, "reg", cen_reg)
    no_barra_share = (sum(s["annual_gwh"] for i, s in enumerate(seeds) if i not in groups) / est_total
                      if est_total else float("nan"))
    return {
        "area": name, "est_gwh": est_total, "cen_gwh": cen_total, "cen_reg_gwh": cen_reg,
        "err_vs_cen_pct": pct(est_total, cen_total), "err_vs_reg_pct": pct(est_total, cen_reg),
        "n_osm_subs": len(subs), "n_seeds": len(seeds), "n_cen_inside": len(inside),
        "n_nocoord": len(nocoord), "nocoord_gwh": sum(r["gwh"] for r in nocoord),
        "nocoord": [f"{r['barra']} ({r['gwh']:.1f}; {r['infotecnica'] or 'no match'})" for r in nocoord],
        "n_matched_groups": len(per_seed), "n_unmatched_barras": len(unmatched),
        "unmatched_gwh": sum(r["gwh"] for r in unmatched),
        **summary(per_seed), **{f"reg_{k}": v for k, v in summary(reg).items()},
        "est_share_no_barra_pct": 100 * no_barra_share,
        "warnings": [w["code"] for w in res["warnings"]],
        "per_seed": sorted(per_seed, key=lambda p: -p["cen_gwh"]),
        "per_seed_regulated": sorted(reg, key=lambda p: -p["cen_gwh"]),
        "unmatched": [f"{r['barra']} ({r['gwh']:.1f}, {r['dist_km']:.1f} km)" for r in unmatched],
        "cen_inside": [f"{r['barra']} {r['gwh']:.1f} (reg {r['reg']:.1f}, free {r['free']:.1f})"
                       for r in sorted(inside, key=lambda r: -r["gwh"])],
    }


def fmt(v, d=1):
    return "–" if v is None or (isinstance(v, float) and np.isnan(v)) else f"{v:.{d}f}"


def render(results, national):
    L = ["# Substation demand vs CEN 2024 withdrawals", "",
         f"National: OWID {national['year']} CL = {national['twh']:.1f} TWh (sum of all CL estimates by construction) "
         f"vs CEN SEN withdrawals {CEN_NATIONAL_TWH:.1f} TWh ({pct(national['twh'], CEN_NATIONAL_TWH):+.1f} %). "
         "OWID includes losses, self-generation and non-SEN systems.", "",
         "## Area totals (GWh)", "",
         "| Area | Est | CEN | CEN reg | Est vs CEN % | Est vs reg % | OSM subs | Seeds | CEN barras in | "
         "No-coord barras (GWh) |",
         "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|"]
    for r in results:
        L.append(f"| {r['area'].split(',')[0]} | {fmt(r['est_gwh'])} | {fmt(r['cen_gwh'])} | {fmt(r['cen_reg_gwh'])} | "
                 f"{fmt(r['err_vs_cen_pct'])} | {fmt(r['err_vs_reg_pct'])} | {r['n_osm_subs']} | {r['n_seeds']} | "
                 f"{r['n_cen_inside']} | {r['n_nocoord']} ({fmt(r['nocoord_gwh'])}) |")
    L += ["", "## Spatial split (estimate rescaled to CEN area total)", "",
          f"Groups with CEN < {MIN_GROUP_GWH:g} GWh are excluded from the % statistics. 'reg' = same split compared "
          "against regulated withdrawals only (estimate rescaled to the CEN regulated area total).", "",
          "| Area | Matched seed groups (in stats) | Unmatched barras (GWh) | Median abs % err | IQR abs % err | "
          "Energy-weighted MAE % | reg median | reg IQR | reg EW-MAE % | Est share on seeds w/o barra % |",
          "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for r in results:
        iqr = (lambda q: f"{q[0]:.0f}–{q[1]:.0f}" if q else "–")
        L.append(f"| {r['area'].split(',')[0]} | {r['n_matched_groups']} ({r['n_stat_groups']}) | "
                 f"{r['n_unmatched_barras']} ({fmt(r['unmatched_gwh'])}) | {fmt(r['median_abs_pct'], 0)} | "
                 f"{iqr(r['iqr_abs_pct'])} | {fmt(r['wmae_pct'], 0)} | {fmt(r['reg_median_abs_pct'], 0)} | "
                 f"{iqr(r['reg_iqr_abs_pct'])} | {fmt(r['reg_wmae_pct'], 0)} | {fmt(r['est_share_no_barra_pct'], 0)} |")
    for label, key in (("all withdrawals", "per_seed"), ("regulated only", "per_seed_regulated")):
        groups = [p for r in results for p in r[key]]
        errs = [p["abs_pct_err"] for p in groups if p["abs_pct_err"] is not None]
        if errs:
            s = summary(groups)
            L += ["", f"Pooled ({label}): {len(errs)} seed groups, median abs % err {np.median(errs):.0f}, "
                      f"IQR {np.percentile(errs, 25):.0f}–{np.percentile(errs, 75):.0f}, "
                      f"energy-weighted MAE {s['wmae_pct']:.0f} %."]
    L += ["", "## Per-seed detail", ""]
    for r in results:
        L.append(f"### {r['area']}  (warnings: {', '.join(r['warnings']) or 'none'})")
        L.append("")
        L.append("| Seed | Est raw | Est scaled | CEN | abs % err | Barras (GWh, free) |")
        L.append("|---|---:|---:|---:|---:|---|")
        for p in r["per_seed"]:
            L.append(f"| {str(p['seed'])[:30]} | {fmt(p['est_gwh_raw'])} | {fmt(p['est_gwh_scaled'])} | "
                     f"{fmt(p['cen_gwh'])} | {fmt(p['abs_pct_err'], 0)} | {'; '.join(p['barras'])} |")
        if r["unmatched"]:
            L.append(f"\nUnmatched (> 5 km from a seed): {'; '.join(r['unmatched'])}")
        if r["nocoord"]:
            L.append(f"\nNo-coordinate barras matching area keywords: {'; '.join(r['nocoord'])}")
        L.append("")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache-dir", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--areas", nargs="*", help="subset of Nominatim names")
    a = ap.parse_args()
    smoke.get = make_cached_get(a.cache_dir)
    cen = load_cen()
    tables = (dg.load_national_table(), dg.load_raster_totals())
    ec = dd.ensure_ec_raster(2019, smoke.CACHE)
    results = []
    for name, kws in AREAS:
        if a.areas and name not in a.areas:
            continue
        print(f"== {name}", file=sys.stderr)
        results.append(validate_area(name, kws, cen, tables, ec))
    national = dg.national_demand(tables[0], "CL", 2024)
    md = render(results, national)
    print(md)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(md, encoding="utf-8")
    a.out.with_suffix(".json").write_text(json.dumps({"national": national, "cen_national_twh": CEN_NATIONAL_TWH,
                                                      "areas": results}, indent=1), encoding="utf-8")
    print(f"\nwrote {a.out} and {a.out.with_suffix('.json')}", file=sys.stderr)


if __name__ == "__main__":
    main()

"""
demand_estimate.py — per-substation annual electricity demand for a study area.

Pipeline (decisions D2–D5): seed substations → EC pixels inside the area →
each pixel to its nearest seed → per-seed kWh shares → area total (raster sum ×
national growth, or the user's override) → per-seed GWh + Voronoi cell features.
Shaping to hourly series is a separate step (Inc 2).
"""
import numpy as np
import shapely
from shapely.geometry import shape
from shapely.ops import unary_union

import demand_cells as dc
import demand_growth as dg
import demand_raster as dr
import demand_seeds as ds

HOURS_PER_YEAR = 8760.0
FAR_SHARE = 0.10


def area_geometry(area_geojson):
    """Union of a GeoJSON FeatureCollection / Feature / geometry."""
    if area_geojson.get("type") == "FeatureCollection":
        geoms = [f["geometry"] for f in area_geojson["features"]]
    elif area_geojson.get("type") == "Feature":
        geoms = [area_geojson["geometry"]]
    else:
        geoms = [area_geojson]
    return unary_union([shapely.make_valid(shape(g)) for g in geoms])


def area_centre(area):
    """(lon, lat) projection centre. An area spanning > 180° of longitude is taken to cross the
    antimeridian, so its centroid is computed with longitudes shifted to 0..360."""
    minx, _, maxx, _ = area.bounds
    if maxx - minx <= 180:
        c = area.centroid
        return c.x, c.y
    c = shapely.transform(area, lambda xy: np.c_[xy[:, 0] % 360, xy[:, 1]]).centroid
    return (c.x + 180) % 360 - 180, c.y


def _record(sub, seed, gwh, share, km2):
    return {
        "id": sub["id"], "name": sub.get("name"), "seed": seed,
        "annual_gwh": round(gwh, 6),
        "avg_mw": round(gwh * 1000.0 / HOURS_PER_YEAR, 6),
        "share": float(share),
        "area_km2": round(km2, 3),
        "density_gwh_km2": round(gwh / km2, 6) if km2 > 0 else 0.0,
    }


def estimate(area_geojson, substations, *, ec_path, raster_year, model_year, country,
             national_table, max_kv=ds.DEFAULT_MAX_KV, override_gwh=None, far_km=30.0):
    """Result dict: substations, cells (FeatureCollection), chain, totalGWh, warnings."""
    if not substations:
        raise ValueError("no substations given")
    warnings = []
    seeds, fallback = ds.select_seeds(substations, max_kv)
    if fallback:
        warnings.append({"code": "NO_SEEDS_FALLBACK",
                         "message": "No distribution or industrial substation found; demand is placed on all substations."})

    lons, lats = np.array([s["lon"] for s in seeds], float), np.array([s["lat"] for s in seeds], float)
    if len(np.unique(np.c_[lons, lats], axis=0)) < len(seeds):
        warnings.append({"code": "DUPLICATE_SEED",
                         "message": "Some withdrawal substations share a location; only one of each group receives demand."})

    area = area_geometry(area_geojson)
    fwd, inv = dc.local_projection(*area_centre(area))
    area_xy = shapely.transform(area, fwd.transform, interleaved=False)
    sx, sy = fwd.transform(lons, lats)

    per_seed = np.zeros(len(seeds))
    lon, lat, kwh = dr.read_area_pixels(ec_path, area)
    if len(kwh):
        px, py = fwd.transform(lon, lat)
        idx, dist = dc.nearest_seed(px, py, sx, sy)
        per_seed = np.bincount(idx, weights=kwh, minlength=len(seeds)).astype(float)
        far = float(kwh[dist > far_km * 1000.0].sum())
        if far > FAR_SHARE * float(kwh.sum()):
            warnings.append({"code": "FAR_FROM_SEED",
                             "message": f"{far / kwh.sum():.0%} of the demand lies more than {far_km:g} km from any "
                                        "withdrawal substation; OSM may be missing substations there."})
    else:
        warnings.append({"code": "NO_PIXELS", "message": "The raster has no consumption inside this area."})

    raw_gwh = float(per_seed.sum()) / 1e6
    growth = dg.growth_factor(national_table, country, raster_year, model_year)
    if growth["note"]:
        warnings.append({"code": "NO_GROWTH_DATA", "message": growth["note"]})
    scaled_gwh = raw_gwh * growth["factor"]
    total = float(override_gwh) if override_gwh is not None else scaled_gwh

    cells = dc.voronoi_cells(sx, sy, area_xy)
    weights = per_seed
    if per_seed.sum() == 0:
        weights = np.array([c.area for c in cells])
        warnings.append({"code": "AREA_SHARES",
                         "message": "No raster consumption to split the total; shares follow cell area instead."})
    shares = weights / weights.sum() if weights.sum() > 0 else np.zeros(len(seeds))
    out, features = [], []
    for sub, share, cell in zip(seeds, shares, cells):
        rec = _record(sub, True, float(share) * total, share, cell.area / 1e6)
        out.append(rec)
        features.append(dc.cell_feature(cell, inv, {
            "locationId": sub["id"], "name": sub.get("name"),
            "annualGWh": rec["annual_gwh"], "avgMW": rec["avg_mw"],
            "densityGWhKm2": rec["density_gwh_km2"], "areaKm2": rec["area_km2"],
        }))
    seed_ids = {s["id"] for s in seeds}
    out.extend(_record(s, False, 0.0, 0.0, 0.0) for s in substations if s["id"] not in seed_ids)

    chain = {
        "rasterYear": raster_year, "rasterSumGWh": round(raw_gwh, 6), "country": country,
        "growthFactor": round(growth["factor"], 6), "growthToYear": growth["to_year"],
        "scaledGWh": round(scaled_gwh, 6), "overrideGWh": override_gwh, "totalGWh": round(total, 6),
    }
    return {"substations": out, "cells": {"type": "FeatureCollection", "features": features},
            "chain": chain, "totalGWh": total, "warnings": warnings}

"""
demand_estimate.py — per-substation annual electricity demand for a study area.

Pipeline (decisions D2–D5): seed substations → EC pixels inside the area, per
country, each scaled by national demand / raster country total → each pixel to
its nearest seed → per-seed kWh → area total (or the user's override, keeping the
shares) → per-seed GWh + Voronoi cell features.
Shaping to hourly series is a separate step (Inc 2).
"""
import numpy as np
import shapely
from shapely.geometry import shape
from shapely.ops import unary_union

import demand_cells as dc
import demand_growth as dg
import demand_landuse as dl
import demand_mix as dm
import demand_raster as dr
import demand_seeds as ds

HOURS_PER_YEAR = 8760.0
FAR_SHARE = 0.10
RASTER_YEAR = 2019    # the raster is only a spatial key (D4); ec_country_totals.csv is summed from it
DEFAULT_GLOBAL_MIX = {"classic": {"h0_dyn": 50, "g0": 35, "g3": 10, "l0": 5},
                      "bdew25": {"h25": 55, "g25": 40, "l25": 5}}


def _union(geoms):
    return unary_union([shapely.make_valid(shape(g)) for g in geoms])


def area_geometry(area_geojson):
    """Union of a GeoJSON FeatureCollection / Feature / geometry."""
    if area_geojson.get("type") == "FeatureCollection":
        geoms = [f["geometry"] for f in area_geojson["features"]]
    elif area_geojson.get("type") == "Feature":
        geoms = [area_geojson["geometry"]]
    else:
        geoms = [area_geojson]
    return _union(geoms)


def country_areas(area_geojson, country):
    """{ISO2 or "?": geometry}. Collection features group by properties.countryCode, else `country`."""
    if area_geojson.get("type") != "FeatureCollection":
        return {str(country or "?").upper(): area_geometry(area_geojson)}
    groups = {}
    for f in area_geojson["features"]:
        code = (f.get("properties") or {}).get("countryCode") or country or "?"
        groups.setdefault(str(code).upper(), []).append(f["geometry"])
    return {code: _union(geoms) for code, geoms in groups.items()}


def area_centre(area):
    """(lon, lat) projection centre. An area spanning > 180° of longitude is taken to cross the
    antimeridian, so its centroid is computed with longitudes shifted to 0..360."""
    minx, _, maxx, _ = area.bounds
    if maxx - minx <= 180:
        c = area.centroid
        return c.x, c.y
    c = shapely.transform(area, lambda xy: np.c_[xy[:, 0] % 360, xy[:, 1]]).centroid
    return (c.x + 180) % 360 - 180, c.y


def _record(sub, seed, gwh, share, km2, mix=None, coverage=0.0):
    return {
        "id": sub["id"], "name": sub.get("name"), "seed": seed,
        "annual_gwh": round(gwh, 6),
        "avg_mw": round(gwh * 1000.0 / HOURS_PER_YEAR, 6),
        "share": float(share),
        "area_km2": round(km2, 3),
        "density_gwh_km2": round(gwh / km2, 6) if km2 > 0 else 0.0,
        "mix": mix, "landuseCoverage": round(coverage, 3),
    }


def _calibrate(code, kwh, *, model_year, national_table, raster_totals, warnings):
    """(factor, chain row) scaling one country's pixels to its national demand."""
    nat = dg.national_demand(national_table, code, model_year) if code != "?" else {"twh": None, "year": None}
    country_twh = raster_totals.get(code)
    factor = 1.0
    if nat["twh"] is not None and country_twh:
        factor = nat["twh"] / country_twh
    else:
        reason = "the area has no country code" if code == "?" else (
            f"no national demand data for {code} up to {model_year}" if nat["twh"] is None
            else f"no raster country total for {code}")
        warnings.append({"code": "NO_CALIBRATION",
                         "message": f"Raw raster values used for {code}: {reason}."})
    raw_twh = float(kwh.sum()) / 1e9
    return factor, {
        "country": code, "rasterAreaTWh": round(raw_twh, 9), "rasterCountryTWh": country_twh,
        "nationalTWh": nat["twh"], "nationalYear": nat["year"], "factor": round(factor, 6),
        "areaTWh": round(raw_twh * factor, 9),
    }


def _pixel_fractions(ec_path, lon, lat, landuse):
    """Per-pixel land-use class coverage (D6a), computed in the raster CRS on its pixel grid."""
    crs, pixel_size = dr.raster_grid(ec_path)
    px, py = dr.to_raster_crs(crs, lon, lat)
    lists = [list(landuse.get(cls) or []) for cls in dl.LANDUSE_CLASSES]
    projected = dr.geometry_to_raster_crs(crs, [p for ps in lists for p in ps])   # one call for all classes
    bounds = np.cumsum([0] + [len(ps) for ps in lists])
    polys = {cls: projected[bounds[k]:bounds[k + 1]] for k, cls in enumerate(dl.LANDUSE_CLASSES)}
    return dl.pixel_class_fractions(px, py, polys, pixel_size)


def estimate(area_geojson, substations, *, ec_path, model_year, country, national_table, raster_totals,
             max_kv=ds.DEFAULT_MAX_KV, override_gwh=None, far_km=30.0,
             landuse=None, global_mix=None, family="classic"):
    """Result dict: substations, cells (FeatureCollection), chain, totalGWh, warnings.
    landuse: {class: [Polygon WGS84]} from demand_landuse.parse_overpass, or None (global mix everywhere)."""
    if not substations:
        raise ValueError("no substations given")
    if global_mix is None:
        global_mix = DEFAULT_GLOBAL_MIX[family]
    foreign = sorted(set(global_mix) - dm.FAMILY_CODES[family])
    if foreign:
        raise ValueError(f"global mix code(s) {foreign} do not belong to the {family} family")
    warnings = []
    seeds, fallback = ds.select_seeds(substations, max_kv)
    if fallback:
        warnings.append({"code": "NO_SEEDS_FALLBACK",
                         "message": "No distribution or industrial substation found; demand is placed on all substations."})

    lons, lats = np.array([s["lon"] for s in seeds], float), np.array([s["lat"] for s in seeds], float)
    if len(np.unique(np.c_[lons, lats], axis=0)) < len(seeds):
        warnings.append({"code": "DUPLICATE_SEED",
                         "message": "Some withdrawal substations share a location; only one of each group receives demand."})

    areas = country_areas(area_geojson, country)
    area = unary_union(list(areas.values()))
    fwd, inv = dc.local_projection(*area_centre(area))
    area_xy = shapely.transform(area, fwd.transform, interleaved=False)
    sx, sy = fwd.transform(lons, lats)

    per_seed = np.zeros(len(seeds))
    class_kwh = np.zeros((len(seeds), len(dl.LANDUSE_CLASSES)))
    parts, countries = [], []
    for code, geom in areas.items():
        c_lon, c_lat, c_kwh = dr.read_area_pixels(ec_path, geom)
        factor, row = _calibrate(code, c_kwh, model_year=model_year, national_table=national_table,
                                 raster_totals=raster_totals, warnings=warnings)
        parts.append((c_lon, c_lat, c_kwh * factor))
        countries.append(row)
    lon, lat, kwh = (np.concatenate(a) for a in zip(*parts))
    if len(kwh):
        px, py = fwd.transform(lon, lat)
        idx, dist = dc.nearest_seed(px, py, sx, sy)
        per_seed = np.bincount(idx, weights=kwh, minlength=len(seeds)).astype(float)
        if landuse is not None:
            frac = _pixel_fractions(ec_path, lon, lat, landuse)
            for k in range(frac.shape[1]):
                class_kwh[:, k] = np.bincount(idx, weights=kwh * frac[:, k], minlength=len(seeds))
        far = float(kwh[dist > far_km * 1000.0].sum())
        if far > FAR_SHARE * float(kwh.sum()):
            warnings.append({"code": "FAR_FROM_SEED",
                             "message": f"{far / kwh.sum():.0%} of the demand lies more than {far_km:g} km from any "
                                        "withdrawal substation; OSM may be missing substations there."})
    else:
        warnings.append({"code": "NO_PIXELS", "message": "The raster has no consumption inside this area."})

    calibrated_gwh = float(per_seed.sum()) / 1e6
    total = float(override_gwh) if override_gwh is not None else calibrated_gwh

    cells = dc.voronoi_cells(sx, sy, area_xy)
    weights = per_seed
    if per_seed.sum() == 0:
        weights = np.array([c.area for c in cells])
        warnings.append({"code": "AREA_SHARES",
                         "message": "No raster consumption to split the total; shares follow cell area instead."})
    shares = weights / weights.sum() if weights.sum() > 0 else np.zeros(len(seeds))
    out, features = [], []
    for i, (sub, share, cell) in enumerate(zip(seeds, shares, cells)):
        mix, coverage = dm.cell_mix(dict(zip(dl.LANDUSE_CLASSES, class_kwh[i])), float(per_seed[i]), global_mix,
                                    family=family, industrial=sub.get("substation") == "industrial")
        rec = _record(sub, True, float(share) * total, share, cell.area / 1e6, mix, coverage)
        out.append(rec)
        features.append(dc.cell_feature(cell, inv, {
            "locationId": sub["id"], "name": sub.get("name"),
            "annualGWh": rec["annual_gwh"], "avgMW": rec["avg_mw"],
            "densityGWhKm2": rec["density_gwh_km2"], "areaKm2": rec["area_km2"],
            "mix": rec["mix"], "landuseCoverage": rec["landuseCoverage"],
        }))
    seed_ids = {s["id"] for s in seeds}
    out.extend(_record(s, False, 0.0, 0.0, 0.0) for s in substations if s["id"] not in seed_ids)

    chain = {
        "rasterYear": RASTER_YEAR, "countries": countries, "calibratedGWh": round(calibrated_gwh, 6),
        "overrideGWh": override_gwh, "totalGWh": round(total, 6),
    }
    return {"substations": out, "cells": {"type": "FeatureCollection", "features": features},
            "chain": chain, "totalGWh": total, "warnings": warnings}

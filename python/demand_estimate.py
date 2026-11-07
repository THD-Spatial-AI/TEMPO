"""
demand_estimate.py — per-substation annual electricity demand for a study area.

Pipeline (decisions D2–D5): seed substations → EC pixels inside the area, per
country, each scaled by national demand / raster country total → each pixel to
its nearest seed → per-seed kWh → area total (or the user's override, keeping the
shares) → per-seed GWh + Voronoi cell features.
Shaping to hourly series is a separate step (Inc 2).

Large consumers (Inc 7, plan L1–L7), when enabled: a country's national demand is split
into a mining part (UNSD share), placed on mine sites in proportion to their area key and
withdrawn at the nearest substation of any type, and a lit part (the raster pixels outside
mine sites, scaled by 1 − share).
"""
import numpy as np
import shapely
from shapely.geometry import shape
from shapely.ops import unary_union

import demand_cells as dc
import demand_growth as dg
import demand_landuse as dl
import demand_large as dlg
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


def _record(sub, seed, gwh, share, km2, mix=None, coverage=0.0, mining_gwh=0.0, sites=None):
    return {
        "id": sub["id"], "name": sub.get("name"), "seed": seed,
        "annual_gwh": round(gwh, 6),
        "avg_mw": round(gwh * 1000.0 / HOURS_PER_YEAR, 6),
        "share": float(share),
        "area_km2": round(km2, 3),
        "density_gwh_km2": round(gwh / km2, 6) if km2 > 0 else 0.0,
        "mix": mix, "landuseCoverage": round(coverage, 3),
        "mining_gwh": round(mining_gwh, 6), "sites": sites or [],
    }


def _feature_props(rec, gwh, km2, kind):
    """Cell feature properties for one part (lit cell or mine sites) of a substation's energy."""
    return {
        "locationId": rec["id"], "name": rec["name"],
        "annualGWh": round(gwh, 6), "avgMW": round(gwh * 1000.0 / HOURS_PER_YEAR, 6),
        "densityGWhKm2": round(gwh / km2, 6) if km2 > 0 else 0.0, "areaKm2": round(km2, 3),
        "mix": rec["mix"], "landuseCoverage": rec["landuseCoverage"], "kind": kind,
    }


def _mining_split(areas, *, model_year, national_table, mining_share, mine_area, warnings):
    """{ISO2: {share, h_gwh, lit, source, denom}} for countries with a mining split (L1, L4)."""
    split = {}
    for code in areas:
        if code == "?":
            continue
        share = dlg.mining_share(mining_share or {}, code, model_year)
        row = (mine_area or {}).get(code)
        if share is None or row is None or not dlg.country_mine_km2(row):
            reason = "no UNSD mining share" if share is None else "no mine-area row"
            warnings.append({"code": "NO_MINING_SHARE",
                             "message": f"No mining split for {code} ({reason}); its demand follows the raster only."})
            continue
        nat = dg.national_demand(national_table, code, model_year)["twh"]
        if nat is None:
            continue                          # NO_CALIBRATION already explains it
        split[code] = {"share": share["share"], "h_gwh": share["share"] * nat * 1000.0, "lit": 1.0 - share["share"],
                       "source": row["source"], "denom": dlg.country_mine_km2(row)}
    return split


def _mine_parts(mine_sites, areas, split, fwd):
    """Site parts inside the area, one per site and split country (L3), in the projected plane.
    km2_key is the part's share of the site's key area (a Maus site's key is capped)."""
    parts = []
    for s in mine_sites:
        geom = shapely.make_valid(s["geometry"])
        full_km2 = None
        for code, cgeom in areas.items():
            if code not in split:
                continue
            part = dc._polygonal(shapely.intersection(geom, cgeom))
            if part.is_empty or part.area == 0:
                continue
            if full_km2 is None:
                full_km2 = shapely.transform(geom, fwd.transform, interleaved=False).area / 1e6
            part_xy = shapely.transform(part, fwd.transform, interleaved=False)
            km2 = part_xy.area / 1e6
            cap = dlg.MAUS_CAP_KM2 if split[code]["source"] == "maus" else float("inf")
            parts.append({"geometry": part_xy, "wgs": part, "iso2": code, "name": s.get("name"), "km2": km2,
                          "km2_key": min(full_km2, cap) * km2 / full_km2})
    return parts


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
             landuse=None, global_mix=None, family="classic",
             large_consumers=False, mine_sites=None, mining_share=None, mine_area=None):
    """Result dict: substations, cells (FeatureCollection), chain, totalGWh, warnings.
    landuse: {class: [Polygon WGS84]} from demand_landuse.parse_overpass, or None (global mix everywhere).
    large_consumers: split national demand into mining + lit parts (Inc 7) when mine_sites is given:
    mine_sites [{geometry (WGS84 shapely), iso2, name}], mining_share from demand_large.load_mining_share,
    mine_area from demand_large.load_mine_area."""
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

    split, sites = {}, []
    if large_consumers and mine_sites is not None:
        split = _mining_split(areas, model_year=model_year, national_table=national_table,
                              mining_share=mining_share, mine_area=mine_area, warnings=warnings)
        sites = _mine_parts(mine_sites, areas, split, fwd)

    per_seed = np.zeros(len(seeds))
    class_kwh = np.zeros((len(seeds), len(dl.LANDUSE_CLASSES)))
    parts, countries = [], []
    for code, geom in areas.items():
        c_lon, c_lat, c_kwh = dr.read_area_pixels(ec_path, geom)
        sp = split.get(code)
        c_sites = [p for p in sites if p["iso2"] == code]
        if c_sites and len(c_kwh):            # L4: a mine's own lights are not counted twice
            keep = ~shapely.contains_xy(shapely.union_all([p["wgs"] for p in c_sites]), c_lon, c_lat)
            c_lon, c_lat, c_kwh = c_lon[keep], c_lat[keep], c_kwh[keep]
        factor, row = _calibrate(code, c_kwh, model_year=model_year, national_table=national_table,
                                 raster_totals=raster_totals, warnings=warnings)
        parts.append((c_lon, c_lat, c_kwh * factor * sp["lit"] if sp else c_kwh * factor))
        key_km2 = sum(p["km2_key"] for p in c_sites)
        row.update({
            "miningTWh": round(sp["h_gwh"] / 1000.0, 9) if sp else 0.0,
            "litFactor": round(sp["lit"], 6) if sp else 1.0,
            "mineKm2Country": sp["denom"] if sp else 0.0,
            "mineKm2Area": round(key_km2, 3),
            "miningGWhArea": round(sp["h_gwh"] * key_km2 / sp["denom"], 6) if sp else 0.0,
            "mineSource": sp["source"] if sp else None,
        })
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

    # L5: each mine site part to the nearest substation of any type
    mine_kwh = np.zeros(len(substations))
    assigned = [[] for _ in substations]
    if sites:
        ax, ay = fwd.transform(np.array([s["lon"] for s in substations], float),
                               np.array([s["lat"] for s in substations], float))
        alloc = dlg.allocate_mines(sites, (ax, ay), {c: v["h_gwh"] for c, v in split.items()},
                                   {c: v["denom"] for c, v in split.items()}, far_km,
                                   voltages=[s.get("voltage_kv") for s in substations])
        warnings.extend(alloc["warnings"])
        mine_kwh = alloc["gwh"] * 1e6
        for a in alloc["assignments"]:
            assigned[a["sub"]].append((sites[a["site"]], a["gwh"]))
    pos = {id(s): i for i, s in enumerate(substations)}
    seed_pos = [pos[id(s)] for s in seeds]
    seed_set = set(seed_pos)
    mine_only = [i for i in range(len(substations)) if i not in seed_set and mine_kwh[i] > 0]

    weights = np.concatenate([per_seed + mine_kwh[seed_pos], mine_kwh[mine_only]])
    calibrated_gwh = float(weights.sum()) / 1e6
    total = float(override_gwh) if override_gwh is not None else calibrated_gwh
    scale = total / calibrated_gwh if calibrated_gwh > 0 else 0.0

    cells = dc.voronoi_cells(sx, sy, area_xy)
    if weights.sum() == 0:
        weights = np.concatenate([[c.area for c in cells], np.zeros(len(mine_only))])
        warnings.append({"code": "AREA_SHARES",
                         "message": "No raster consumption to split the total; shares follow cell area instead."})
    shares = weights / weights.sum() if weights.sum() > 0 else np.zeros(len(weights))

    features, mine_features, by_pos = [], [], {}
    for k, i in enumerate(seed_pos + mine_only):
        sub = substations[i]
        is_seed = k < len(seeds)
        cell = cells[k] if is_seed else None
        mix, coverage = {}, 0.0
        if is_seed:
            mix, coverage = dm.cell_mix(dict(zip(dl.LANDUSE_CLASSES, class_kwh[k])), float(per_seed[k]), global_mix,
                                        family=family, industrial=sub.get("substation") == "industrial")
        gwh = float(shares[k]) * total
        mining = float(mine_kwh[i]) / 1e6 * scale
        lit = max(gwh - mining, 0.0)
        mines_xy = shapely.union_all([p["geometry"] for p, _ in assigned[i]]) if assigned[i] else None
        if mines_xy is None:
            km2 = cell.area / 1e6
        else:   # L5: energy-weighted lit mix + the industrial code for the mine part
            blend = {c: v / 100.0 * lit for c, v in mix.items()}
            code = dm.INDUSTRIAL_CODE[family]
            blend[code] = blend.get(code, 0) + mining
            mix = dm.round_mix(blend)
            km2 = (shapely.union(cell, mines_xy) if is_seed else mines_xy).area / 1e6
        rec = _record(sub, True, gwh, shares[k], km2, mix, coverage, mining,
                      [{"name": p["name"], "km2": round(p["km2"], 3), "gwh": round(e * scale, 6)}
                       for p, e in assigned[i]])
        by_pos[i] = rec
        if is_seed:
            features.append(dc.cell_feature(cell, inv, _feature_props(rec, gwh - mining, cell.area / 1e6, "lit")))
        if mines_xy is not None:   # L6: the mine part is its own feature
            mine_features.append((i, dc.cell_feature(mines_xy, inv,
                                                     _feature_props(rec, mining, mines_xy.area / 1e6, "mine"))))
    out = [by_pos[i] for i in seed_pos]
    out.extend(by_pos[i] if i in by_pos else _record(s, False, 0.0, 0.0, 0.0)
               for i, s in enumerate(substations) if i not in seed_set)
    features.extend(f for _, f in sorted(mine_features, key=lambda t: t[0]))

    mining_gwh = float(mine_kwh.sum()) / 1e6 * scale
    chain = {
        "rasterYear": RASTER_YEAR, "countries": countries, "calibratedGWh": round(calibrated_gwh, 6),
        "overrideGWh": override_gwh, "totalGWh": round(total, 6),
        "miningGWh": round(mining_gwh, 6), "litGWh": round(total - mining_gwh, 6),
    }
    return {"substations": out, "cells": {"type": "FeatureCollection", "features": features},
            "chain": chain, "totalGWh": total, "warnings": warnings}

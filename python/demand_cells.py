"""
demand_cells.py — substation service areas (decision D5).

Work happens in an azimuthal-equidistant plane centred on the study area, in
metres. There, "nearest seed" and "inside the seed's Voronoi cell" are the same
thing, so pixel assignment (nearest_seed) and the drawn cells (voronoi_cells)
always agree.
"""
import numpy as np
import shapely
from pyproj import CRS, Transformer
from shapely import voronoi_polygons
from shapely.geometry import MultiPoint, Polygon, mapping
from shapely.ops import unary_union


def local_projection(lon0, lat0):
    """(forward, inverse) transformers WGS84 <-> AEQD metres centred on (lon0, lat0)."""
    crs = CRS.from_proj4(f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +datum=WGS84 +units=m +no_defs")
    fwd = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    inv = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    return fwd, inv


def nearest_seed(px, py, sx, sy):
    """(index, distance_m) of the nearest seed for each point. Ties go to the lower index."""
    tree = shapely.STRtree(shapely.points(np.asarray(sx, float), np.asarray(sy, float)))
    (pi, si), d = tree.query_nearest(shapely.points(np.asarray(px, float), np.asarray(py, float)),
                                     all_matches=True, return_distance=True)
    order = np.lexsort((si, pi))                      # per point, lowest seed index first
    pi, si, d = pi[order], si[order], d[order]
    first = np.r_[True, pi[1:] != pi[:-1]]
    return si[first].astype(np.int64), d[first]


def _polygonal(geom):
    if geom.geom_type == "GeometryCollection":
        return unary_union([g for g in geom.geoms if g.area > 0])
    return geom


def voronoi_cells(sx, sy, area_xy):
    """One cell per seed, clipped to area_xy. A seed sharing another's location gets an empty cell."""
    xy = np.c_[np.asarray(sx, float), np.asarray(sy, float)]
    _, first = np.unique(xy, axis=0, return_index=True)
    first = np.sort(first)
    cells = np.array([Polygon()] * len(xy), dtype=object)
    if len(first) == 1:
        cells[first[0]] = area_xy
        return list(cells)
    regions = np.asarray(voronoi_polygons(MultiPoint(xy[first]), extend_to=area_xy, ordered=True).geoms)
    shapely.prepare(area_xy)
    # Interior regions are already their cell; clip the area to each edge region's bbox before the
    # overlay, so it does not node the whole (possibly huge) boundary once per cell.
    edge = ~shapely.contains_properly(area_xy, regions)
    local = [shapely.clip_by_rect(area_xy, *b) for b in shapely.bounds(regions[edge])]
    regions[edge] = shapely.intersection(regions[edge], local)
    cells[first] = [_polygonal(c) for c in regions]
    return list(cells)


def _round_coords(obj, ndigits):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(v, ndigits) for v in obj]
        return [_round_coords(o, ndigits) for o in obj]
    return obj


def cell_feature(cell_xy, inv, props, tol_m=100.0, ndigits=5):
    """GeoJSON Feature (WGS84, simplified, rounded) for a projected cell."""
    if cell_xy.is_empty:
        return {"type": "Feature", "geometry": None, "properties": props}
    geom = shapely.transform(cell_xy.simplify(tol_m, preserve_topology=True), inv.transform, interleaved=False)
    gj = mapping(geom)
    return {
        "type": "Feature",
        "geometry": {"type": gj["type"], "coordinates": _round_coords(gj["coordinates"], ndigits)},
        "properties": props,
    }

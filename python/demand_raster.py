"""
demand_raster.py — read gridded electricity-consumption pixels for an area.

Source raster: Chen & Gao (2022) global 1 km EC grid (ESRI:54009 World
Mollweide, one GeoTIFF per year); EPSG:4326 rasters work too. The WGS84 area is
projected into the raster CRS and a pixel belongs to it when its CENTRE is
inside (decision D5), so every pixel is counted at most once.
"""
import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.transform import xy
from rasterio.windows import Window
from shapely import contains_xy
from shapely.geometry import mapping

# Multiplier from the raster's stored unit to kWh. The dataset documents kWh;
# scripts/check_ec_raster.py confirms it against national totals.
EC_UNIT_TO_KWH = 1.0
_SEGMENT_DEG = 0.05   # densify edges before projecting: straight in lon/lat is curved in Mollweide


def _part_pixels(src, part):
    """(rows, cols, values) of positive pixels whose centre is strictly inside one polygon part (raster CRS)."""
    minx, miny, maxx, maxy = part.bounds
    inv = ~src.transform
    c0, r0 = inv * (minx, maxy)
    c1, r1 = inv * (maxx, miny)
    col0, row0 = max(int(np.floor(min(c0, c1))), 0), max(int(np.floor(min(r0, r1))), 0)
    col1, row1 = min(int(np.ceil(max(c0, c1))), src.width), min(int(np.ceil(max(r0, r1))), src.height)
    if col1 <= col0 or row1 <= row0:
        return np.zeros(0, int), np.zeros(0, int), np.zeros(0)
    win = Window(col0, row0, col1 - col0, row1 - row0)
    data = src.read(1, window=win).astype("float64")
    if src.nodata is not None:
        data[data == src.nodata] = 0.0
    data[~np.isfinite(data) | (data < 0)] = 0.0
    transform = src.window_transform(win)
    inside = geometry_mask([mapping(part)], out_shape=data.shape, transform=transform, invert=True)
    rows, cols = np.nonzero(inside & (data > 0))
    x, y = xy(transform, rows, cols, offset="center")
    # GDAL rasterisation also takes centres lying exactly on the boundary; keep strict interior only.
    keep = contains_xy(part, np.asarray(x, float), np.asarray(y, float))
    return rows[keep] + row0, cols[keep] + col0, data[rows, cols][keep]


def read_area_pixels(tif_path, area):
    """(lon, lat, kwh) arrays for pixels with positive value whose centre lies in `area` (WGS84)."""
    with rasterio.open(tif_path) as src:
        if src.crs is None:
            raise ValueError("EC raster has no CRS")
        geographic = src.crs.to_epsg() == 4326
        if geographic:
            area_r = area
        else:
            fwd = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
            area_r = shapely.transform(shapely.segmentize(area, _SEGMENT_DEG), fwd.transform, interleaved=False)
        # One window per part: parts at ±180 or far apart (Chile + Easter Island) must not span the globe.
        found = [_part_pixels(src, p) for p in shapely.get_parts(area_r)]
        rows = np.concatenate([f[0] for f in found])
        cols = np.concatenate([f[1] for f in found])
        vals = np.concatenate([f[2] for f in found])
        _, first = np.unique(rows.astype(np.int64) * src.width + cols, return_index=True)
        rows, cols, vals = rows[first], cols[first], vals[first]
        x, y = xy(src.transform, rows, cols, offset="center")
        x, y = np.asarray(x, float), np.asarray(y, float)
        if geographic or len(x) == 0:
            lon, lat = x, y
        else:
            lon, lat = Transformer.from_crs(src.crs, "EPSG:4326", always_xy=True).transform(x, y)
    return np.asarray(lon, float), np.asarray(lat, float), vals * EC_UNIT_TO_KWH

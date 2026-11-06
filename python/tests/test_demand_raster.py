"""Tests for demand_raster — EC pixels (centre inside polygon) for an area."""
import sys
from pathlib import Path

import numpy as np
import pytest

rasterio = pytest.importorskip("rasterio")
pytest.importorskip("shapely")
from rasterio.transform import from_origin  # noqa: E402
from shapely import contains_xy  # noqa: E402
from shapely.geometry import MultiPolygon, Polygon, box  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_raster as dr  # noqa: E402


def write_tif(path, data, west, north, res, crs="EPSG:4326", nodata=-1.0):
    with rasterio.open(
        path, "w", driver="GTiff", height=data.shape[0], width=data.shape[1], count=1,
        dtype="float32", crs=crs, transform=from_origin(west, north, res, res), nodata=nodata,
    ) as dst:
        dst.write(data.astype("float32"), 1)
    return path


def test_box_sum_and_centres(tmp_path):
    tif = write_tif(tmp_path / "ec.tif", np.full((10, 10), 5.0), west=0.0, north=10.0, res=1.0)
    lon, lat, kwh = dr.read_area_pixels(tif, box(2, 2, 5, 5))
    assert len(kwh) == 9                       # centres 2.5, 3.5, 4.5 in each axis
    assert kwh.sum() == pytest.approx(45.0)
    assert sorted(set(np.round(lon, 3))) == [2.5, 3.5, 4.5]
    assert sorted(set(np.round(lat, 3))) == [2.5, 3.5, 4.5]


def test_polygon_uses_pixel_centres(tmp_path):
    tif = write_tif(tmp_path / "ec.tif", np.ones((10, 10)), west=0.0, north=10.0, res=1.0)
    tri = Polygon([(0, 0), (10, 0), (0, 10)])   # centres with x+y < 10 → 45 pixels
    _, _, kwh = dr.read_area_pixels(tif, tri)
    assert len(kwh) == 45


def test_nodata_and_negative_dropped(tmp_path):
    data = np.ones((4, 4))
    data[0, 0] = -1.0          # nodata
    data[1, 1] = -7.0          # negative → 0 → dropped
    data[2, 2] = np.nan
    tif = write_tif(tmp_path / "ec.tif", data, west=0.0, north=4.0, res=1.0)
    _, _, kwh = dr.read_area_pixels(tif, box(0, 0, 4, 4))
    assert len(kwh) == 13
    assert kwh.sum() == pytest.approx(13.0)


def test_area_partly_outside_raster(tmp_path):
    tif = write_tif(tmp_path / "ec.tif", np.ones((4, 4)), west=0.0, north=4.0, res=1.0)
    _, _, kwh = dr.read_area_pixels(tif, box(-3, -3, 2, 2))
    assert kwh.sum() == pytest.approx(4.0)


MOLLWEIDE = "ESRI:54009"


def mollweide_tif(tmp_path, nodata=-3.4028230607370965e+38):
    """20×20 km of 1 km pixels around (10°E, 50°N), value 2 kWh; one nodata pixel."""
    from pyproj import Transformer
    x0, y0 = Transformer.from_crs("EPSG:4326", MOLLWEIDE, always_xy=True).transform(10.0, 50.0)
    data = np.full((20, 20), 2.0)
    data[0, 0] = nodata
    west, north = np.floor(x0 / 1000) * 1000 - 10_000, np.floor(y0 / 1000) * 1000 + 10_000
    return write_tif(tmp_path / "moll.tif", data, west=west, north=north, res=1000.0, crs=MOLLWEIDE, nodata=nodata)


def test_projected_raster_sum_and_wgs84_centres(tmp_path):
    tif = mollweide_tif(tmp_path)
    area = box(9.95, 49.97, 10.05, 50.03)          # ~7 × 6.7 km, well inside the 20 km fixture
    lon, lat, kwh = dr.read_area_pixels(tif, area)
    assert 30 < len(kwh) < 60
    assert kwh.sum() == pytest.approx(2.0 * len(kwh))
    assert contains_xy(area, lon, lat).all()


def test_projected_raster_drops_huge_negative_nodata(tmp_path):
    tif = mollweide_tif(tmp_path)
    _, _, kwh = dr.read_area_pixels(tif, box(9.0, 49.0, 11.0, 51.0))   # covers the whole fixture
    assert len(kwh) == 399 and kwh.sum() == pytest.approx(798.0)


def test_parts_across_antimeridian_read_separately(tmp_path):
    data = np.ones((360, 720))                      # global 0.5° grid
    tif = write_tif(tmp_path / "world.tif", data, west=-180.0, north=90.0, res=0.5)
    area = MultiPolygon([box(179.0, -1.0, 180.0, 1.0), box(-180.0, -1.0, -179.0, 1.0)])
    lon, lat, kwh = dr.read_area_pixels(tif, area)
    assert len(kwh) == 16 and kwh.sum() == pytest.approx(16.0)
    assert sorted(set(np.round(np.abs(lon), 2))) == [179.25, 179.75]


def test_overlapping_part_windows_not_double_counted(tmp_path):
    tif = write_tif(tmp_path / "ec.tif", np.ones((10, 10)), west=0.0, north=10.0, res=1.0)
    # an L and a box nested in its bounding box: the windows overlap, the parts do not
    l_shape = Polygon([(0, 0), (6, 0), (6, 2), (2, 2), (2, 6), (0, 6)])
    area = MultiPolygon([l_shape, box(3, 3, 6, 6)])
    _, _, kwh = dr.read_area_pixels(tif, area)
    assert kwh.sum() == pytest.approx(20.0 + 9.0)


def test_geometry_to_raster_crs_accepts_sequence():
    from pyproj import CRS
    crs = CRS("ESRI:54009")
    geoms = [box(-71, -34, -70, -33), Polygon([(10, 50), (11, 50), (10, 51)])]
    many = dr.geometry_to_raster_crs(crs, geoms)
    assert len(many) == 2
    for g, m in zip(geoms, many):
        assert m.equals_exact(dr.geometry_to_raster_crs(crs, g), 1e-6)
    assert dr.geometry_to_raster_crs(crs, []).tolist() == []
    assert list(dr.geometry_to_raster_crs(CRS("EPSG:4326"), geoms)) == geoms

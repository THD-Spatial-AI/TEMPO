"""renewables_atlas — country lookup, download/extract, PNG render (no network)."""
import io
import json
import sys
import threading
import time
import zipfile
from pathlib import Path

import numpy as np
import pytest

rasterio = pytest.importorskip("rasterio")
pytest.importorskip("pycountry")
from rasterio.transform import from_origin  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent.parent))
import renewables_atlas as ra  # noqa: E402


def tif_bytes(value=1500.0, nodata=-9999.0):
    data = np.full((40, 40), value, dtype="float32")
    data[:5, :5] = nodata
    with rasterio.io.MemoryFile() as mem:
        with mem.open(driver="GTiff", height=40, width=40, count=1, dtype="float32", crs="EPSG:4326",
                      transform=from_origin(-72.0, -30.0, 0.1, 0.1), nodata=nodata) as dst:
            dst.write(data, 1)
        return mem.read()


class Resp:
    def __init__(self, status=200, body=b"", js=None, headers=None):
        self.status_code, self._body, self._js, self.headers = status, body, js, headers or {}

    def json(self):
        return self._js

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def iter_content(self, chunk_size):
        for i in range(0, len(self._body), chunk_size):
            yield self._body[i:i + chunk_size]


def test_iso3_lookup():
    assert ra.iso3("Chile") == "CHL"
    assert ra.iso3("Bolivia") == "BOL"
    assert ra.iso3("Nowhere-land") is None


def test_ensure_wind_downloads_once(tmp_path):
    body = tif_bytes(7.0)
    calls, progress = [], []

    def http_get(url, **kw):
        calls.append(url)
        return Resp(body=body, headers={"content-length": str(len(body))})

    p = ra.ensure("wind100", "Chile", tmp_path, http_get=http_get, on_progress=lambda d, t: progress.append((d, t)))
    assert p.exists() and "CHL" in calls[0]
    assert progress[-1] == (len(body), len(body))
    ra.ensure("wind100", "Chile", tmp_path, http_get=http_get)
    assert len(calls) == 1
    assert not list(tmp_path.rglob("*.part"))


def test_ensure_solar_extracts_pvout_and_ghi(tmp_path):
    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w") as z:
        root = "Chile_GISdata_LTAy_YearlyMonthlyTotals_GlobalSolarAtlas-v2_GEOTIFF"
        z.writestr(f"{root}/PVOUT.tif", tif_bytes(1800.0))
        z.writestr(f"{root}/GHI.tif", tif_bytes(2200.0))
        z.writestr(f"{root}/monthly/PVOUT_01.tif", tif_bytes(150.0))
    listing = [{"name": "Chile_GISdata_LTAym_YearlyMonthlyTotals_GlobalSolarAtlas-v2_GEOTIFF.zip", "size": 1},
               {"name": "Chile_GHI_poster-map_800x1200mm-300dpi_v20191017.tif", "size": 1}]

    def http_get(url, **kw):
        if url.endswith("/download/Chile"):
            return Resp(js=listing)
        return Resp(body=zbuf.getvalue(), headers={"content-length": str(len(zbuf.getvalue()))})

    p = ra.ensure("pvout", "Chile", tmp_path, http_get=http_get)
    assert p.name.endswith("pvout.tif") and p.exists()
    assert ra.layer_path("ghi", "Chile", tmp_path).exists()      # same zip -> both extracted
    assert not list(tmp_path.rglob("*.zip"))


def test_render_png_and_bounds(tmp_path):
    path = ra.layer_path("pvout", "Chile", tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(tif_bytes(1500.0))
    png, bounds = ra.render("pvout", "Chile", tmp_path, south=-40.0, west=-75.0, north=-25.0, east=-60.0, width=200)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert bounds == pytest.approx((-72.0, -34.0, -68.0, -30.0))   # clipped to the raster (w, s, e, n)


def test_render_errors(tmp_path):
    with pytest.raises(FileNotFoundError):
        ra.render("pvout", "Chile", tmp_path, south=-40, west=-75, north=-25, east=-60, width=200)
    path = ra.layer_path("pvout", "Chile", tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(tif_bytes())
    with pytest.raises(ValueError, match="outside"):
        ra.render("pvout", "Chile", tmp_path, south=10, west=10, north=20, east=20, width=200)


def test_colormap_transparent_nodata():
    rgba = ra.colorize(np.array([[np.nan, 700.0, 2300.0]]), "pvout")
    assert rgba.shape == (1, 3, 4) and rgba[0, 0, 3] == 0 and rgba[0, 1, 3] > 0 and rgba[0, 2, 3] > 0
    assert not np.array_equal(rgba[0, 1, :3], rgba[0, 2, :3])


def test_every_gsa_country_resolves_to_iso3():
    names = json.loads((Path(__file__).parent / "fixtures" / "gsa_countries.json").read_text(encoding="utf-8"))
    assert len(names) > 190
    assert [n for n in names if ra.iso3(n) is None] == []
    assert ra.iso3("Republic of Korea") == "KOR" and ra.iso3("Democratic Peoples Republic of Korea") == "PRK"
    assert ra.iso3("Democratic Republic of the Congo") == "COD" and ra.iso3("Turkey") == "TUR"


def test_layer_path_rejects_empty_or_dots_names(tmp_path):
    for bad in ("", "..", "..."):
        with pytest.raises(ValueError):
            ra.layer_path("pvout", bad, tmp_path)
    assert ra.layer_path("pvout", "../x", tmp_path).parent.parent == tmp_path / "atlas"


def _solar_zip():
    zbuf = io.BytesIO()
    root = "Chile_GISdata_LTAy_YearlyMonthlyTotals_GlobalSolarAtlas-v2_GEOTIFF"
    with zipfile.ZipFile(zbuf, "w") as z:
        z.writestr(f"{root}/PVOUT.tif", tif_bytes(1800.0))
        z.writestr(f"{root}/GHI.tif", tif_bytes(2200.0))
    return zbuf.getvalue()


def test_concurrent_ensure_downloads_once(tmp_path):
    body = _solar_zip()
    listing = [{"name": "Chile_GISdata_LTAym_YearlyMonthlyTotals_GlobalSolarAtlas-v2_GEOTIFF.zip", "size": 1}]
    zip_calls = []

    def http_get(url, **kw):
        if url.endswith("/download/Chile"):
            return Resp(js=listing)
        zip_calls.append(url)
        time.sleep(0.2)                                  # force the two threads to overlap
        return Resp(body=body, headers={"content-length": str(len(body))})

    errors = []

    def go(layer):
        try:
            ra.ensure(layer, "Chile", tmp_path, http_get=http_get)
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=go, args=(lay,)) for lay in ("pvout", "ghi")]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors and len(zip_calls) == 1
    assert ra.layer_path("pvout", "Chile", tmp_path).exists() and ra.layer_path("ghi", "Chile", tmp_path).exists()
    assert not list(tmp_path.rglob("*.part")) and not list(tmp_path.rglob("*.zip"))


def test_stream_failure_leaves_no_part_and_zero_total_without_length(tmp_path):
    class Boom(Resp):
        def iter_content(self, chunk_size):
            yield b"abc"
            raise RuntimeError("connection reset")

    with pytest.raises(RuntimeError, match="connection reset"):
        ra.ensure("wind100", "Chile", tmp_path, http_get=lambda url, **kw: Boom())
    assert not list(tmp_path.rglob("*.part")) and not ra.layer_path("wind100", "Chile", tmp_path).exists()

    progress = []
    body = tif_bytes(7.0)
    ra.ensure("wind100", "Chile", tmp_path, http_get=lambda url, **kw: Resp(body=body),
              on_progress=lambda d, t: progress.append((d, t)))
    assert progress[-1] == (len(body), 0)


def test_render_caps_height_and_keeps_aspect(tmp_path):
    data = np.full((4000, 400), 1500.0, dtype="float32")
    with rasterio.io.MemoryFile() as mem:
        with mem.open(driver="GTiff", height=4000, width=400, count=1, dtype="float32", crs="EPSG:4326",
                      transform=from_origin(-72.0, -10.0, 0.01, 0.01), nodata=-9999.0) as dst:
            dst.write(data, 1)
        raw = mem.read()
    path = ra.layer_path("pvout", "Chile", tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    png, _ = ra.render("pvout", "Chile", tmp_path, south=-60, west=-80, north=0, east=-60, width=1024)
    with rasterio.io.MemoryFile(png) as mem, mem.open() as img:
        assert img.height == 1024 and img.width == pytest.approx(1024 * 400 / 4000, abs=1)

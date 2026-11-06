"""Tests for demand_data — range-extract one year from the nested Figshare zip."""
import io
import sys
import zipfile
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_data as dd  # noqa: E402


def tiny_geotiff():
    rasterio = pytest.importorskip("rasterio")
    from rasterio.io import MemoryFile
    from rasterio.transform import from_origin
    with MemoryFile() as mem:
        with mem.open(driver="GTiff", height=8, width=8, count=1, dtype="float32", crs="ESRI:54009",
                      transform=from_origin(0, 8000, 1000, 1000), nodata=-1) as dst:
            dst.write(np.arange(64, dtype="float32").reshape(8, 8), 1)
        return mem.read()


def nested_archive(outer_compression=zipfile.ZIP_STORED, tif=b"FAKE-TIF-2019"):
    inner = io.BytesIO()
    with zipfile.ZipFile(inner, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("EC2019.tif", tif)
    outer = io.BytesIO()
    with zipfile.ZipFile(outer, "w", outer_compression) as z:
        z.writestr("updated electricity consumption/2018.zip", b"not-this-one")
        z.writestr("updated electricity consumption/2019.zip", inner.getvalue())
    return outer.getvalue()


class CountingSource(dd.BytesRange):
    def __init__(self, data):
        super().__init__(data)
        self.calls = 0

    def fetch(self, start, end):
        self.calls += 1
        return super().fetch(start, end)


def member_range(archive):
    """[start, end) of the 2019 year zip's bytes inside the outer archive."""
    info = zipfile.ZipFile(io.BytesIO(archive)).getinfo("updated electricity consumption/2019.zip")
    start = dd._member_data_offset(dd.BytesRange(archive), info)
    return start, start + info.compress_size


class FaultySource(dd.BytesRange):
    """Misbehaves on fetches starting inside [lo, hi): 'fail' always raises, 'flaky' raises on the
    first attempt of each range, 'short' returns one byte too few."""

    def __init__(self, data, lo, hi, mode):
        super().__init__(data)
        self.lo, self.hi, self.mode, self.seen = lo, hi, mode, set()

    def fetch(self, start, end):
        if self.lo <= start < self.hi:
            if self.mode == "fail" or (self.mode == "flaky" and (start, end) not in self.seen):
                self.seen.add((start, end))
                raise IOError("connection reset")
            if self.mode == "short":
                return super().fetch(start, end - 1)
        return super().fetch(start, end)


@pytest.fixture
def small_chunks(monkeypatch):
    monkeypatch.setattr(dd, "_CHUNK", 64)
    monkeypatch.setattr(dd, "_RETRY_WAIT", 0.0)


def test_extracts_requested_year_as_compressed_geotiff(tmp_path):
    rasterio = pytest.importorskip("rasterio")
    progress = []
    path = dd.ensure_ec_raster(2019, tmp_path, src=dd.BytesRange(nested_archive(tif=tiny_geotiff())),
                               progress=lambda done, total: progress.append((done, total)))
    assert path == tmp_path / "EC2019.tif"
    with rasterio.open(path) as src:
        assert src.read(1).tolist() == np.arange(64, dtype="float32").reshape(8, 8).tolist()
        assert src.compression.name == "deflate" and src.profile["tiled"]
        assert src.crs.to_string() == "ESRI:54009" and src.nodata == -1
    assert progress and progress[-1][0] == progress[-1][1]
    meta = (tmp_path / "EC2019.json").read_text()
    assert "CC BY 4.0" in meta and "10.6084/m9.figshare.17004523" in meta
    assert sorted(p.name for p in tmp_path.iterdir()) == ["EC2019.json", "EC2019.tif"]


def test_flaky_chunks_are_retried(tmp_path, small_chunks):
    pytest.importorskip("rasterio")
    archive = nested_archive(tif=tiny_geotiff())
    src = FaultySource(archive, *member_range(archive), mode="flaky")
    assert dd.ensure_ec_raster(2019, tmp_path, src=src).exists()
    assert len(src.seen) > 1                     # several chunks, each failed once


@pytest.mark.parametrize("mode,match", [("fail", "connection reset"), ("short", "short read")])
def test_failed_download_leaves_no_partial_files(tmp_path, small_chunks, mode, match):
    archive = nested_archive()
    with pytest.raises(IOError, match=match):
        dd.ensure_ec_raster(2019, tmp_path, src=FaultySource(archive, *member_range(archive), mode=mode))
    assert list(tmp_path.iterdir()) == []


def test_unreadable_inner_raster_leaves_no_partial_files(tmp_path):
    pytest.importorskip("rasterio")
    with pytest.raises(Exception):
        dd.ensure_ec_raster(2019, tmp_path, src=dd.BytesRange(nested_archive()))   # fake tif bytes
    assert list(tmp_path.iterdir()) == []


def test_cached_year_is_not_downloaded_again(tmp_path):
    (tmp_path / "EC2019.tif").write_bytes(b"cached")
    src = CountingSource(nested_archive())
    assert dd.ensure_ec_raster(2019, tmp_path, src=src) == tmp_path / "EC2019.tif"
    assert src.calls == 0


@pytest.mark.parametrize("content_range", ["bytes 0-0/*", None])
def test_http_size_unknown_raises(monkeypatch, content_range):
    class Resp:
        status = 206
        headers = {"Content-Range": content_range} if content_range else {}

        def read(self):
            return b"P"

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(dd.urllib.request, "urlopen", lambda req, timeout: Resp())
    with pytest.raises(IOError, match="size"):
        dd.HttpRange("http://example.invalid/x").size()


def test_missing_year_raises(tmp_path):
    with pytest.raises(IOError, match="2005"):
        dd.ensure_ec_raster(2005, tmp_path, src=dd.BytesRange(nested_archive()))


def test_compressed_nested_archive_rejected(tmp_path):
    with pytest.raises(IOError, match="compressed"):
        dd.ensure_ec_raster(2019, tmp_path, src=dd.BytesRange(nested_archive(zipfile.ZIP_DEFLATED)))


@pytest.mark.parametrize("year", [1991, 2020])
def test_year_out_of_range(tmp_path, year):
    with pytest.raises(ValueError):
        dd.ensure_ec_raster(year, tmp_path, src=dd.BytesRange(nested_archive()))


@pytest.mark.parametrize("model_year,expected", [(1980, 1992), (2010, 2010), (2019, 2019), (2035, 2019)])
def test_raster_year_for(model_year, expected):
    assert dd.raster_year_for(model_year) == expected

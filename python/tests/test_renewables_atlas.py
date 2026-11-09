"""renewables_atlas — countries in view, remote paths, stitched view PNG, handle LRU + lock (no network)."""
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

DATA = Path(__file__).parent.parent / "data"


@pytest.fixture(autouse=True)
def fresh_caches():
    def reset():
        for ds in ra._handles.values():
            ds.close()
        ra._handles.clear()
        ra._gsa_iso3.clear()
        ra._gsa_member.cache_clear()
    reset()
    yield
    reset()


def write_tif(path, value, west, north, res=0.1, shape=(40, 40), nodata=-9999.0, holes=None):
    data = np.full(shape, value, dtype="float32")
    if holes is not None:
        data[holes] = nodata
    with rasterio.open(path, "w", driver="GTiff", height=shape[0], width=shape[1], count=1, dtype="float32",
                       crs="EPSG:4326", transform=from_origin(west, north, res, res), nodata=nodata) as dst:
        dst.write(data, 1)
    return str(path)


def local(monkeypatch, paths, names=None):
    """Point dataset_path at local files {ISO3: path}; a missing ISO3 raises like a missing GSA entry."""
    def dataset_path(layer, code):
        if code not in paths:
            raise LookupError(f"no Global Solar Atlas entry for {code}")
        return paths[code]
    monkeypatch.setattr(ra, "dataset_path", dataset_path)
    monkeypatch.setattr(ra, "countries_in_view", lambda *a, **k: list(paths) + list(names or []))
    monkeypatch.setattr(ra, "country_name", lambda code: {"AAA": "Alpha", "BBB": "Beta"}.get(code, code))


def png_rgba(png):
    with rasterio.io.MemoryFile(png) as mem, mem.open() as img:
        return np.moveaxis(img.read(), 0, -1)


def test_iso3_lookup():
    assert ra.iso3("Chile") == "CHL"
    assert ra.iso3("Bolivia") == "BOL"
    assert ra.iso3("Nowhere-land") is None


def test_colormap_transparent_nodata():
    rgba = ra.colorize(np.array([[np.nan, 700.0, 2300.0]]), "pvout")
    assert rgba.shape == (1, 3, 4) and rgba[0, 0, 3] == 0 and rgba[0, 1, 3] > 0 and rgba[0, 2, 3] > 0
    assert not np.array_equal(rgba[0, 1, :3], rgba[0, 2, :3])


def test_ghi_layer_is_gone():
    assert set(ra.LAYERS) == {"pvout", "wind100"}


def test_every_gsa_country_resolves_to_iso3_with_a_bbox():
    names = json.loads((DATA / "gsa_countries.json").read_text(encoding="utf-8"))
    assert len(names) > 190
    assert [n for n in names if ra.iso3(n) is None] == []
    boxes = ra.country_bboxes()
    assert [n for n in names if ra.iso3(n) not in boxes] == []
    assert ra.iso3("Republic of Korea") == "KOR" and ra.iso3("Democratic Peoples Republic of Korea") == "PRK"
    assert ra.iso3("Democratic Republic of the Congo") == "COD" and ra.iso3("Turkey") == "TUR"


def _covers(parts, lon, lat):
    return any(w <= lon <= e and s <= lat <= n for w, s, e, n in parts)


def test_chile_bboxes_include_mainland_and_islands():
    parts = ra.country_bboxes()["CHL"]
    assert _covers(parts, -70.65, -33.45)           # Santiago
    assert _covers(parts, -109.35, -27.12)          # Easter Island
    assert _covers(parts, -78.85, -33.63)           # Juan Fernández (Robinson Crusoe)


def test_countries_in_view_picks_chile_and_argentina_ranked_by_area():
    picked = ra.countries_in_view(south=-36, west=-74, north=-30, east=-64)
    assert picked[:2] == ["ARG", "CHL"]              # Argentina covers more of this view
    assert ra.countries_in_view(south=-36, west=-75, north=-30, east=-72.5)[0] == "CHL"   # coast, west of ARG's bbox
    assert ra.countries_in_view(south=-35, west=-72.5, north=-32, east=-69.5) == ["CHL", "ARG"]   # not Brazil
    assert len(ra.countries_in_view(south=35, west=-10, north=60, east=30)) == 6
    assert ra.countries_in_view(south=-50, west=-140, north=-45, east=-130) == []   # open Pacific


def test_country_name_uses_gsa_list_and_falls_back_to_bundled(monkeypatch):
    monkeypatch.setattr(ra, "countries", lambda *a, **k: ["Chile", "Argentina"])
    assert ra.country_name("CHL") == "Chile" and ra.country_name("DEU") == "DEU"
    ra._gsa_iso3.clear()

    def down(*a, **k):
        raise OSError("network down")
    monkeypatch.setattr(ra, "countries", down)
    assert ra.country_name("DEU") == "Germany" and ra.gsa_name("DEU") == "Germany"
    assert ra.gsa_name("ATA") is None


def test_dataset_path_wind_is_vsicurl():
    assert ra.dataset_path("wind100", "CHL") == \
        "/vsicurl/https://globalwindatlas.info/api/gis/country/CHL/wind-speed/100"


def test_dataset_path_solar_reads_root_from_zip_central_directory(monkeypatch):
    root = "Chile_GISdata_LTAy_YearlyMonthlyTotals_GlobalSolarAtlas-v2_GEOTIFF"
    zname = "Chile_GISdata_LTAym_YearlyMonthlyTotals_GlobalSolarAtlas-v2_GEOTIFF.zip"
    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w") as z:
        z.writestr(f"{root}/padding.bin", np.random.default_rng(0).bytes(400_000))   # local headers out of the tail
        z.writestr(f"{root}/monthly/PVOUT.tif", b"monthly")
        z.writestr(f"{root}/PVOUT.tif", b"yearly")
    body = zbuf.getvalue()
    calls = []

    class Resp:
        def __init__(self, content=b""):
            self.content = content

        def raise_for_status(self):
            pass

    def http_get(url, headers=None, **kw):
        calls.append((url, headers))
        n = int(headers["Range"].split("=-")[1])
        return Resp(content=body[-n:])

    monkeypatch.setattr(ra, "_get", lambda h: http_get)
    monkeypatch.setattr(ra, "countries", lambda *a, **k: ["Chile"])
    zip_url = f"{ra.GSA_API}/Chile/{zname}"
    assert ra.dataset_path("pvout", "CHL") == f"/vsizip//vsicurl/{zip_url}/{root}/PVOUT.tif"
    assert calls == [(zip_url, {"Range": f"bytes=-{ra.ZIP_TAIL}"})]
    ra.dataset_path("pvout", "CHL")
    assert len(calls) == 1                              # member root cached
    with pytest.raises(LookupError):
        ra.dataset_path("pvout", "DEU")                 # not in the GSA list


def test_render_view_stitches_two_countries(tmp_path, monkeypatch):
    local(monkeypatch, {"AAA": write_tif(tmp_path / "a.tif", 1000.0, -72.0, -30.0),
                        "BBB": write_tif(tmp_path / "b.tif", 2000.0, -68.0, -30.0)})
    png, bounds, used, skipped = ra.render_view("pvout", south=-34, west=-72, north=-30, east=-64, width=80)
    assert bounds == (-72, -34, -64, -30) and used == ["Alpha", "Beta"] and skipped == []
    img = png_rgba(png)
    assert img.shape == (40, 80, 4)
    assert np.array_equal(img[20, 10], ra.colorize(np.array([1000.0]), "pvout")[0])
    assert np.array_equal(img[20, 70], ra.colorize(np.array([2000.0]), "pvout")[0])
    assert (img[..., 3] > 0).all()


def test_first_country_with_data_wins_and_holes_fall_through(tmp_path, monkeypatch):
    holes = (slice(0, 40), slice(0, 20))               # western half of AAA is nodata
    local(monkeypatch, {"AAA": write_tif(tmp_path / "a.tif", 1000.0, -72.0, -30.0, holes=holes),
                        "BBB": write_tif(tmp_path / "b.tif", 2000.0, -72.0, -30.0)})
    png, _, used, _ = ra.render_view("pvout", south=-34, west=-72, north=-30, east=-68, width=40)
    img = png_rgba(png)
    assert np.array_equal(img[20, 5], ra.colorize(np.array([2000.0]), "pvout")[0])
    assert np.array_equal(img[20, 35], ra.colorize(np.array([1000.0]), "pvout")[0])
    assert used == ["Alpha", "Beta"]


def test_view_outside_rasters_is_empty_and_failures_are_skipped(tmp_path, monkeypatch):
    local(monkeypatch, {"AAA": write_tif(tmp_path / "a.tif", 1000.0, -72.0, -30.0),
                        "BBB": str(tmp_path / "missing.tif")}, names=["CCC"])
    png, _, used, skipped = ra.render_view("pvout", south=10, west=10, north=20, east=20, width=100)
    assert png is None and used == [] and skipped == ["Beta", "CCC"]
    png, _, used, skipped = ra.render_view("wind100", south=-34, west=-72, north=-30, east=-68, width=50)
    assert png is not None and used == ["Alpha"] and skipped == ["Beta", "CCC"]


def test_render_view_clips_latitude_and_caps_height(tmp_path, monkeypatch):
    local(monkeypatch, {"AAA": write_tif(tmp_path / "a.tif", 7.0, -10.0, 90.0, res=1.0, shape=(180, 20))})
    png, bounds, _, _ = ra.render_view("wind100", south=-89, west=-10, north=89, east=10, width=1024)
    assert bounds == (-10, -85.0, 10, 85.0)
    img = png_rgba(png)
    assert img.shape[0] == ra.MAX_WIDTH and img.shape[1] == pytest.approx(1024 * 20 / 170, abs=1)


def test_countries_in_one_view_are_read_in_parallel_and_stitched_in_rank_order(monkeypatch):
    monkeypatch.setattr(ra, "countries_in_view", lambda *a, **k: ["AAA", "BBB"])
    monkeypatch.setattr(ra, "country_name", lambda code: code)
    delay = {"AAA": 0.4, "BBB": 0.2}                   # the first-ranked country finishes last

    def slow_read(layer, code, shape, *bounds):
        time.sleep(delay[code])
        return 0, 0, np.full(shape, 1000.0 if code == "AAA" else 2000.0)

    monkeypatch.setattr(ra, "_read_country", slow_read)
    t = time.perf_counter()
    png, _, used, skipped = ra.render_view("pvout", south=-34, west=-72, north=-30, east=-68, width=40)
    elapsed = time.perf_counter() - t
    assert elapsed < 0.55                               # ~max(0.4, 0.2), not the 0.6 s sum
    assert used == ["AAA"] and skipped == []            # AAA ranked first covers every pixel
    assert np.array_equal(png_rgba(png)[5, 5], ra.colorize(np.array([1000.0]), "pvout")[0])


def test_fill_thin_gaps_fills_a_3px_seam_with_the_mean_of_both_sides():
    a = np.full((6, 12), 4.0)
    a[:, 6:] = 8.0
    a[:, 5:8] = np.nan                                  # 3-px vertical stripe between two halves
    ra.fill_thin_gaps(a)
    assert np.isfinite(a).all() and np.allclose(a[:, 5:8], 6.0)


def test_fill_thin_gaps_keeps_outer_edges_and_wide_gaps_transparent():
    edge = np.full((6, 12), 5.0)
    edge[:, 9:] = np.nan                                # data on one side only (coast / outer edge)
    ra.fill_thin_gaps(edge)
    assert np.isnan(edge[:, 9:]).all()
    wide = np.full((6, 30), 5.0)
    wide[:, 10:20] = np.nan                             # 10-px gap
    ra.fill_thin_gaps(wide)
    assert np.isnan(wide[:, 10:20]).all() and np.isfinite(wide[:, :10]).all()


def test_render_view_closes_a_seam_between_two_countries(tmp_path, monkeypatch):
    holes = (slice(0, 40), slice(38, 40))               # AAA stops 2 px short of BBB
    local(monkeypatch, {"AAA": write_tif(tmp_path / "a.tif", 1000.0, -72.0, -30.0, holes=holes),
                        "BBB": write_tif(tmp_path / "b.tif", 2000.0, -68.0, -30.0)})
    png, _, _, _ = ra.render_view("pvout", south=-34, west=-72, north=-30, east=-64, width=80)
    assert (png_rgba(png)[..., 3] > 0).all()


def test_handle_lru_reuses_and_closes_oldest(tmp_path, monkeypatch):
    paths = {c: write_tif(tmp_path / f"{c}.tif", 1.0, -72.0, -30.0) for c in ("AAA", "BBB", "CCC")}
    local(monkeypatch, paths)
    monkeypatch.setattr(ra, "MAX_HANDLES", 2)
    opened = []
    real_open = rasterio.open
    monkeypatch.setattr(rasterio, "open", lambda p: opened.append(p) or real_open(p))
    first = ra._with_dataset("pvout", "AAA", lambda ds: ds)
    ra._with_dataset("pvout", "AAA", lambda ds: None)
    assert len(opened) == 1
    ra._with_dataset("pvout", "BBB", lambda ds: None)
    ra._with_dataset("pvout", "CCC", lambda ds: None)
    assert list(ra._handles) == [("pvout", "BBB"), ("pvout", "CCC")] and first.closed


def test_reads_on_one_key_are_serialised(tmp_path, monkeypatch):
    local(monkeypatch, {c: write_tif(tmp_path / f"{c}.tif", 1.0, -72.0, -30.0) for c in ("AAA", "BBB")})
    active, peak, guard = {"AAA": 0, "BBB": 0, "all": 0}, {"AAA": 0, "all": 0}, threading.Lock()

    def slow(code):
        def fn(ds):
            with guard:
                active[code] += 1
                active["all"] += 1
                peak["AAA"] = max(peak["AAA"], active["AAA"])
                peak["all"] = max(peak["all"], active["all"])
            time.sleep(0.05)
            with guard:
                active[code] -= 1
                active["all"] -= 1
        return fn

    threads = [threading.Thread(target=ra._with_dataset, args=("pvout", c, slow(c))) for c in ["AAA"] * 4 + ["BBB"] * 4]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert peak["AAA"] == 1 and peak["all"] == 2

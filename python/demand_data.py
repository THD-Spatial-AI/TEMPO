"""
demand_data.py — fetch one year of the Chen & Gao (2022) EC raster and cache it.

The Figshare file is a 3 GB zip of per-year zips stored WITHOUT compression, so
one year (~91 MB) is a contiguous byte range: read the outer central directory
with HTTP Range requests, then stream only that member. Its GeoTIFF is 2.25 GB
uncompressed, so it is re-written from the zip (GDAL /vsizip/) as a tiled
DEFLATE GeoTIFF, cached as <cache_dir>/EC<year>.tif with an EC<year>.json
attribution sidecar.
"""
import http.client
import io
import json
import os
import struct
import time
import urllib.request
import zipfile
from pathlib import Path

FIGSHARE_EC_URL = "https://ndownloader.figshare.com/files/31456843"
EC_FIRST_YEAR, EC_LAST_YEAR = 1992, 2019
EC_SOURCE = {
    "dataset": "Global 1 km x 1 km gridded revised real GDP and electricity consumption 1992-2019",
    "authors": "Chen, J., Gao, M. et al. (2022), Scientific Data",
    "doi": "10.6084/m9.figshare.17004523",
    "paper_doi": "10.1038/s41597-022-01322-5",
    "licence": "CC BY 4.0",
    "url": FIGSHARE_EC_URL,
}
_CHUNK = 8 * 1024 * 1024
_RETRIES = 3
_RETRY_WAIT = 1.0   # seconds, doubled per attempt
_GTIFF = dict(driver="GTiff", tiled=True, blockxsize=512, blockysize=512, compress="DEFLATE",
              predictor=3, zlevel=6, BIGTIFF="IF_SAFER", NUM_THREADS="ALL_CPUS")


class HttpRange:
    """Byte-range source over HTTP (server must answer 206)."""

    def __init__(self, url, timeout=60):
        self.url = url
        self.timeout = timeout
        self._size = None

    def fetch(self, start, end):
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={start}-{end}", "User-Agent": "TEMPO-demand"})
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            if resp.status != 206:
                raise IOError(f"server ignored the range request (HTTP {resp.status})")
            if self._size is None:
                total = resp.headers.get("Content-Range", "").rsplit("/", 1)[-1]
                if total.isdigit():
                    self._size = int(total)
            return resp.read()

    def size(self):
        if self._size is None:
            self.fetch(0, 0)
        if self._size is None:
            raise IOError("server did not report the archive size (Content-Range total missing)")
        return self._size


class BytesRange:
    """In-memory byte-range source (tests)."""

    def __init__(self, data):
        self.data = data

    def fetch(self, start, end):
        return self.data[start:end + 1]

    def size(self):
        return len(self.data)


class _RangeFile(io.RawIOBase):
    def __init__(self, src):
        self.src = src
        self.pos = 0
        self.n = src.size()

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.n + offset
        return self.pos

    def readinto(self, buf):
        if self.pos >= self.n:
            return 0
        data = self.src.fetch(self.pos, min(self.pos + len(buf), self.n) - 1)
        buf[:len(data)] = data
        self.pos += len(data)
        return len(data)


def raster_year_for(model_year):
    """EC raster year to use for a model year (clamped to the dataset span)."""
    return min(max(int(model_year), EC_FIRST_YEAR), EC_LAST_YEAR)


def _member_data_offset(src, info):
    hdr = src.fetch(info.header_offset, info.header_offset + 29)
    if hdr[:4] != b"PK\x03\x04":
        raise IOError("unexpected zip local header")
    name_len, extra_len = struct.unpack("<HH", hdr[26:30])
    return info.header_offset + 30 + name_len + extra_len


def ensure_ec_raster(year, cache_dir, src=None, progress=None):
    """Path to EC<year>.tif in cache_dir, downloading it on first use."""
    year = int(year)
    if not EC_FIRST_YEAR <= year <= EC_LAST_YEAR:
        raise ValueError(f"EC raster covers {EC_FIRST_YEAR}-{EC_LAST_YEAR}, got {year}")
    cache_dir = Path(cache_dir)
    out = cache_dir / f"EC{year}.tif"
    if out.exists():
        return out
    cache_dir.mkdir(parents=True, exist_ok=True)
    src = src or HttpRange(FIGSHARE_EC_URL)

    outer = zipfile.ZipFile(io.BufferedReader(_RangeFile(src), buffer_size=1 << 20))
    info = next((i for i in outer.infolist() if i.filename.split("/")[-1] == f"{year}.zip"), None)
    if info is None:
        raise IOError(f"year {year} not found in the EC archive")
    if info.compress_type != zipfile.ZIP_STORED:
        raise IOError("nested year archive is compressed; cannot range-extract it")

    start = _member_data_offset(src, info)
    part = cache_dir / f"EC{year}.part.zip"     # .zip suffix so GDAL's /vsizip/ recognises it
    tmp = cache_dir / f"EC{year}.tif.part"
    try:
        _download(src, start, info.compress_size, part, progress)
        with zipfile.ZipFile(part) as inner:
            tif = next((n for n in inner.namelist() if n.lower().endswith(".tif")), None)
        if tif is None:
            raise IOError(f"no GeoTIFF inside {info.filename}")
        import rasterio.shutil   # lazy: the rest of this module needs no GDAL
        rasterio.shutil.copy(f"/vsizip/{part.as_posix()}/{tif}", str(tmp), **_GTIFF)
        os.replace(tmp, out)
    finally:
        part.unlink(missing_ok=True)
        tmp.unlink(missing_ok=True)
    (cache_dir / f"EC{year}.json").write_text(json.dumps(
        {**EC_SOURCE, "year": year, "downloaded": time.strftime("%Y-%m-%dT%H:%M:%S")}, indent=2))
    return out


def _fetch_exact(src, start, end):
    """Bytes start..end inclusive, retrying transient failures and short reads."""
    for attempt in range(_RETRIES):
        try:
            data = src.fetch(start, end)
            if len(data) != end - start + 1:
                raise IOError(f"short read: {len(data)} of {end - start + 1} bytes at {start}")
            return data
        except (IOError, http.client.HTTPException):
            if attempt == _RETRIES - 1:
                raise
            time.sleep(_RETRY_WAIT * 2 ** attempt)


def _download(src, start, total, path, progress):
    with open(path, "wb") as fh:
        done = 0
        while done < total:
            end = min(done + _CHUNK, total) - 1
            fh.write(_fetch_exact(src, start + done, start + end))
            done = end + 1
            if progress:
                progress(done, total)


# ── Mine footprints (Inc 7, Maus fallback countries) ──────────────────────────
MAUS_GPKG_URL = "https://download.pangaea.de/dataset/942325/files/global_mining_polygons_v2.gpkg"
MAUS_SOURCE = {
    "dataset": "Global-scale mining polygons (Version 2)",
    "authors": "Maus, V. et al. (2022), Scientific Data 9, 433",
    "doi": "10.1594/PANGAEA.942325",
    "paper_doi": "10.1038/s41597-022-01547-4",
    "licence": "CC BY-SA 4.0",
    "url": MAUS_GPKG_URL,
}


def _gpkg_wkb(blob):
    """WKB inside a GeoPackage geometry blob (magic 'GP', version, flags, srs_id, envelope)."""
    if blob[:2] != b"GP":
        raise ValueError("not a GeoPackage geometry blob")
    env = (0, 32, 48, 48, 64)[(blob[3] >> 1) & 7]
    return blob[8 + env:]


def maus_to_footprints(gpkg_path, out_path, iso3_to_iso2, tol_m=50.0):
    """Convert the Maus GeoPackage to a GeoJSON-seq footprint file; returns the feature count.

    Stdlib sqlite3 reads the GPKG (no GDAL). Each polygon is simplified to ~tol_m,
    rounded to 1e-5 deg and written as one Feature per line with id, bbox and
    properties {iso2, km2} (geodesic km2 of the written geometry). Unknown ISO3
    codes are written as-is.
    """
    import sqlite3
    import shapely
    from pyproj import Geod

    geod = Geod(ellps="WGS84")
    tol = tol_m / 111_320.0
    out_path = Path(out_path)
    tmp = out_path.with_name(out_path.name + ".part")
    n = 0
    con = sqlite3.connect(f"file:{Path(gpkg_path).as_posix()}?mode=ro", uri=True)
    try:
        rows = con.execute("SELECT fid, geom, ISO3_CODE FROM mining_polygons ORDER BY fid")
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            for fid, blob, iso3 in rows:
                g = shapely.from_wkb(_gpkg_wkb(blob))
                if not g.is_valid:
                    g = shapely.make_valid(g)
                    g = shapely.union_all([p for p in getattr(g, "geoms", [g]) if p.geom_type.endswith("Polygon")])
                s = shapely.set_precision(g.simplify(tol, preserve_topology=True), 1e-5)
                if s.is_empty:
                    s = shapely.set_precision(g, 1e-5)
                if s.is_empty:
                    continue
                km2 = abs(geod.geometry_area_perimeter(s)[0]) / 1e6
                feat = {"type": "Feature", "id": fid, "bbox": [round(v, 5) for v in s.bounds],
                        "properties": {"iso2": iso3_to_iso2.get(iso3, iso3), "km2": round(km2, 4)},
                        "geometry": json.loads(shapely.to_geojson(s))}
                f.write(json.dumps(feat, separators=(",", ":")) + "\n")
                n += 1
        os.replace(tmp, out_path)
    finally:
        con.close()
        tmp.unlink(missing_ok=True)
    return n


MINE_FOOTPRINTS = "mine_footprints_maus_v2.geojsonl"


def ensure_mine_footprints(cache_dir, src=None, progress=None, iso3_to_iso2=None):
    """Path to the compact Maus footprint file (GeoJSON-seq) in cache_dir, building it on first use:
    the GPKG is downloaded in retried byte ranges, converted with maus_to_footprints (ISO3 -> ISO2
    from python/data/mine_area_by_country.csv) and deleted; a .json attribution sidecar is written."""
    cache_dir = Path(cache_dir)
    out = cache_dir / MINE_FOOTPRINTS
    if out.exists():
        return out
    cache_dir.mkdir(parents=True, exist_ok=True)
    src = src or HttpRange(MAUS_GPKG_URL)
    if iso3_to_iso2 is None:
        import demand_large   # lazy: the raster path needs none of it
        iso3_to_iso2 = {row["iso3"]: iso2 for iso2, row in demand_large.load_mine_area().items()}
    part = cache_dir / "global_mining_polygons_v2.gpkg.part"
    try:
        _download(src, 0, src.size(), part, progress)
        n = maus_to_footprints(part, out, iso3_to_iso2)
    finally:
        part.unlink(missing_ok=True)
    out.with_suffix(".json").write_text(json.dumps(
        {**MAUS_SOURCE, "features": n, "downloaded": time.strftime("%Y-%m-%dT%H:%M:%S")}, indent=2))
    return out

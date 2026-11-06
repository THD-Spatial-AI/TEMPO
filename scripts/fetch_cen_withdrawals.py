"""
Build python/data/validation/cen_withdrawals_<year>.csv: annual energy withdrawals
(retiros) per SEN barra from the Coordinador Eléctrico Nacional (CEN) monthly
physical energy balance ("Balance Físico", REVISION_{NORTE,SUR}[_DX]_YYMM.xls inside
"01 Resultados" of the definitive "Antecedentes de cálculo para las Transferencias
Económicas"), with substation coordinates from CEN Infotécnica.

Dev-only. Needs `xlrd` (reads the legacy .xls). The monthly "01 Resultados" zips are
~170 MB each, so only the four small balance workbooks are pulled out of each zip with
HTTP range requests (~1.5 MB per month).

    python scripts/fetch_cen_withdrawals.py --year 2024 --raw-dir <cache dir>
    python scripts/fetch_cen_withdrawals.py --year 2024 --raw-dir <dir> --offline   # parse only

Regenerate, don't hand-edit the CSV.
"""
import argparse
import csv
import io
import json
import math
import re
import sys
import time
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from difflib import get_close_matches
from pathlib import Path

import xlrd

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"
BASE = ("https://www.coordinador.cl/mercados/documentos/transferencias-economicas/"
        "antecedentes-de-calculo-para-las-transferencias-economicas/")
INFOTECNICA = "https://api-infotecnica.coordinador.cl/v1"
OUT_DIR = Path(__file__).resolve().parent.parent / "python" / "data" / "validation"
MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
          "septiembre", "octubre", "noviembre", "diciembre"]
# Meter types (sheet "Consideraciones"): R = regulated client in distribution,
# L = free client on transmission, L_D = free client in distribution, L_S = substation SSAA.
REGULATED, FREE = {"R"}, {"L", "L_D"}
COL_ID, COL_NAME, COL_TYPE = 1, 2, 15
COL_ENERGY = 12  # "Medida 3": the measure after substitution and bar balancing, kWh


def http_get(url, rng=None, referer=BASE, timeout=120):
    headers = {"User-Agent": UA, "Referer": referer}
    if rng:
        headers["Range"] = "bytes=%d-%d" % rng
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read(), resp.headers


class RangeFile(io.RawIOBase):
    """Seekable read-only view of a remote file via HTTP Range (CEN serves 206)."""

    def __init__(self, url):
        self.url, self.pos = url, 0
        _, h = http_get(url, (0, 0))
        self.size = int(h["Content-Range"].split("/")[-1])

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def read(self, n=-1):
        if n < 0:
            n = self.size - self.pos
        if n == 0 or self.pos >= self.size:
            return b""
        data, _ = http_get(self.url, (self.pos, min(self.pos + n, self.size) - 1))
        self.pos += len(data)
        return data

    def readinto(self, b):
        data = self.read(len(b))
        b[:len(data)] = data
        return len(data)


def month_pages(year):
    """{month index: definitive month page URL}. Uses the first definitive publication
    of each month (not the later RxxD re-liquidations)."""
    pages, html_all = {}, ""
    for suffix in ("", "page/2/", "page/3/"):
        try:
            html_all += http_get(f"{BASE}{year}-antecedentes-de-calculo-para-las-transferencias-economicas/{suffix}")[0].decode("utf-8", "replace")
        except Exception:
            break
    for url in set(re.findall(r'href="([^"]+)"', html_all)):
        m = re.search(r"/(%s)-definitivo[^/]*/?$" % "|".join(MONTHS), url)
        if m and f"{year}-antecedentes" in url:
            pages.setdefault(MONTHS.index(m.group(1)) + 1, url)
    return pages


def fetch_month(page_url, yymm, raw_dir):
    """Extract the four REVISION_*{NORTE,SUR}*.xls workbooks (names drift: RES_ from 2024-05,
    TFE_ / _YYMM_DX from 2024-11) from the month's '01-Resultados' zip(s) into raw_dir/yymm."""
    dest = raw_dir / yymm
    dest.mkdir(parents=True, exist_ok=True)
    html = http_get(page_url)[0].decode("utf-8", "replace")
    zips = sorted(set(u for u in re.findall(r'href="([^"]+\.zip)"', html) if "Resultados" in u))
    got = []
    for zurl in zips:
        zf = zipfile.ZipFile(RangeFile(zurl))
        for info in zf.infolist():
            name = info.filename.rsplit("/", 1)[-1]
            if re.fullmatch(r"REVISION_\w*(NORTE|SUR)\w*\.xls", name, re.I):
                with zf.open(info) as src, open(dest / name, "wb") as dst:
                    dst.write(src.read())
                got.append(name)
        if got:
            if len(got) != 4:
                print(f"WARNING: {yymm}: expected 4 balance workbooks, got {got}", file=sys.stderr)
            return zurl, got
    raise RuntimeError(f"no REVISION_*.xls in {zips} ({page_url})")


def parse_balance(path):
    """Yield (barra_id, barra_name, meter_type, kWh) for withdrawal meters."""
    sh = xlrd.open_workbook(str(path), on_demand=True).sheet_by_name("Balance por Barra")
    bid = bname = None
    for r in range(7, sh.nrows):
        row = sh.row_values(r)
        if row[COL_ID] != "" and row[COL_NAME] != "":
            bid, bname = str(int(float(row[COL_ID]))), str(row[COL_NAME]).strip()
            continue
        t = str(row[COL_TYPE]).strip()
        if bid and t in REGULATED | FREE | {"L_S"}:
            try:
                yield bid, bname, t, float(row[COL_ENERGY])
            except (TypeError, ValueError):
                pass


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().upper()
    s = re.sub(r"^S/E\s+", "", s)
    s = re.sub(r"\(.*?\)", " ", s)  # owner suffix, e.g. "POLPAICO (TRANSELEC)"
    return re.sub(r"[^A-Z0-9]+", " ", s).strip()


def barra_base(name):
    """'CD.ARICA______013' -> ('CD ARICA', 13)."""
    m = re.match(r"^(.*?)_*(\d{3})$", name)
    if not m:
        return norm(name), None
    return norm(m.group(1)), int(m.group(2))


def load_substations(raw_dir, offline):
    cache = raw_dir / "infotecnica_subestaciones.json"
    if cache.exists() or offline:
        return json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else []
    subs, url = [], f"{INFOTECNICA}/subestaciones/?page=1"
    while url:
        page = json.loads(http_get(url, referer="https://infotecnica.coordinador.cl/")[0])
        subs += page["results"]
        url = page.get("next")
    cache.write_text(json.dumps(subs, ensure_ascii=False), encoding="utf-8")
    return subs


def substation_coords(sid, raw_dir, cache, offline):
    key = str(sid)
    if key not in cache and not offline:
        d = json.loads(http_get(f"{INFOTECNICA}/subestaciones/extended/{sid}/",
                                referer="https://infotecnica.coordinador.cl/")[0])
        cache[key] = [d.get("latitud"), d.get("longitud"), d.get("region_nombre")]
        time.sleep(0.1)
    return cache.get(key, [None, None, None])


MAX_SPREAD_KM = 20


def km(p, q):
    """Equirectangular distance, adequate for a same-name ambiguity check."""
    dy = (p[0] - q[0]) * 111.2
    dx = (p[1] - q[1]) * 111.2 * math.cos(math.radians((p[0] + q[0]) / 2))
    return math.hypot(dx, dy)


def match_substation(base, subs_by_norm):
    """Balance names are truncated to 14 chars and abbreviated ('N.CARDONES', 'S.GORDA',
    'A_DE_CORDOVA', 'CD.ARICA', 'ESPERANZA_SNG'). Exact -> unique pattern -> fuzzy."""
    base = re.sub(r"^CD ", "", re.sub(r" SNG$", "", base))
    if base in subs_by_norm:
        return subs_by_norm[base]
    toks = base.split()
    pat = [re.escape(t) + r"\w*( DEL?)?" if len(t) == 1 else re.escape(t) for t in toks]
    pat[-1] += r"\w*"  # truncated last word
    rx = re.compile(r"((CENTRAL|EL|LA|LOS|LAS|NUEVA) )?" + " ".join(pat) + r"( \w+)?")
    hits = [k for k in subs_by_norm if rx.fullmatch(k)]
    if len(hits) == 1 or (hits and len(base) >= 8):
        return subs_by_norm[min(hits, key=len)]
    close = get_close_matches(base, list(subs_by_norm), n=1, cutoff=0.88)
    return subs_by_norm[close[0]] if close else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--year", type=int, default=2024)
    ap.add_argument("--raw-dir", type=Path, required=True, help="cache dir for downloaded CEN files")
    ap.add_argument("--offline", action="store_true", help="parse files already in --raw-dir")
    args = ap.parse_args()
    raw = args.raw_dir
    raw.mkdir(parents=True, exist_ok=True)
    yy = args.year % 100

    sources = {}
    src_cache = raw / f"sources_{args.year}.json"
    if src_cache.exists():
        sources = json.loads(src_cache.read_text(encoding="utf-8"))
    if not args.offline:
        pages = month_pages(args.year)
        missing = [m for m in range(1, 13) if m not in pages]
        if missing:
            print(f"WARNING: no definitive page for months {missing}", file=sys.stderr)
        for m, page in sorted(pages.items()):
            yymm = f"{yy:02d}{m:02d}"
            if len(list((raw / yymm).glob("REVISION_*.xls"))) == 4:
                continue
            zurl, files = fetch_month(page, yymm, raw)
            sources[yymm] = zurl
            print(f"{yymm}: {files} <- {zurl}")
            src_cache.write_text(json.dumps(sources, indent=1), encoding="utf-8")

    agg = defaultdict(lambda: {"R": 0.0, "FREE": 0.0, "L_S": 0.0})
    names, months = {}, set()
    for f in sorted(raw.glob(f"{yy:02d}[01][0-9]/REVISION_*.xls")):
        months.add(f.parent.name)
        for bid, bname, t, kwh in parse_balance(f):
            names[bid] = bname
            agg[bid]["R" if t in REGULATED else "FREE" if t in FREE else "L_S"] -= kwh  # withdrawals are negative
    if len(months) != 12:
        print(f"WARNING: {len(months)} months parsed: {sorted(months)}", file=sys.stderr)

    subs = load_substations(raw, args.offline)
    subs_by_norm = {}
    for s in subs:
        subs_by_norm.setdefault(norm(s["nombre"]), []).append(s)
    coord_cache_path = raw / "infotecnica_coords.json"
    coord_cache = json.loads(coord_cache_path.read_text(encoding="utf-8")) if coord_cache_path.exists() else {}

    year_page = f"{BASE}{args.year}-antecedentes-de-calculo-para-las-transferencias-economicas/"
    rows = []
    for bid, a in agg.items():
        reg, free = a["R"] / 1e6, a["FREE"] / 1e6
        if abs(reg) + abs(free) < 1e-6:
            continue
        base, kv = barra_base(names[bid])
        cands = match_substation(base, subs_by_norm) or []
        pts = [(c, substation_coords(c["id"], raw, coord_cache, args.offline)[:2]) for c in cands]
        pts = [(c, p) for c, p in pts if None not in p]
        sub, lat, lon, note = None, None, None, ""
        if pts:
            spread = max(km(p, q) for _, p in pts for _, q in pts)
            if spread <= MAX_SPREAD_KM:
                sub, (lat, lon) = pts[0]
            else:  # same name, different places (e.g. SAN JOAQUIN Santiago vs La Serena)
                note = "ambiguous: " + " | ".join(c["nombre"] for c, _ in pts)
        rows.append({
            "barra": names[bid], "barra_id": bid, "kv": kv if kv is not None else "",
            "annual_gwh": round(reg + free, 4), "regulated_gwh": round(reg, 4), "free_gwh": round(free, 4),
            "ssaa_gwh": round(a["L_S"] / 1e6, 4),
            "lat": round(lat, 6) if lat is not None else "", "lon": round(lon, 6) if lon is not None else "",
            "infotecnica_subestacion": sub["nombre"] if sub else note,
            "source_url": year_page,
        })
    coord_cache_path.write_text(json.dumps(coord_cache), encoding="utf-8")
    rows.sort(key=lambda r: -r["annual_gwh"])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"cen_withdrawals_{args.year}.csv"
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    tot = sum(r["annual_gwh"] for r in rows)
    ncoord = sum(1 for r in rows if r["lat"] != "")
    print(f"wrote {out}: {len(rows)} barras, {len(months)} months, total {tot:,.0f} GWh "
          f"(regulated {sum(r['regulated_gwh'] for r in rows):,.0f}, free {sum(r['free_gwh'] for r in rows):,.0f}, "
          f"SSAA {sum(r['ssaa_gwh'] for r in rows):,.1f}); coords {ncoord}/{len(rows)} barras, "
          f"{sum(r['annual_gwh'] for r in rows if r['lat'] != '') / tot:.1%} of energy")


if __name__ == "__main__":
    main()

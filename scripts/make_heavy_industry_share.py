"""
Regenerate python/data/heavy_industry_share.csv from the UN Energy Statistics
Database (UNSD, via UNdata, d=EDATA; free to copy and redistribute with UNdata
cited as the reference). Dev-only: needs `pycountry` for country name -> ISO2.
Regenerate, don't hand-edit the CSV.

    python scripts/make_heavy_industry_share.py

h = heavy / final electricity consumption (UNSD transaction 12), per country, for
the latest year (>= FIRST_YEAR) that has a final-consumption value and at least
one industry sub-sector value. A sub-sector the country does not report counts as 0.
UNdata's bulk download handler is gone, so the paged HTML table is read (50 rows/page).
"""
import csv
import html
import re
import time
import urllib.request
from pathlib import Path

import pycountry

OUT = Path(__file__).resolve().parent.parent / "python" / "data" / "heavy_industry_share.csv"
FIRST_YEAR = 2015
YEARS = range(FIRST_YEAR, 2026)
TOTAL = "12"  # Electricity - Final energy consumption
HEAVY = {  # UNSD transaction code -> column
    "1214e": "mining_twh",          # mining and quarrying
    "1214a": "nonferrous_twh",      # non-ferrous metals
    "1211": "iron_steel_twh",       # iron and steel
    "1213": "chemical_twh",         # chemical and petrochemical
    "1214b": "nonmetallic_twh",     # non-metallic minerals
    "1214g": "paper_twh",           # paper, pulp and print
}
INDUSTRY = "121"  # manufacturing, construction and non-fuel industry (context column)
BASE = "https://data.un.org/Data.aspx?d=EDATA&f="
# UNdata names pycountry does not resolve
NAME_FIX = {
    "Bolivia (Plur. State of)": "BO", "China, Hong Kong SAR": "HK", "China, Macao SAR": "MO",
    "Dem. Rep. of the Congo": "CD", "Iran (Islamic Rep. of)": "IR", "Korea, Republic of": "KR",
    "Korea, Dem.Ppl's.Rep.": "KP", "Lao People's Dem. Rep.": "LA", "Micronesia (Fed. States of)": "FM",
    "Rep. of Moldova": "MD", "Venezuela (Bolivar. Rep.)": "VE", "Kosovo": "XK", "Türkiye": "TR",
    "State of Palestine": "PS", "United Rep. of Tanzania": "TZ", "Other Asia": "TW",
    "Côte d'Ivoire": "CI", "Curaçao": "CW", "Bonaire, St Eustatius, Saba": "BQ",
    "Saint Helena and Depend.": "SH", "Wallis and Futuna Is.": "WF", "Falkland Is. (Malvinas)": "FK",
    "Turks and Caicos Islands": "TC", "Commonwealth of Independent States (CIS)": None,
    "Central African Rep.": "CF", "Faeroe Islands": "FO", "Netherlands (Kingd. of the)": "NL",
    "St. Helena and Depend.": "SH", "St. Kitts-Nevis": "KN", "St. Lucia": "LC",
    "St. Pierre-Miquelon": "PM", "St. Vincent-Grenadines": "VC", "United States Virgin Is.": "VI",
}
ROW = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
CELL = re.compile(r"<td[^>]*>(.*?)</td>", re.S)


def iso2(name):
    if name in NAME_FIX:
        return NAME_FIX[name]
    try:
        return pycountry.countries.lookup(name).alpha_2
    except LookupError:
        try:
            return pycountry.countries.search_fuzzy(name)[0].alpha_2
        except LookupError:
            return None


def fetch(codes):
    """[(country, code_label, year, kwh_million)] for all pages of one filter."""
    flt = "cmID:EL;trID:" + ",".join(codes) + ";yr:" + ",".join(map(str, YEARS))
    url = BASE + urllib.request.quote(flt, safe="")
    out, page, pages = [], 1, 1
    while page <= pages:
        raw = urllib.request.urlopen(f"{url}&v={page}", timeout=120).read().decode("utf-8", "replace")
        m = re.search(r'spanPageCountB">(\d+)', raw)
        pages = int(m.group(1)) if m else 0
        for row in ROW.findall(raw):
            cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in CELL.findall(row)]
            if len(cells) >= 5 and cells[3].startswith("Kilowatt-hours"):
                out.append((cells[0], cells[1], int(cells[2]), float(cells[4].replace(",", ""))))
        page += 1
        time.sleep(0.2)
    return out


def main():
    codes = [TOTAL, INDUSTRY, *HEAVY]
    data = {}  # (iso2, year) -> {code: twh}
    unmapped = set()
    for code in codes:  # one code per filter so the transaction label maps unambiguously
        for country, _label, year, gwh in fetch([code]):
            iso = iso2(country)
            if iso is None:
                unmapped.add(country)
                continue
            data.setdefault((iso, year), {})[code] = gwh / 1000.0
    best = {}
    for (iso, year), v in data.items():
        if TOTAL in v and v[TOTAL] > 0 and any(c in v for c in HEAVY):
            if iso not in best or year > best[iso][0]:
                best[iso] = (year, v)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Source: UN Energy Statistics Database (UNSD) via UNdata, electricity final consumption "
                 "by sector (TWh); UNdata terms: free to copy/redistribute citing UNdata. "
                 "Regenerate with scripts/make_heavy_industry_share.py\n")
        w = csv.writer(fh)
        w.writerow(["iso2", "year", "total_twh", "industry_twh", "heavy_twh", "h", *HEAVY.values()])
        for iso in sorted(best):
            year, v = best[iso]
            parts = [v.get(c, 0.0) for c in HEAVY]
            heavy = sum(parts)
            w.writerow([iso, year, round(v[TOTAL], 3), round(v.get(INDUSTRY, 0.0), 3), round(heavy, 3),
                        round(heavy / v[TOTAL], 4), *(round(p, 3) for p in parts)])
    print(f"wrote {len(best)} countries -> {OUT}")
    if unmapped:
        print("unmapped names:", sorted(unmapped))


if __name__ == "__main__":
    main()

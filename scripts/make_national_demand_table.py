"""
Regenerate python/data/national_electricity_demand.csv from Our World in Data's
energy dataset (column `electricity_demand`, TWh; CC BY 4.0). Dev-only: needs
`pycountry` for ISO3 → ISO2. Regenerate, don't hand-edit the CSV.

    python scripts/make_national_demand_table.py
"""
import csv
import io
import urllib.request
from pathlib import Path

import pycountry

URL = "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv"
OUT = Path(__file__).resolve().parent.parent / "python" / "data" / "national_electricity_demand.csv"
FIRST_YEAR = 1992


def main():
    raw = urllib.request.urlopen(URL, timeout=120).read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(raw))
    if "electricity_demand" not in (reader.fieldnames or []):
        raise SystemExit("OWID dataset has no 'electricity_demand' column — check the schema")
    rows = []
    for r in reader:
        iso3, value = r.get("iso_code") or "", r.get("electricity_demand") or ""
        if len(iso3) != 3 or not value or int(r["year"]) < FIRST_YEAR:
            continue
        country = pycountry.countries.get(alpha_3=iso3)
        if country is not None:
            rows.append((country.alpha_2, int(r["year"]), round(float(value), 3)))
    rows.sort()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Source: Our World in Data energy-data, electricity_demand (TWh), CC BY 4.0. "
                 "Regenerate with scripts/make_national_demand_table.py\n")
        writer = csv.writer(fh)
        writer.writerow(["iso2", "year", "twh"])
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()

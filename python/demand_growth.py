"""
demand_growth.py — scale the EC raster year to the latest national-data year.

Decision D4: factor = demand(latest year <= model year) / demand(raster year).
Future years are NOT extrapolated (Scenario Studio's demandGrowth does that).
"""
import csv
from pathlib import Path

DEFAULT_TABLE = Path(__file__).parent / "data" / "national_electricity_demand.csv"


def load_national_table(path=DEFAULT_TABLE):
    """{ISO2: {year: TWh}} from the bundled CSV (lines starting with '#' are comments)."""
    table = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(line for line in fh if not line.startswith("#")):
            table.setdefault(row["iso2"].upper(), {})[int(row["year"])] = float(row["twh"])
    return table


def growth_factor(table, iso2, base_year, target_year):
    """{"factor", "to_year", "note"}; note is set when the factor falls back to 1."""
    if target_year <= base_year:
        return {"factor": 1.0, "to_year": base_year, "note": None}
    series = table.get(str(iso2 or "").upper()) or {}
    if base_year not in series or series[base_year] <= 0:
        return {"factor": 1.0, "to_year": base_year, "note": f"no national demand data for {iso2 or '?'} in {base_year}"}
    newer = [y for y in series if base_year < y <= target_year]
    if not newer:
        return {"factor": 1.0, "to_year": base_year, "note": f"no national demand data for {iso2} after {base_year}"}
    to_year = max(newer)
    return {"factor": series[to_year] / series[base_year], "to_year": to_year, "note": None}

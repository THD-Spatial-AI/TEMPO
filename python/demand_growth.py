"""
demand_growth.py — national electricity demand and EC raster country totals.

Decision D4: the EC raster is only a spatial key. Each country's pixels are
scaled by national demand (latest year <= model year) / raster country total.
Future years are NOT extrapolated (Scenario Studio's demandGrowth does that).
"""
import csv
from pathlib import Path

DEFAULT_TABLE = Path(__file__).parent / "data" / "national_electricity_demand.csv"
DEFAULT_RASTER_TOTALS = Path(__file__).parent / "data" / "ec_country_totals.csv"


def _rows(path):
    """CSV rows of a bundled table (lines starting with '#' are comments)."""
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(line for line in fh if not line.startswith("#")))


def load_national_table(path=DEFAULT_TABLE):
    """{ISO2: {year: TWh}} from the bundled OWID CSV."""
    table = {}
    for row in _rows(path):
        table.setdefault(row["iso2"].upper(), {})[int(row["year"])] = float(row["twh"])
    return table


def load_raster_totals(path=DEFAULT_RASTER_TOTALS):
    """{ISO2: TWh} EC raster sum per country from the bundled CSV."""
    return {row["iso2"].upper(): float(row["twh"]) for row in _rows(path)}


def national_demand(table, iso2, model_year):
    """{"twh", "year", "note"} for the latest year <= model_year; twh None and note set when none."""
    series = table.get(str(iso2 or "").upper()) or {}
    years = [y for y in series if y <= model_year]
    if not years:
        return {"twh": None, "year": None, "note": f"no national demand data for {iso2 or '?'} up to {model_year}"}
    year = max(years)
    return {"twh": series[year], "year": year, "note": None}

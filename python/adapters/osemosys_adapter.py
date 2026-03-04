"""
osemosys_adapter.py
-------------------
Translates OEOTechnology instances (from tech_database.py) into parameter
dictionaries / DataFrames compatible with an OSeMOSYS model definition.

This adapter is *framework-ready*: if OSeMOSYS is added to the application
this module provides the full translation layer. The output format follows
the otoole / OSeMOSYS Community Edition CSV parameter structure.

OSeMOSYS parameter mapping reference
--------------------------------------
OEO field                        → OSeMOSYS parameter
───────────────────────────────────────────────────────────────────────────────
id                               → TECHNOLOGY identifier
capex_usd_per_kw × 1000         → CapitalCost        (M$ / GW)
opex_fixed_usd_per_kw_year × 1000 → FixedCost        (M$ / GW / year)
opex_variable_usd_per_kwh × 1000 → VariableCost      (M$ / PJ output)
electrical_efficiency            → Efficiency (via InputActivityRatio /
                                               OutputActivityRatio)
lifetime_years                   → OperationalLife
energy_cap_max_kw / 1000        → TotalAnnualMaxCapacity (GW)

Notes on unit conversion
------------------------
OSeMOSYS uses:  M$ / GW  for capital & fixed costs,  M$ / PJ  for variable costs.
The OEO API provides: USD / kW  and  USD / kWh.

Conversions applied:
    USD/kW  →  M$/GW:   value × 1 000 / 1 000 000 = value / 1 000
    USD/kWh →  M$/PJ:   value × 1 000 / (3 600 × 1 000) ≈ value × 2.778 × 10⁻4
                         (since 1 PJ = 277 778 MWh = 277 778 000 kWh,
                          1 M$ / PJ = 1 / 277778 $ / kWh  →
                          $ / kWh × 277778 = M$ / PJ)
"""

from __future__ import annotations

import math
from typing import Any, Optional

from python.services.tech_database import OEOTechnology

# Conversion factors
_USD_PER_KW_TO_M_USD_PER_GW = 1.0          # 1 USD/kW = 1 M$/GW (unit coincidence)
_USD_PER_KWH_TO_M_USD_PER_PJ = 277.778     # 1 USD/kWh = 277.778 M$/PJ


def _finite(val: Optional[float]) -> Optional[float]:
    if val is None or math.isinf(val) or math.isnan(val):
        return None
    return val


# ---------------------------------------------------------------------------
# Core translator
# ---------------------------------------------------------------------------

def to_osemosys_params(
    tech: OEOTechnology,
    region: str = "REGION1",
    year: int = 2025,
    mode_of_operation: int = 1,
) -> dict[str, Any]:
    """
    Translate an OEOTechnology into a flat OSeMOSYS parameter dictionary.

    The returned dict contains one entry per OSeMOSYS parameter table,
    keyed by the OSeMOSYS parameter name, with values ready to be written
    into the corresponding CSV column.

    Parameters
    ----------
    tech : OEOTechnology
    region : str
        OSeMOSYS REGION identifier (default ``"REGION1"``).
    year : int
        Model year (used as the default index for time-series parameters).
    mode_of_operation : int
        OSeMOSYS mode of operation index (default ``1``).

    Returns
    -------
    dict
        Example::

            {
                "TECHNOLOGY": "solar_pv",
                "REGION": "REGION1",
                "YEAR": 2025,
                "CapitalCost": 0.941,       # M$/GW
                "FixedCost": 0.01922,       # M$/GW/yr
                "VariableCost": 0.0,        # M$/PJ
                "OperationalLife": 30,
                "InputActivityRatio": None,
                "OutputActivityRatio": 1.0,
                "TotalAnnualMaxCapacity": None,
            }
    """
    p: dict[str, Any] = {
        "TECHNOLOGY": tech.id,
        "REGION": region,
        "YEAR": year,
        "MODE_OF_OPERATION": mode_of_operation,
    }

    # ── CapitalCost (M$ / GW)
    if _finite(tech.capex_usd_per_kw) is not None:
        p["CapitalCost"] = round(
            tech.capex_usd_per_kw * _USD_PER_KW_TO_M_USD_PER_GW / 1000, 6
        )
    else:
        p["CapitalCost"] = None

    # ── FixedCost (M$ / GW / yr)
    if _finite(tech.opex_fixed_usd_per_kw_year) is not None:
        p["FixedCost"] = round(
            tech.opex_fixed_usd_per_kw_year * _USD_PER_KW_TO_M_USD_PER_GW / 1000, 6
        )
    else:
        p["FixedCost"] = None

    # ── VariableCost (M$ / PJ)
    if _finite(tech.opex_variable_usd_per_kwh) is not None:
        p["VariableCost"] = round(
            tech.opex_variable_usd_per_kwh * _USD_PER_KWH_TO_M_USD_PER_PJ, 6
        )
    else:
        p["VariableCost"] = 0.0

    # ── OperationalLife (years)
    p["OperationalLife"] = int(tech.lifetime_years) if tech.lifetime_years else None

    # ── TotalAnnualMaxCapacity (GW)
    if _finite(tech.energy_cap_max_kw) is not None:
        p["TotalAnnualMaxCapacity"] = tech.energy_cap_max_kw / 1_000_000  # kW → GW
    else:
        p["TotalAnnualMaxCapacity"] = None

    # ── Activity ratios
    # For supply/conversion: InputActivityRatio = 1/efficiency, OutputActivityRatio = 1
    eff = _finite(tech.electrical_efficiency or tech.storage_eff)
    if eff and eff > 0:
        p["InputActivityRatio"] = round(1.0 / eff, 6)
        p["OutputActivityRatio"] = 1.0
    else:
        p["InputActivityRatio"] = None
        p["OutputActivityRatio"] = 1.0

    # ── Fuel (carrier) links
    p["InputFuel"] = tech.carrier_in or tech.carrier or None
    p["OutputFuel"] = tech.carrier_out or tech.carrier or "electricity"

    return p


def to_osemosys_params_list(
    techs: list[OEOTechnology],
    region: str = "REGION1",
    year: int = 2025,
) -> list[dict[str, Any]]:
    """
    Translate a list of technologies into a list of OSeMOSYS parameter rows.

    The result can be converted to a ``pandas.DataFrame`` for further
    processing or CSV export.

    Parameters
    ----------
    techs : list[OEOTechnology]
    region : str
    year : int

    Returns
    -------
    list[dict]

    Example
    -------
    ::

        import pandas as pd
        from python.services.tech_database import get_technologies_by_type
        from python.adapters.osemosys_adapter import to_osemosys_params_list

        supply_techs = get_technologies_by_type("supply")
        rows = to_osemosys_params_list(supply_techs, region="DE", year=2030)
        df = pd.DataFrame(rows)
        df.to_csv("CapitalCost.csv", index=False)
    """
    return [to_osemosys_params(tech, region=region, year=year) for tech in techs]


def split_to_otoole_tables(
    rows: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """
    Split a flat list of parameter rows into per-parameter tables as expected
    by the otoole OSeMOSYS toolkit (one CSV per parameter).

    Parameters
    ----------
    rows : list[dict]
        Output of ``to_osemosys_params_list()``.

    Returns
    -------
    dict[str, list[dict]]
        Keys are OSeMOSYS parameter table names
        (``"CapitalCost"``, ``"FixedCost"``, …).
        Values are lists of row dicts ready for ``pd.DataFrame``.
    """
    tables: dict[str, list[dict[str, Any]]] = {
        "CapitalCost": [],
        "FixedCost": [],
        "VariableCost": [],
        "OperationalLife": [],
        "TotalAnnualMaxCapacity": [],
        "InputActivityRatio": [],
        "OutputActivityRatio": [],
    }

    for row in rows:
        tech = row["TECHNOLOGY"]
        region = row["REGION"]
        year = row["YEAR"]
        mode = row.get("MODE_OF_OPERATION", 1)
        base = {"REGION": region, "TECHNOLOGY": tech, "YEAR": year}

        if row.get("CapitalCost") is not None:
            tables["CapitalCost"].append({**base, "VALUE": row["CapitalCost"]})

        if row.get("FixedCost") is not None:
            tables["FixedCost"].append({**base, "VALUE": row["FixedCost"]})

        if row.get("VariableCost") is not None:
            tables["VariableCost"].append(
                {**base, "MODE_OF_OPERATION": mode, "VALUE": row["VariableCost"]}
            )

        if row.get("OperationalLife") is not None:
            tables["OperationalLife"].append(
                {"REGION": region, "TECHNOLOGY": tech, "VALUE": row["OperationalLife"]}
            )

        if row.get("TotalAnnualMaxCapacity") is not None:
            tables["TotalAnnualMaxCapacity"].append(
                {**base, "VALUE": row["TotalAnnualMaxCapacity"]}
            )

        if row.get("InputActivityRatio") is not None:
            tables["InputActivityRatio"].append({
                **base,
                "FUEL": row.get("InputFuel", "electricity"),
                "MODE_OF_OPERATION": mode,
                "VALUE": row["InputActivityRatio"],
            })

        if row.get("OutputActivityRatio") is not None:
            tables["OutputActivityRatio"].append({
                **base,
                "FUEL": row.get("OutputFuel", "electricity"),
                "MODE_OF_OPERATION": mode,
                "VALUE": row["OutputActivityRatio"],
            })

    return tables

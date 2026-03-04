"""
calliope_adapter.py
-------------------
Translates OEOTechnology instances (from tech_database.py) into the nested
dictionary structure expected by Calliope 0.6.x model YAML files.

The output of each function here is compatible with the dict that
``calliope_runner.py::build_techs_config()`` already consumes, so the runner
can either use the static tech data from the UI payload *or* enrich/replace it
with live data from the OEO API.

Calliope field mapping reference
---------------------------------
OEO field                        → Calliope YAML path
───────────────────────────────────────────────────────────────────────────────
tech_type                        → essentials.parent
carrier_out                      → essentials.carrier_out
carrier_in                       → essentials.carrier_in  (conversion_plus)
carrier                          → essentials.carrier      (storage/transmission)
electrical_efficiency            → constraints.energy_eff
storage_eff                      → constraints.energy_eff  (storage)
energy_cap_per_storage_cap       → constraints.energy_cap_per_storage_cap_equals
energy_cap_max_kw                → constraints.energy_cap_max
energy_ramping                   → constraints.energy_ramping
resource_unit                    → constraints.resource_unit
lifetime_years                   → constraints.lifetime
capex_usd_per_kw                 → costs.monetary.energy_cap
capex_usd_per_kwh                → costs.monetary.storage_cap
opex_fixed_usd_per_kw_year       → costs.monetary.om_annual
opex_variable_usd_per_kwh        → costs.monetary.om_prod
capex_per_distance_usd_per_kw_km → costs.monetary.energy_cap_per_distance
interest_rate                    → costs.monetary.interest_rate
"""

from __future__ import annotations

import math
from typing import Any, Optional

from python.services.tech_database import OEOTechnology


# ---------------------------------------------------------------------------
# Parent type mapping
# ---------------------------------------------------------------------------

# Maps the tech_type string (as used in the OEO API and the UI) to the
# Calliope essentials.parent value.
_PARENT_MAP: dict[str, str] = {
    "supply": "supply",
    "supply_plus": "supply_plus",
    "storage": "storage",
    "conversion": "conversion",
    "conversion_plus": "conversion_plus",
    "transmission": "transmission",
    "demand": "demand",
    # common API aliases
    "generator": "supply",
    "renewable": "supply_plus",
    "battery": "storage",
    "link": "transmission",
    "load": "demand",
}


def _parent(tech: OEOTechnology) -> str:
    return _PARENT_MAP.get(tech.tech_type.lower(), "supply")


def _finite(val: Optional[float]) -> Optional[float]:
    """Return val only if it is a finite number, otherwise None."""
    if val is None:
        return None
    if math.isinf(val) or math.isnan(val):
        return None
    return val


# ---------------------------------------------------------------------------
# Core translator
# ---------------------------------------------------------------------------

def to_calliope_tech(tech: OEOTechnology) -> dict[str, Any]:
    """
    Translate a single OEOTechnology into a Calliope tech definition dict.

    The returned dict is keyed ``{tech_id: {essentials: …, constraints: …, costs: …}}``
    and can be merged directly into a Calliope ``techs:`` block.

    Parameters
    ----------
    tech : OEOTechnology

    Returns
    -------
    dict  –  ``{tech.id: {essentials, constraints, costs}}``

    Example
    -------
    ::

        from python.services.tech_database import get_technology
        from python.adapters.calliope_adapter import to_calliope_tech

        oeo_tech = get_technology("solar_pv")
        calliope_block = to_calliope_tech(oeo_tech)
        # → {"solar_pv": {"essentials": {...}, "constraints": {...}, "costs": {...}}}
    """
    parent = _parent(tech)

    # ── essentials ──────────────────────────────────────────────────────────
    essentials: dict[str, Any] = {
        "parent": parent,
        "name": tech.name,
    }
    if tech.color:
        essentials["color"] = tech.color

    if parent in ("storage", "transmission"):
        if tech.carrier:
            essentials["carrier"] = tech.carrier
        elif tech.carrier_out:
            essentials["carrier"] = tech.carrier_out
    elif parent == "conversion_plus":
        if tech.carrier_in:
            essentials["carrier_in"] = tech.carrier_in
        if tech.carrier_out:
            essentials["carrier_out"] = tech.carrier_out
    else:
        if tech.carrier_out:
            essentials["carrier_out"] = tech.carrier_out

    # ── constraints ─────────────────────────────────────────────────────────
    constraints: dict[str, Any] = {}

    if tech.lifetime_years:
        constraints["lifetime"] = int(tech.lifetime_years)

    # Efficiency handling (storage uses a different field name in Calliope)
    eff = _finite(tech.storage_eff or tech.electrical_efficiency)
    if eff is not None:
        constraints["energy_eff"] = eff

    if _finite(tech.energy_cap_max_kw) is not None:
        constraints["energy_cap_max"] = tech.energy_cap_max_kw

    if _finite(tech.energy_ramping) is not None:
        constraints["energy_ramping"] = tech.energy_ramping

    if tech.resource_unit:
        constraints["resource_unit"] = tech.resource_unit
        if tech.resource_unit == "energy_per_cap":
            # supply_plus techs need resource set to inf or a file
            pass

    if parent == "supply":
        constraints.setdefault("resource", float("inf"))
        constraints.setdefault("energy_cap_max", float("inf"))

    if _finite(tech.energy_cap_per_storage_cap) is not None:
        constraints["energy_cap_per_storage_cap_equals"] = tech.energy_cap_per_storage_cap

    # ── costs ────────────────────────────────────────────────────────────────
    monetary: dict[str, Any] = {}

    ir = _finite(tech.interest_rate) or 0.10
    monetary["interest_rate"] = ir

    if _finite(tech.capex_usd_per_kw) is not None:
        monetary["energy_cap"] = tech.capex_usd_per_kw

    if _finite(tech.capex_usd_per_kwh) is not None:
        monetary["storage_cap"] = tech.capex_usd_per_kwh

    if _finite(tech.opex_fixed_usd_per_kw_year) is not None:
        monetary["om_annual"] = tech.opex_fixed_usd_per_kw_year

    if _finite(tech.opex_variable_usd_per_kwh) is not None:
        monetary["om_prod"] = tech.opex_variable_usd_per_kwh

    if _finite(tech.capex_per_distance_usd_per_kw_km) is not None:
        monetary["energy_cap_per_distance"] = tech.capex_per_distance_usd_per_kw_km

    costs = {"monetary": monetary} if monetary else {}

    # ── assemble ─────────────────────────────────────────────────────────────
    definition: dict[str, Any] = {"essentials": essentials}
    if constraints:
        definition["constraints"] = constraints
    if costs:
        definition["costs"] = costs

    return {tech.id: definition}


def to_calliope_techs_block(techs: list[OEOTechnology]) -> dict[str, Any]:
    """
    Translate a list of OEOTechnology objects into a full Calliope ``techs:``
    block suitable for writing to YAML.

    Parameters
    ----------
    techs : list[OEOTechnology]

    Returns
    -------
    dict  –  ``{"techs": {tech_id: {...}, ...}}``
    """
    result: dict[str, Any] = {}
    for tech in techs:
        result.update(to_calliope_tech(tech))
    return {"techs": result}


def enrich_calliope_tech_dict(
    existing: dict[str, Any],
    oeo_tech: OEOTechnology,
    overwrite: bool = True,
) -> dict[str, Any]:
    """
    Merge OEO API parameters into an *existing* Calliope tech definition dict.

    This is the key integration function: the UI's static tech data is used as
    a base (preserving any UI-level overrides), and the OEO API values fill in
    or overwrite the cost/efficiency fields.

    Parameters
    ----------
    existing : dict
        Existing Calliope tech definition (as produced by the UI or YAML files).
        Keyed as ``{tech_id: {essentials, constraints, costs}}``.
    oeo_tech : OEOTechnology
        Fresh data from the OEO API.
    overwrite : bool
        If True (default), OEO API values overwrite existing values.
        If False, OEO API values only fill missing fields.

    Returns
    -------
    dict  –  merged tech definition in the same format as ``existing``.
    """
    import copy

    merged = copy.deepcopy(existing)

    oeo_block = to_calliope_tech(oeo_tech)
    oeo_def = oeo_block[oeo_tech.id]

    tech_id = next(iter(merged))
    base_def = merged[tech_id]

    for section in ("essentials", "constraints"):
        if section in oeo_def:
            base_def.setdefault(section, {})
            for k, v in oeo_def[section].items():
                if overwrite or k not in base_def[section]:
                    base_def[section][k] = v

    # Costs: only overwrite numeric cost values, never structural keys
    if "costs" in oeo_def:
        base_def.setdefault("costs", {})
        for cost_class, cost_vals in oeo_def["costs"].items():
            base_def["costs"].setdefault(cost_class, {})
            if isinstance(cost_vals, dict):
                for k, v in cost_vals.items():
                    if overwrite or k not in base_def["costs"][cost_class]:
                        base_def["costs"][cost_class][k] = v

    return merged

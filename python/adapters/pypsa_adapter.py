"""
pypsa_adapter.py
----------------
Translates OEOTechnology instances (from tech_database.py) into keyword
argument dictionaries suitable for ``pypsa.Network.add()`` calls.

This adapter is *framework-ready*: no PyPSA integration exists in the
current application, but this module provides the full translation layer
so PyPSA support can be wired up with minimal effort.

PyPSA field mapping reference
-------------------------------
OEO field                        → PyPSA parameter
───────────────────────────────────────────────────────────────────────────────
name                             → component name
carrier_out / carrier            → carrier
capex_usd_per_kw                 → capital_cost   (Generator / Link)
capex_usd_per_kwh                → capital_cost   (StorageUnit, per MWh)
opex_fixed_usd_per_kw_year       → marginal_cost  (annualised proxy)
opex_variable_usd_per_kwh        → marginal_cost  (Generator preferred)
electrical_efficiency            → efficiency     (Generator / Link / StorageUnit)
storage_eff                      → efficiency_store / efficiency_dispatch
lifetime_years                   → lifetime
energy_cap_max_kw                → p_nom_max
capex_per_distance_usd_per_kw_km → capital_cost   (Line – requires length_km)

PyPSA component types used
---------------------------
``Generator``   – supply, supply_plus, conversion (single output)
``StorageUnit`` – storage
``Link``        – conversion_plus (multi-carrier), transmission
``Load``        – demand (not parametrised by the API)
"""

from __future__ import annotations

import math
from typing import Any, Optional

from python.services.tech_database import OEOTechnology


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _finite(val: Optional[float]) -> Optional[float]:
    if val is None or math.isinf(val) or math.isnan(val):
        return None
    return val


# ---------------------------------------------------------------------------
# Per-component translators
# ---------------------------------------------------------------------------

def to_generator_kwargs(tech: OEOTechnology) -> dict[str, Any]:
    """
    Build ``network.add("Generator", name, **kwargs)`` keyword arguments.

    Suitable for tech_type: supply, supply_plus, conversion.

    Parameters
    ----------
    tech : OEOTechnology

    Returns
    -------
    dict
        Keyword arguments for ``pypsa.Network.add("Generator", …)``.
    """
    kwargs: dict[str, Any] = {}

    carrier = tech.carrier_out or tech.carrier or "electricity"
    kwargs["carrier"] = carrier
    kwargs["name"] = tech.name

    if _finite(tech.capex_usd_per_kw) is not None:
        kwargs["capital_cost"] = tech.capex_usd_per_kw  # USD/kW

    # Prefer variable O&M as marginal cost; fall back to zero
    if _finite(tech.opex_variable_usd_per_kwh) is not None:
        kwargs["marginal_cost"] = tech.opex_variable_usd_per_kwh * 1000  # USD/MWh
    else:
        kwargs["marginal_cost"] = 0.0

    if _finite(tech.electrical_efficiency) is not None:
        kwargs["efficiency"] = tech.electrical_efficiency

    if _finite(tech.energy_cap_max_kw) is not None:
        kwargs["p_nom_max"] = tech.energy_cap_max_kw / 1000  # convert kW → MW

    if tech.lifetime_years:
        kwargs["lifetime"] = float(tech.lifetime_years)

    # Fixed O&M expressed as an annuity on capital (PyPSA uses marginal_cost
    # for simplicity; a proper annuity calc would require interest_rate too)
    if _finite(tech.opex_fixed_usd_per_kw_year) is not None:
        kwargs["_om_fixed_usd_per_kw_year"] = tech.opex_fixed_usd_per_kw_year  # user-handled

    return kwargs


def to_storage_unit_kwargs(tech: OEOTechnology) -> dict[str, Any]:
    """
    Build ``network.add("StorageUnit", name, **kwargs)`` keyword arguments.

    Parameters
    ----------
    tech : OEOTechnology

    Returns
    -------
    dict
        Keyword arguments for ``pypsa.Network.add("StorageUnit", …)``.
    """
    kwargs: dict[str, Any] = {}

    carrier = tech.carrier or tech.carrier_out or "electricity"
    kwargs["carrier"] = carrier
    kwargs["name"] = tech.name

    # Storage CAPEX: PyPSA uses capital_cost per MWh of storage capacity
    if _finite(tech.capex_usd_per_kwh) is not None:
        kwargs["capital_cost"] = tech.capex_usd_per_kwh * 1000  # USD/MWh

    if _finite(tech.opex_variable_usd_per_kwh) is not None:
        kwargs["marginal_cost"] = tech.opex_variable_usd_per_kwh * 1000

    # Round-trip efficiency split: assume symmetric charge/discharge
    eff = _finite(tech.storage_eff or tech.electrical_efficiency)
    if eff is not None:
        sqrt_eff = math.sqrt(eff)
        kwargs["efficiency_store"] = sqrt_eff
        kwargs["efficiency_dispatch"] = sqrt_eff

    if tech.lifetime_years:
        kwargs["lifetime"] = float(tech.lifetime_years)

    return kwargs


def to_link_kwargs(
    tech: OEOTechnology,
    bus0: str = "bus0",
    bus1: str = "bus1",
    length_km: Optional[float] = None,
) -> dict[str, Any]:
    """
    Build ``network.add("Link", name, **kwargs)`` keyword arguments.

    Suitable for tech_type: conversion_plus, transmission.

    Parameters
    ----------
    tech : OEOTechnology
    bus0 : str
        Name of the source bus (default placeholder, caller must set).
    bus1 : str
        Name of the destination bus (default placeholder, caller must set).
    length_km : float, optional
        Line length in km.  Required for transmission lines using
        ``capex_per_distance_usd_per_kw_km``.

    Returns
    -------
    dict
        Keyword arguments for ``pypsa.Network.add("Link", …)``.
    """
    kwargs: dict[str, Any] = {}

    kwargs["name"] = tech.name
    kwargs["bus0"] = bus0
    kwargs["bus1"] = bus1

    carrier_in = tech.carrier_in or "electricity"
    carrier_out = tech.carrier_out or "electricity"
    kwargs["carrier"] = carrier_in

    if _finite(tech.electrical_efficiency) is not None:
        kwargs["efficiency"] = tech.electrical_efficiency

    # Transmission-line CAPEX (per km)
    if _finite(tech.capex_per_distance_usd_per_kw_km) is not None and length_km:
        kwargs["capital_cost"] = tech.capex_per_distance_usd_per_kw_km * length_km
    elif _finite(tech.capex_usd_per_kw) is not None:
        kwargs["capital_cost"] = tech.capex_usd_per_kw

    if _finite(tech.opex_variable_usd_per_kwh) is not None:
        kwargs["marginal_cost"] = tech.opex_variable_usd_per_kwh * 1000

    if tech.lifetime_years:
        kwargs["lifetime"] = float(tech.lifetime_years)

    # Store carrier metadata for the caller to wire multi-bus links
    kwargs["_carrier_in"] = carrier_in
    kwargs["_carrier_out"] = carrier_out

    return kwargs


# ---------------------------------------------------------------------------
# Unified dispatcher
# ---------------------------------------------------------------------------

def to_pypsa_component(
    tech: OEOTechnology,
    **extra_kwargs,
) -> tuple[str, dict[str, Any]]:
    """
    Determine the correct PyPSA component type and return its kwargs.

    Parameters
    ----------
    tech : OEOTechnology
    **extra_kwargs
        Additional keyword arguments forwarded to the specific translator
        (e.g. ``bus0``, ``bus1``, ``length_km`` for Links).

    Returns
    -------
    (component_type, kwargs)
        ``component_type`` is one of ``"Generator"``, ``"StorageUnit"``,
        ``"Link"``, ``"Load"``.
        ``kwargs`` is the dict to unpack into ``network.add()``.

    Example
    -------
    ::

        ctype, kwargs = to_pypsa_component(oeo_solar)
        network.add(ctype, kwargs.pop("name"), bus="region1", **kwargs)
    """
    t = tech.tech_type.lower()

    if t in ("supply", "supply_plus", "generator", "renewable", "conversion"):
        return "Generator", to_generator_kwargs(tech)

    if t in ("storage", "battery"):
        return "StorageUnit", to_storage_unit_kwargs(tech)

    if t in ("conversion_plus", "transmission", "link"):
        return "Link", to_link_kwargs(tech, **extra_kwargs)

    if t in ("demand", "load"):
        return "Load", {"name": tech.name, "carrier": tech.carrier or "electricity"}

    # Default to Generator
    return "Generator", to_generator_kwargs(tech)

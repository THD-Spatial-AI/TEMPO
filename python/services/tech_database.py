"""
tech_database.py
----------------
Client for the local OEO Technology Database API (default: http://127.0.0.1:8005).

This module is the Single Source of Truth connector.  All framework adapters
(Calliope, PyPSA, OSeMOSYS) call functions here rather than talking directly
to the API.

Assumed API contract
--------------------
GET /api/technologies
    → list[TechSummary]   (id, name, oeo_class, type)

GET /api/technologies/{tech_id}
    → TechDetail          (full parameter set, see OEOTechnology dataclass)

POST /api/technologies/batch
    body: {"ids": ["solar_pv", "wind_onshore", ...]}
    → list[TechDetail]

GET /api/technologies/types/{tech_type}
    tech_type: supply | storage | conversion | transmission | demand
    → list[TechDetail]

The API must be running locally before a model run.  If it is offline, every
function raises TechDatabaseOfflineError and the caller can fall back to
hardcoded defaults.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OEO_API_BASE_URL: str = "http://127.0.0.1:8005"
DEFAULT_TIMEOUT: int = 10  # seconds


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class TechDatabaseOfflineError(ConnectionError):
    """Raised when the OEO Tech Database API cannot be reached."""


class TechNotFoundError(KeyError):
    """Raised when a requested technology ID does not exist in the API."""


# ---------------------------------------------------------------------------
# Data model (mirrors the OEO API JSON schema)
# ---------------------------------------------------------------------------

@dataclass
class OEOTechnology:
    """
    Normalised representation of a technology fetched from the OEO API.

    Field names follow the Open Energy Ontology naming conventions.
    Framework adapters map these fields to solver-specific parameter names.
    """

    # Identity
    id: str
    name: str
    oeo_class: str                          # e.g. "oeo:WindPowerPlant"
    tech_type: str                          # supply | storage | conversion | transmission | demand

    # Carriers
    carrier_in: Optional[str] = None        # e.g. "hydrogen"
    carrier_out: Optional[str] = None       # e.g. "electricity"
    carrier: Optional[str] = None           # for storage/transmission (single carrier)

    # Cost parameters (monetary units as provided by API, typically USD/kW)
    capex_usd_per_kw: Optional[float] = None      # CAPEX (energy capacity)
    capex_usd_per_kwh: Optional[float] = None     # CAPEX (storage capacity)
    opex_fixed_usd_per_kw_year: Optional[float] = None  # Fixed O&M per year
    opex_variable_usd_per_kwh: Optional[float] = None   # Variable O&M per kWh produced
    capex_per_distance_usd_per_kw_km: Optional[float] = None  # For transmission lines

    # Technical parameters
    electrical_efficiency: Optional[float] = None  # 0–1 round-trip for storage
    lifetime_years: Optional[int] = None
    interest_rate: Optional[float] = None
    energy_cap_max_kw: Optional[float] = None
    energy_ramping: Optional[float] = None         # fraction per hour (0–1)
    resource_unit: Optional[str] = None            # energy_per_cap | absolute

    # Storage-specific
    storage_eff: Optional[float] = None            # storage-specific efficiency if different
    energy_cap_per_storage_cap: Optional[float] = None  # C-rate

    # Display / metadata
    color: Optional[str] = None
    description: Optional[str] = None
    source_url: Optional[str] = None

    # Raw payload kept for forward-compatibility
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_api_dict(cls, data: dict[str, Any]) -> "OEOTechnology":
        """
        Parse an API response dict into an OEOTechnology instance.

        The mapping below handles both snake_case and camelCase variants
        that different FastAPI implementations may emit.
        """
        def get(*keys: str, default=None):
            for k in keys:
                if k in data:
                    return data[k]
            return default

        return cls(
            id=get("id", "tech_id", default="unknown"),
            name=get("name", default="Unknown"),
            oeo_class=get("oeo_class", "oeoClass", "type_uri", default=""),
            tech_type=get("tech_type", "techType", "type", "category", default="supply"),
            carrier_in=get("carrier_in", "carrierIn", "fuel"),
            carrier_out=get("carrier_out", "carrierOut", "output_carrier"),
            carrier=get("carrier"),
            capex_usd_per_kw=get("capex_usd_per_kw", "capex", "capital_cost_usd_per_kw"),
            capex_usd_per_kwh=get("capex_usd_per_kwh", "storage_capex"),
            opex_fixed_usd_per_kw_year=get(
                "opex_fixed_usd_per_kw_year", "fixed_om", "om_annual_usd_per_kw"
            ),
            opex_variable_usd_per_kwh=get(
                "opex_variable_usd_per_kwh", "variable_om", "om_prod_usd_per_kwh"
            ),
            capex_per_distance_usd_per_kw_km=get(
                "capex_per_distance_usd_per_kw_km", "line_capex_per_km"
            ),
            electrical_efficiency=get(
                "electrical_efficiency", "efficiency", "energy_efficiency"
            ),
            lifetime_years=get("lifetime_years", "lifetime"),
            interest_rate=get("interest_rate", "wacc", "discount_rate"),
            energy_cap_max_kw=get("energy_cap_max_kw", "max_capacity_kw"),
            energy_ramping=get("energy_ramping", "ramp_rate"),
            resource_unit=get("resource_unit"),
            storage_eff=get("storage_eff", "round_trip_efficiency"),
            energy_cap_per_storage_cap=get("energy_cap_per_storage_cap", "c_rate"),
            color=get("color", "display_color"),
            description=get("description"),
            source_url=get("source_url", "source"),
            raw=data,
        )


# ---------------------------------------------------------------------------
# Low-level HTTP helpers
# ---------------------------------------------------------------------------

def _get_requests_session():
    """Return a requests.Session (lazy import so the module loads without requests)."""
    try:
        import requests
        session = requests.Session()
        return session
    except ImportError as exc:
        raise ImportError(
            "The 'requests' package is required for tech_database.py. "
            "Install it with:  pip install requests"
        ) from exc


def _get(path: str, timeout: int = DEFAULT_TIMEOUT) -> Any:
    """
    Perform a GET request against the OEO API.

    Raises
    ------
    TechDatabaseOfflineError
        If the API is unreachable (connection refused, timeout, etc.).
    """
    import requests

    url = f"{OEO_API_BASE_URL}{path}"
    try:
        session = _get_requests_session()
        response = session.get(url, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError as exc:
        raise TechDatabaseOfflineError(
            f"OEO Tech Database is offline (could not connect to {url}). "
            "Start the FastAPI service and retry."
        ) from exc
    except requests.exceptions.Timeout as exc:
        raise TechDatabaseOfflineError(
            f"OEO Tech Database timed out after {timeout}s ({url})."
        ) from exc
    except requests.exceptions.HTTPError as exc:
        if exc.response.status_code == 404:
            raise TechNotFoundError(f"Technology not found at {url}") from exc
        raise


def _post(path: str, body: dict, timeout: int = DEFAULT_TIMEOUT) -> Any:
    """Perform a POST request against the OEO API."""
    import requests

    url = f"{OEO_API_BASE_URL}{path}"
    try:
        session = _get_requests_session()
        response = session.post(url, json=body, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError as exc:
        raise TechDatabaseOfflineError(
            f"OEO Tech Database is offline ({url})."
        ) from exc
    except requests.exceptions.Timeout as exc:
        raise TechDatabaseOfflineError(
            f"OEO Tech Database timed out after {timeout}s ({url})."
        ) from exc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def is_api_available(timeout: int = 3) -> bool:
    """
    Quick health-check.  Returns True if the OEO API is reachable.

    Example usage::

        if is_api_available():
            tech = get_technology("solar_pv")
        else:
            tech = FALLBACK_TECH_DATA["solar_pv"]
    """
    try:
        _get("/health", timeout=timeout)
        return True
    except (TechDatabaseOfflineError, Exception):
        # Also try the docs endpoint as a fallback ping
        try:
            _get("/api/technologies", timeout=timeout)
            return True
        except Exception:
            return False


def get_technology_catalog() -> list[dict]:
    """
    Fetch all technologies from the OEO API as raw dicts.

    Returns
    -------
    list[dict]
        List of technology summary objects (id, name, oeo_class, type).

    Raises
    ------
    TechDatabaseOfflineError
    """
    logger.info("Fetching technology catalog from OEO API …")
    data = _get("/api/technologies")
    # Normalise: API may return a list directly or {"technologies": [...]}
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("technologies", "items", "data", "results"):
            if key in data:
                return data[key]
    return [data] if data else []


def get_technology(tech_id: str) -> OEOTechnology:
    """
    Fetch a single technology by its OEO identifier.

    Parameters
    ----------
    tech_id : str
        The technology identifier as used by the API, e.g. ``"solar_pv"``.

    Returns
    -------
    OEOTechnology

    Raises
    ------
    TechDatabaseOfflineError
    TechNotFoundError
    """
    logger.info(f"Fetching technology '{tech_id}' from OEO API …")
    data = _get(f"/api/technologies/{tech_id}")
    return OEOTechnology.from_api_dict(data)


def get_technologies_batch(tech_ids: list[str]) -> list[OEOTechnology]:
    """
    Fetch multiple technologies in a single request.

    Falls back to individual GET requests if the batch endpoint is not
    available (404).

    Parameters
    ----------
    tech_ids : list[str]
        Technology identifiers to fetch.

    Returns
    -------
    list[OEOTechnology]
    """
    if not tech_ids:
        return []

    logger.info(f"Fetching batch of {len(tech_ids)} technologies from OEO API …")

    # Try the batch POST endpoint first
    try:
        raw_list = _post("/api/technologies/batch", {"ids": tech_ids})
        if isinstance(raw_list, list):
            return [OEOTechnology.from_api_dict(item) for item in raw_list]
    except TechDatabaseOfflineError:
        raise
    except Exception:
        logger.warning("Batch endpoint unavailable, falling back to individual GETs.")

    # Individual fallback
    techs: list[OEOTechnology] = []
    for tid in tech_ids:
        try:
            techs.append(get_technology(tid))
        except TechNotFoundError:
            logger.warning(f"Technology '{tid}' not found in OEO API, skipping.")
    return techs


def get_technologies_by_type(tech_type: str) -> list[OEOTechnology]:
    """
    Fetch all technologies of a given functional type.

    Parameters
    ----------
    tech_type : str
        One of: ``supply``, ``supply_plus``, ``storage``, ``conversion``,
        ``conversion_plus``, ``transmission``, ``demand``.

    Returns
    -------
    list[OEOTechnology]
    """
    logger.info(f"Fetching all '{tech_type}' technologies from OEO API …")
    try:
        raw_list = _get(f"/api/technologies/types/{tech_type}")
    except TechNotFoundError:
        # Fallback: fetch full catalog and filter client-side
        logger.warning(
            f"Type endpoint not found, filtering catalog client-side for type='{tech_type}'"
        )
        catalog = get_technology_catalog()
        raw_list = [
            item for item in catalog
            if item.get("tech_type") == tech_type
            or item.get("type") == tech_type
            or item.get("category") == tech_type
        ]
    if isinstance(raw_list, list):
        return [OEOTechnology.from_api_dict(item) for item in raw_list]
    return []


def configure(base_url: str = OEO_API_BASE_URL, timeout: int = DEFAULT_TIMEOUT) -> None:
    """
    Update the API base URL and default timeout at runtime.

    Example::

        from python.services.tech_database import configure
        configure(base_url="http://127.0.0.1:8005", timeout=15)
    """
    global OEO_API_BASE_URL, DEFAULT_TIMEOUT
    OEO_API_BASE_URL = base_url.rstrip("/")
    DEFAULT_TIMEOUT = timeout
    logger.info(f"OEO API configured: {OEO_API_BASE_URL} (timeout={timeout}s)")

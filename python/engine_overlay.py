"""Shared helper for the engine-specific parameter overlay.

A technology may carry engine-native overrides at either the per-location config
(`location.techs[tech].engineParams`) or the global tech definition
(`technologies[i].engineParams`), shaped as::

    {"pypsa": {...}, "osemosys": {...}, "adoptnet0": {...}}

These override the values produced by the normal Calliope->engine translation.
The authoring UI writes them in `src/components/creation/TechParameterEditor.jsx`;
the common<->engine mapping lives in `parameterOntology.json`. This module is the
single place the runners read them so PyPSA / OSeMOSYS / AdOpT-NET0 stay consistent.
"""


def engine_overlay(tech, loc_cfg, engine):
    """Merged engine-specific params for a tech at a location (loc_cfg wins)."""
    def _ep(obj):
        if not isinstance(obj, dict):
            return {}
        ep = obj.get("engineParams")
        if not isinstance(ep, dict):
            return {}
        v = ep.get(engine)
        return v if isinstance(v, dict) else {}
    return {**_ep(tech), **_ep(loc_cfg)}


def coerce_overlay(params):
    """Normalise string 'true'/'false' to bool; leave numbers/others untouched.

    The UI already stores numeric values as numbers; only booleans typed as text
    need coercing so engines that expect real bools behave.
    """
    out = {}
    for key, val in (params or {}).items():
        if isinstance(val, str):
            low = val.strip().lower()
            if low == "true":
                val = True
            elif low == "false":
                val = False
        out[key] = val
    return out

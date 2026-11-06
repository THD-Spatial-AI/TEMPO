"""
demand_seeds.py — which OSM substations are electricity withdrawal points.

Distribution companies draw energy at distribution / industrial substations;
transmission, traction, converter and generation (plant step-up) substations
carry no end-use demand. Untagged substations are classified by voltage.
"""

SEED_TAGS = {"distribution", "minor_distribution", "industrial"}
EXCLUDED_TAGS = {"transmission", "traction", "converter", "generation"}
DEFAULT_MAX_KV = 110.0


def _kv(value):
    """Highest voltage of a value; OSM lists several as '220;66'."""
    kvs = []
    for part in str(value).split(";") if value is not None else []:
        try:
            kvs.append(float(part))
        except ValueError:
            pass
    return max(kvs) if kvs else None


def is_seed(sub, max_kv=DEFAULT_MAX_KV):
    """True when the substation should receive demand (decision D2)."""
    tag = str(sub.get("substation") or "").strip().lower()
    if tag in SEED_TAGS:
        return True
    if tag in EXCLUDED_TAGS:
        return False
    kv = _kv(sub.get("voltage_kv"))
    return kv is None or kv <= max_kv


def select_seeds(subs, max_kv=DEFAULT_MAX_KV):
    """(seeds, fallback_used). With no seed left, every substation is used."""
    seeds = [s for s in subs if is_seed(s, max_kv)]
    if seeds:
        return seeds, False
    return list(subs), True

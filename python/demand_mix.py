"""
demand_mix.py — per-cell BDEW profile mixes from land-use energy.

A cell's mix is the energy-weighted share of its land-use classes, blended
with the panel's global mix by how much of the cell's energy is classified.
"""

CLASS_CODES = {
    "classic": {"residential": "h0_dyn", "commercial": "g0", "industrial": "g3", "farmland": "l0"},
    "bdew25": {"residential": "h25", "commercial": "g25", "industrial": "g25", "farmland": "l25"},
}
INDUSTRIAL_CODE = {"classic": "g3", "bdew25": "g25"}
# Profile codes per family ("flat" belongs to both).
FAMILY_CODES = {
    "classic": {"h0", "h0_dyn", "g0", "g1", "g2", "g3", "g4", "g5", "g6", "l0", "l1", "l2", "flat"},
    "bdew25": {"h25", "g25", "l25", "flat"},
}


def _normalised(weights):
    total = sum(w for w in weights.values() if w > 0)
    return {k: w / total for k, w in weights.items() if w > 0} if total > 0 else {}


def round_mix(weights, step=5):
    """{code: w} → {code: int percent} multiples of `step`, summing to 100 (largest remainder), zeros dropped."""
    shares = _normalised(weights)
    if not shares:
        return {}
    units = 100 // step
    raw = {k: s * units for k, s in shares.items()}
    out = {k: int(round(v, 9) // 1) for k, v in raw.items()}
    # ties on the remainder go to the earlier key (stable sort)
    by_rem = sorted(raw, key=lambda k: -round(raw[k] - out[k], 9))
    for k in by_rem[: units - sum(out.values())]:
        out[k] += 1
    return {k: v * step for k, v in out.items() if v > 0}


def cell_mix(class_kwh, cell_kwh, global_mix, family="classic", industrial=False):
    """class_kwh: {class: kWh}; returns (mix {code: pct}, coverage 0..1) per D6c."""
    codes = CLASS_CODES[family]
    by_code = {}
    for cls, code in codes.items():
        kwh = class_kwh.get(cls, 0) or 0
        if kwh > 0:
            by_code[code] = by_code.get(code, 0) + kwh
    classified = sum(by_code.values())
    coverage = min(1.0, classified / cell_kwh) if cell_kwh > 0 else 0.0
    if industrial:
        return {INDUSTRIAL_CODE[family]: 100}, coverage
    blend = {k: coverage * s for k, s in _normalised(by_code).items()}
    for k, s in _normalised(global_mix).items():
        blend[k] = blend.get(k, 0) + (1 - coverage) * s
    return round_mix(blend), coverage

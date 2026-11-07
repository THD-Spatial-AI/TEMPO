"""
renewables_wind.py — hourly wind capacity factor from ERA5 (W1–W7).

Weather = renewables_weather.wind_weather_frame (v10, v100 m/s, t2m °C, sp hPa).
Hub speed: per-hour power-law shear between 10 m and 100 m. Density: ideal gas,
IEC 61400-12-1 correction (look the curve up at v·(ρ/1.225)^(1/3)). windpowerlib
supplies OEDB turbine power curves only (bundled data, offline).
"""
import math
from functools import lru_cache

import numpy as np

from renewables_weather import cell_of

GENERIC = {
    "generic_iec1": ("Generic IEC I (high wind)", 3.0, 13.0, 25.0),
    "generic_iec2": ("Generic IEC II (medium wind)", 3.0, 11.5, 25.0),
    "generic_iec3": ("Generic IEC III (low wind)", 3.0, 10.0, 25.0),
    "generic_offshore": ("Generic offshore 15 MW (IEA ref.)", 3.0, 10.6, 25.0),
}
RHO0 = 1.225
R_DRY = 287.058
MAX_CANDIDATES = 60


@lru_cache(maxsize=1)
def _oedb():
    """{turbine_type: label} for OEDB turbines with a power curve (windpowerlib 0.2: top-level import)."""
    from windpowerlib import get_turbine_types
    df = get_turbine_types(print_out=False)
    df = df[df["has_power_curve"]]
    return {r.turbine_type: f"{r.manufacturer} {r.turbine_type}" for r in df.itertuples()}


def list_turbines():
    out = [{"id": k, "label": v[0], "generic": True} for k, v in GENERIC.items()]
    out += [{"id": f"oedb:{t}", "label": lab, "generic": False} for t, lab in sorted(_oedb().items())]
    return out


@lru_cache(maxsize=256)
def _curve(turbine):
    if turbine in GENERIC:
        _, v_in, v_r, v_out = GENERIC[turbine]
        v = np.arange(0.0, 35.01, 0.25)
        p = np.clip((v ** 3 - v_in ** 3) / (v_r ** 3 - v_in ** 3), 0.0, 1.0)
        p[(v < v_in) | (v > v_out)] = 0.0
        return v, p
    if turbine.startswith("oedb:"):
        from windpowerlib import WindTurbine
        name = turbine[5:]
        if name not in _oedb():
            raise ValueError(f"unknown turbine {turbine!r}")
        t = WindTurbine(turbine_type=name, hub_height=100)
        pc = t.power_curve                       # DataFrame wind_speed [m/s], value [W]
        v = pc["wind_speed"].to_numpy(dtype=float)
        watts = pc["value"].to_numpy(dtype=float)
        nominal = float(t.nominal_power) if t.nominal_power else float(watts.max())   # W
        # 4 OEDB curves peak up to 2.5 % above nominal; wind_capacity_factor clips them to 1.0
        return v, np.clip(watts / nominal, 0.0, None)
    raise ValueError(f"unknown turbine {turbine!r}")


def power_curve(turbine):
    """(wind speeds m/s, P/P_rated) — normalised power curve."""
    v, p = _curve(turbine)
    return v.copy(), p.copy()


def hub_speed(v10, v100, hub_height):
    v10 = np.asarray(v10, dtype=float)
    v100 = np.asarray(v100, dtype=float)
    ok = (v10 >= 0.5) & (v100 >= 0.5)
    alpha = np.full(v100.shape, 1.0 / 7.0)
    alpha[ok] = np.log(v100[ok] / v10[ok]) / math.log(10.0)
    alpha = np.clip(alpha, 0.0, 0.5)
    return v100 * (hub_height / 100.0) ** alpha


def air_density(t2m_c, sp_hpa):
    return np.asarray(sp_hpa, dtype=float) * 100.0 / (R_DRY * (np.asarray(t2m_c, dtype=float) + 273.15))


def wind_capacity_factor(weather, turbine, hub_height, loss=0.12):
    v_c, p_c = _curve(turbine)
    v = hub_speed(weather["v10"].to_numpy(), weather["v100"].to_numpy(), hub_height)
    v_std = v * (air_density(weather["t2m"].to_numpy(), weather["sp"].to_numpy()) / RHO0) ** (1.0 / 3.0)
    p = np.interp(v_std, v_c, p_c, left=0.0, right=0.0)
    return np.clip(p, 0.0, 1.0) * (1.0 - loss)


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def _wrap_lon(lon):
    return ((lon + 180.0) % 360.0) - 180.0 + 0.0


def own_cell(lat, lon):
    la, lo = cell_of(lat, lon)
    return (la, _wrap_lon(lo))


def candidate_cells(lat, lon, radius_km):
    """ERA5 cell centres within radius_km of (lat, lon), own cell first, nearest first, ≤ 60 (W7)."""
    own = own_cell(lat, lon)
    dlat = radius_km / 111.0
    dlon = radius_km / max(1e-6, 111.0 * math.cos(math.radians(lat)))
    cells = set()
    la = math.floor((lat - dlat) * 4) / 4
    while la <= lat + dlat:
        lo = math.floor((lon - dlon) * 4) / 4
        while lo <= lon + dlon:
            if haversine_km(lat, lon, la, lo) <= radius_km:
                cells.add((la + 0.0, _wrap_lon(lo)))
            lo += 0.25
        la += 0.25
    cells.discard(own)
    rest = sorted(cells, key=lambda c: haversine_km(lat, lon, *c))
    return [own] + rest[:MAX_CANDIDATES - 1]

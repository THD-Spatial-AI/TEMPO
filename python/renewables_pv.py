"""
renewables_pv.py — hourly PV capacity factor (per kWp DC) with pvlib PVWatts.

`weather` is renewables_weather.pv_weather_frame output: ghi/dni/dhi/temp_air/
wind_speed at interval midpoints (UTC). Azimuth is compass degrees (0 = N,
180 = S). Losses scale DC (module pdc0 = 1 − losses); the inverter clips at
0.96 / dc_ac. Default losses exclude the ~4 % inverter loss (PVWatts
convention); 0.10 + inverter ≈ PVGIS's all-in 14 %.
"""
import numpy as np
from pvlib import iam, irradiance
from pvlib.location import Location
from pvlib.modelchain import ModelChain
from pvlib.pvsystem import Array, FixedMount, PVSystem, SingleAxisTrackerMount
from pvlib.temperature import TEMPERATURE_MODEL_PARAMETERS

TEMP_PARAMS = TEMPERATURE_MODEL_PARAMETERS["sapm"]["open_rack_glass_polymer"]
INVERTER_EFF = 0.96


def pv_capacity_factor(weather, lat, lon, tilt, azimuth, tracking="fixed",
                       losses=0.10, dc_ac=1.2, temp_coeff=-0.004):
    if tracking == "single_axis":
        mount = SingleAxisTrackerMount(axis_tilt=0, axis_azimuth=180, max_angle=60,
                                       backtrack=True, gcr=0.35)
    else:
        mount = FixedMount(surface_tilt=tilt, surface_azimuth=azimuth)
    array = Array(mount=mount,
                  module_parameters={"pdc0": 1.0 - losses, "gamma_pdc": temp_coeff},
                  temperature_model_parameters=TEMP_PARAMS)
    system = PVSystem(arrays=[array],
                      inverter_parameters={"pdc0": 1.0 / dc_ac, "eta_inv_nom": INVERTER_EFF})
    mc = ModelChain(system, Location(lat, lon), aoi_model="physical", spectral_model="no_loss")
    mc.run_model(weather)
    return np.clip(mc.results.ac.fillna(0.0).to_numpy(dtype=float), 0.0, None)


SUMMER_NORTH = [6, 7, 8]
WINTER_NORTH = [12, 1, 2]


def period_months(period, lat, months=None):
    """Months of a period; summer/winter follow the point's hemisphere (O3)."""
    if period == "year":
        return list(range(1, 13))
    if period in ("summer", "winter"):
        north = (period == "summer") == (lat >= 0)
        return SUMMER_NORTH if north else WINTER_NORTH
    if period == "custom":
        if not months or any(m not in range(1, 13) for m in months):
            raise ValueError("custom period needs months 1–12")
        return list(months)
    raise ValueError(f"unknown period {period!r}")


def _poa_context(weather, lat, lon, months):
    """Pre-extracted, pre-masked numpy arrays for the objective (elementwise, so masking first is exact)."""
    sp = Location(lat, lon).get_solarposition(weather.index)
    mask = np.asarray(weather.index.month.isin(months))
    pick = lambda x: np.asarray(x, dtype=float)[mask]  # noqa: E731
    return {"zen": pick(sp["apparent_zenith"]), "az": pick(sp["azimuth"]),
            "dni_extra": pick(irradiance.get_extra_radiation(weather.index)),
            "dni": pick(weather["dni"]), "ghi": pick(weather["ghi"]), "dhi": pick(weather["dhi"])}


def _poa_sum(ctx, tilt, azimuth):
    aoi = irradiance.aoi(tilt, azimuth, ctx["zen"], ctx["az"])
    beam = ctx["dni"] * np.maximum(np.cos(np.radians(aoi)), 0.0) * iam.physical(aoi)
    sky = irradiance.haydavies(tilt, azimuth, ctx["dhi"], ctx["dni"], ctx["dni_extra"], ctx["zen"], ctx["az"])
    ground = irradiance.get_ground_diffuse(tilt, ctx["ghi"])
    total = np.nan_to_num(beam + sky + ground, nan=0.0)
    return float(np.clip(total, 0.0, None).sum())


def poa_energy(weather, lat, lon, tilt, azimuth, months):
    """Plane-of-array energy (Wh/m²) over `months`: the optimisation objective (O1)."""
    return _poa_sum(_poa_context(weather, lat, lon, months), tilt, azimuth)


def optimise_orientation(weather, lat, lon, months, tilt0, azimuth0):
    """Tilt/azimuth maximising POA energy over `months` (O2); gain vs (tilt0, azimuth0) (O4)."""
    ctx = _poa_context(weather, lat, lon, months)
    face = 0 if lat < 0 else 180
    f = lambda t, a: _poa_sum(ctx, t, a % 360)  # noqa: E731
    coarse = [(t, face + d) for t in range(0, 91, 5) for d in range(-60, 61, 10)]
    bt, ba = max(coarse, key=lambda ta: f(*ta))
    fine = [(t, ba + d) for t in range(max(0, bt - 5), min(90, bt + 5) + 1) for d in range(-10, 11, 2)]
    bt, ba = max(fine, key=lambda ta: f(*ta))
    if bt == 0:
        ba = face
    best, base = f(bt, ba), f(tilt0, azimuth0)
    if base >= best:
        return {"tilt": int(round(tilt0)), "azimuth": int(round(azimuth0)) % 360, "gain_pct": 0.0}
    return {"tilt": int(bt), "azimuth": int(ba % 360),
            "gain_pct": round(100.0 * (best / base - 1.0), 1) if base > 0 else 0.0}

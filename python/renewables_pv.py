"""
renewables_pv.py — hourly PV capacity factor (per kWp DC) with pvlib PVWatts.

`weather` is renewables_weather.pv_weather_frame output: ghi/dni/dhi/temp_air/
wind_speed at interval midpoints (UTC). Azimuth is compass degrees (0 = N,
180 = S). Losses scale DC (module pdc0 = 1 − losses); the inverter clips at
0.96 / dc_ac. Default losses exclude the ~4 % inverter loss (PVWatts
convention); 0.10 + inverter ≈ PVGIS's all-in 14 %.
"""
import numpy as np
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

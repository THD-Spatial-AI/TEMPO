"""
Generate synthetic but realistic hourly timeseries CSVs for the Italian energy model.
Output: public/templates/Italian_model/timeseries_data/
  - regional_demand.csv    (negative MW, demand per zone)
  - pv_series.csv          (capacity factor 0-1, solar)
  - wind_series.csv        (capacity factor 0-1, onshore wind)
  - wind_offshore_series.csv (capacity factor 0-1, offshore wind)
  - hydro_reservoirs.csv   (capacity factor 0-1, hydro)

All CSVs: hourly, 2026-01-01 00:00 .. 2026-12-31 23:00 (8760 rows)
Calliope 0.6 format: first row = header (empty index cell, zone names)
"""
import pathlib, numpy as np, pandas as pd

np.random.seed(42)
OUT = pathlib.Path(__file__).parent.parent / "public" / "templates" / "Italian_model" / "timeseries_data"
OUT.mkdir(parents=True, exist_ok=True)

# All grid zones (FR/CH/AT/SI/GR are foreign borders – no file-based resources)
ALL_ZONES = ["NORD", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8",
             "CNOR", "R9", "R10", "R11", "CSUD", "R12", "R13", "R14",
             "SUD", "R15", "R16", "R17", "R18", "SICI", "SARD"]

# Demand zones (the 6 market areas that have demand_power with file=)
DEMAND_ZONES = ["NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD"]

# Typical annual demand per zone (MWh -> avg hourly MW) – rough 2015 Italian figures
# Italy total ~320 TWh. Distribution: NORD ~45%, CNOR 14%, CSUD 8%, SUD 20%, SICI 7%, SARD 6%
ZONE_DEMAND_GW = {
    "NORD":  0.45 * 36.5,   # ~16.4 GW avg
    "CNOR":  0.14 * 36.5,
    "CSUD":  0.08 * 36.5,
    "SUD":   0.20 * 36.5,
    "SICI":  0.07 * 36.5,
    "SARD":  0.06 * 36.5,
}

# Rough latitude for PV potential (more south → more sun)
ZONE_LAT = {
    "NORD": 45.2, "R1": 45.1, "R2": 45.0, "R3": 45.0, "R4": 44.9, "R5": 44.3,
    "R6": 43.9, "R7": 43.8, "R8": 43.7, "CNOR": 43.5, "R9": 42.5, "R10": 42.3,
    "R11": 42.0, "CSUD": 40.9, "R12": 41.0, "R13": 40.7, "R14": 40.5,
    "SUD": 40.8, "R15": 40.2, "R16": 39.8, "R17": 38.7, "R18": 38.2,
    "SICI": 37.5, "SARD": 39.2,
}

# Build hourly DatetimeIndex for 2026
idx = pd.date_range("2026-01-01", periods=8760, freq="h")
hours = np.arange(8760)
h_of_day = idx.hour.values          # 0-23
day_of_year = idx.dayofyear.values  # 1-365

# ── helpers ──────────────────────────────────────────────────────────────────

def daily_pattern(hour):
    """Electricity demand shape during a day (normalised, 0..1)."""
    # Two peaks: morning ~8h, evening ~20h
    return (0.5
            + 0.25 * np.exp(-0.5 * ((hour - 8) / 3) ** 2)
            + 0.25 * np.exp(-0.5 * ((hour - 20) / 3) ** 2))

def seasonal_demand(doy):
    """Seasonal demand multiplier (higher in summer/winter, lower spring/autumn)."""
    return 1.0 + 0.12 * np.cos(2 * np.pi * (doy - 5) / 365)

def solar_cf(hour, doy, lat_deg):
    """Rough solar capacity factor [0,1]."""
    # Solar declination
    decl = 23.45 * np.sin(np.radians(360 / 365 * (doy - 81)))
    lat  = np.radians(lat_deg)
    dec  = np.radians(decl)
    # Hour angle (solar noon = 0)
    ha   = np.radians(15 * (hour - 12))
    cos_theta = (np.sin(lat) * np.sin(dec)
                 + np.cos(lat) * np.cos(dec) * np.cos(ha))
    ghi = np.maximum(0.0, cos_theta)
    # Add mild diffuse boost and cap at 0.95
    cf = np.minimum(ghi * 1.05, 0.95)
    return cf

def wind_cf(n, mean=0.25, std=0.12):
    """Stochastic wind capacity factor via AR(1) process."""
    ar = np.zeros(n)
    ar[0] = mean
    phi = 0.97  # strong autocorrelation
    for i in range(1, n):
        ar[i] = phi * ar[i-1] + (1 - phi) * mean + np.random.normal(0, std * 0.3)
    return np.clip(ar, 0, 1)

def offshore_wind_cf(n, mean=0.38, std=0.15):
    """Offshore wind – higher mean, more variable."""
    return wind_cf(n, mean=mean, std=std)

def hydro_cf(doy, n, base=0.4):
    """snowmelt spring peak, autumn rain peak."""
    seasonal = base + 0.25 * np.exp(-0.5 * ((doy - 120) / 40) ** 2) \
                    + 0.10 * np.exp(-0.5 * ((doy - 290) / 30) ** 2)
    noise = np.random.normal(0, 0.04, n)
    return np.clip(seasonal + noise, 0, 1)

# ── 1. regional_demand.csv ───────────────────────────────────────────────────
print("Generating regional_demand.csv ...")
demand_dict = {}
dp = daily_pattern(h_of_day)
sd = seasonal_demand(day_of_year)
for zone in DEMAND_ZONES:
    avg_mw = ZONE_DEMAND_GW[zone] * 1000  # MW
    noise  = np.random.normal(0, avg_mw * 0.02, 8760)
    demand = -(avg_mw * dp * sd + noise)
    demand_dict[zone] = np.round(demand, 1)

df_demand = pd.DataFrame(demand_dict, index=idx)
df_demand.index.name = ""
df_demand.to_csv(OUT / "regional_demand.csv")

# ── 2. pv_series.csv ─────────────────────────────────────────────────────────
print("Generating pv_series.csv ...")
pv_dict = {}
for zone in ALL_ZONES:
    lat = ZONE_LAT.get(zone, 42.0)
    cf  = solar_cf(h_of_day, day_of_year, lat)
    # Add small random variation per zone
    cf  = np.clip(cf + np.random.normal(0, 0.01, 8760), 0, 1)
    pv_dict[zone] = np.round(cf, 4)

df_pv = pd.DataFrame(pv_dict, index=idx)
df_pv.index.name = ""
df_pv.to_csv(OUT / "pv_series.csv")

# ── 3. wind_series.csv ───────────────────────────────────────────────────────
print("Generating wind_series.csv ...")
wind_dict = {}
# Seasonal boosting – more wind in winter
seasonal_wind = 1.0 + 0.15 * np.cos(2 * np.pi * (day_of_year - 15) / 365)
for zone in ALL_ZONES:
    cf = wind_cf(8760)
    cf = np.clip(cf * seasonal_wind, 0, 1)
    wind_dict[zone] = np.round(cf, 4)

df_wind = pd.DataFrame(wind_dict, index=idx)
df_wind.index.name = ""
df_wind.to_csv(OUT / "wind_series.csv")

# ── 4. wind_offshore_series.csv ───────────────────────────────────────────────
print("Generating wind_offshore_series.csv ...")
offshore_dict = {}
for zone in ALL_ZONES:
    cf = offshore_wind_cf(8760)
    cf = np.clip(cf * seasonal_wind, 0, 1)
    offshore_dict[zone] = np.round(cf, 4)

df_offshore = pd.DataFrame(offshore_dict, index=idx)
df_offshore.index.name = ""
df_offshore.to_csv(OUT / "wind_offshore_series.csv")

# ── 5. hydro_reservoirs.csv ──────────────────────────────────────────────────
print("Generating hydro_reservoirs.csv ...")
hydro_dict = {}
for zone in ALL_ZONES:
    cf = hydro_cf(day_of_year, 8760)
    hydro_dict[zone] = np.round(cf, 4)

df_hydro = pd.DataFrame(hydro_dict, index=idx)
df_hydro.index.name = ""
df_hydro.to_csv(OUT / "hydro_reservoirs.csv")

print(f"\nDone. Files written to: {OUT}")
for f in sorted(OUT.glob("*.csv")):
    print(f"  {f.name}  {f.stat().st_size // 1024} KB  shape={pd.read_csv(f, index_col=0).shape}")

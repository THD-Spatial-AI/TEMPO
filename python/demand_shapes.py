"""
demand_shapes.py — hemisphere-aware normalised BDEW load shapes for the
substation demand estimate (plan D7a/D7b).

The northern path is demandlib_profile's blend unchanged. The southern path
shifts the seasons by six months: classic ElecSlp gets SOUTH_SEASONS and a
rolled h0 dynamisation; BDEW25 looks up the month six months away and evaluates
the H25 dynamisation at the shifted day of year. Day types (WT/SA/FT, holidays)
always follow the real date and the area country's holidays.
"""

import threading
import warnings
from types import SimpleNamespace

import numpy as np
import pandas as pd

from demandlib_profile import _RESOLUTIONS, _blend_15min, _holidays_for

# Southern classic seasons — the northern ElecSlp ranges + 6 months (covers the year once).
SOUTH_SEASONS = {
    "summer1": [1, 1, 3, 14],       # 15.11.–14.03. (wraps the year)
    "summer2": [11, 15, 12, 31],
    "transition1": [3, 15, 4, 30],  # north 15.09.–31.10. + 6 months
    "transition2": [9, 21, 11, 14],  # north 21.03.–14.05. + 6 months
    "winter1": [5, 1, 9, 20],       # north 01.11.–20.03. + 6 months
}

_SHIFT_DAYS = 182
# warnings.catch_warnings swaps process-global state; concurrent blends could leave
# ElecSlp's simplefilter("error") installed, so the blend runs under one lock.
_BLEND_LOCK = threading.Lock()


def _bdew25_south(cls, idx15, holidays):
    """Replicates BDEW25Profile.__init__ (15-min index) with the month lookup shifted 6 months.
    Version-coupled to demandlib 0.2.2 internals (_profiles25, raw_profile_data, datafile)."""
    from demandlib.bdew._profiles25 import BDEW25Profile, DynamicBDEW25Profile
    from demandlib.tools import set_holidays_in_df

    df = pd.DataFrame(
        data={
            "month": idx15.month,
            "weekday": idx15.day_of_week + 1,
            "hour": idx15.hour,
            "minute": idx15.minute,
        },
        index=idx15,
    )
    set_holidays_in_df(df, holidays=holidays)
    df.replace({"weekday": [1, 2, 3, 4, 5]}, "WT", inplace=True)
    df.replace({"weekday": [6]}, "SA", inplace=True)
    df.replace({"weekday": [0, 7]}, "FT", inplace=True)  # 0 for holiday
    df["month"] = ((df["month"] + 5) % 12) + 1

    # raw_profile_data only reads self.datafile, a constant per class.
    raw = BDEW25Profile.raw_profile_data.fget(SimpleNamespace(datafile=cls.datafile.fget(None)))
    df = df.merge(raw, on=["month", "weekday", "hour", "minute"], how="inner")
    values = pd.Series(df["value"].to_numpy(dtype=float), index=idx15)

    if issubclass(cls, DynamicBDEW25Profile):
        doy = np.array(((idx15.day_of_year - 1 + _SHIFT_DAYS) % 365) + 1, dtype=float)
        values = values * (-3.92e-10 * doy**4 + 3.2e-7 * doy**3 - 7.02e-5 * doy**2 + 0.0021 * doy + 1.24)
    return values


def _blend_south_15min(bdew, year, sectors, holidays, family):
    """Southern counterpart of demandlib_profile._blend_15min."""
    total = float(sum(sectors.values()))
    if family == "bdew25":
        classes = {"h25": bdew.H25, "g25": bdew.G25, "l25": bdew.L25}
        unknown = [c for c in sectors if c not in classes]
        if unknown:
            raise ValueError(f"unknown BDEW25 sector(s) {unknown}; available: {sorted(classes)}")
        idx = pd.date_range(f"{year}-01-01", f"{year}-12-31 23:45", freq="15min")
        cols = {code: _bdew25_south(classes[code], idx, holidays) for code in sectors}
    else:
        profiles = bdew.ElecSlp(year, seasons=SOUTH_SEASONS, holidays=holidays).get_profiles()
        dyn = bdew.elec_slp.dynamisation_function(profiles.index).to_numpy()
        h0_dyn = profiles["h0"] * np.roll(dyn, _SHIFT_DAYS * 96)
        profiles["h0_dyn"] = h0_dyn * (profiles["h0"].sum() / h0_dyn.sum())
        missing = [c for c in sectors if c not in profiles.columns]
        if missing:
            raise ValueError(f"unknown SLP code(s) {missing}; available: {sorted(profiles.columns)}")
        cols = {code: profiles[code] for code in sectors}
    return sum(cols[code] * (float(w) / total) for code, w in sectors.items())


def normalised_shape(start, end, resolution, sectors, country=None, family="classic", southern=False):
    """pandas Series over [start 00:00 .. end 23:xx] at resolution, mean ≈ 1 over the first full year
    (same convention as demandlib_profile._generate). sectors = {code: weight}; a "flat" weight blends
    in a constant (mean-1) component."""
    if resolution not in _RESOLUTIONS:
        raise ValueError(f"resolution must be one of {sorted(_RESOLUTIONS)}")
    if family not in ("classic", "bdew25"):
        raise ValueError("family must be 'classic' or 'bdew25'")
    if not sectors:
        raise ValueError("no sectors given")
    sectors = {k: float(v) for k, v in sectors.items() if float(v) > 0}
    if not sectors:
        raise ValueError("no sectors with positive weight")
    start_ts, end_ts = pd.Timestamp(start), pd.Timestamp(end)
    if end_ts < start_ts:
        raise ValueError("end is before start")
    minutes = _RESOLUTIONS[resolution]
    last = end_ts.normalize() + pd.Timedelta("23:59:59")
    flat_w = sectors.pop("flat", 0.0)
    flat = flat_w / (flat_w + sum(sectors.values()))
    if not sectors:
        return pd.Series(1.0, index=pd.date_range(start_ts, last, freq=f"{minutes}min"))

    from demandlib import bdew
    import demandlib.bdew.elec_slp  # noqa: F401 (bdew.elec_slp for dynamisation_function)

    blend = _blend_south_15min if southern else _blend_15min
    per_year = {}
    for year in range(start_ts.year, end_ts.year + 1):
        # ElecSlp calls warnings.simplefilter("error") globally; keep it contained (and serialised).
        with _BLEND_LOCK, warnings.catch_warnings():
            series = blend(bdew, year, sectors, _holidays_for(country, year), family)
        per_year[year] = series.resample(f"{minutes}min").mean() if minutes != 15 else series

    full = pd.concat(list(per_year.values())).sort_index()
    # Inclusive of the whole end day (last stamp 23:45/23:30/23:00 by resolution).
    window = full.loc[start_ts: last]
    if window.empty:
        raise ValueError("generated series is empty for the requested window")
    ref_mean = float(per_year[start_ts.year].mean())
    if ref_mean <= 0:
        raise ValueError("reference-year mean is non-positive")
    return flat + (1.0 - flat) * (window / ref_mean)


def shape_substations(substations, start, end, resolution, country=None, family="classic",
                      latitude=0.0, shape_fn=None):
    """substations: [{"id", "avg_mw", "mix": {code: pct}}]. Each distinct mix is shaped once.
    Returns {"datetimes", "series": {id: [MW]}, "peak_mw": {id: float}, "southern", "tropical",
    "unique_mixes"}. Values = shape x avg_mw (4 dp, positive); no mix / zero avg_mw -> zeros."""
    if resolution not in _RESOLUTIONS:
        raise ValueError(f"resolution must be one of {sorted(_RESOLUTIONS)}")
    shape_fn = shape_fn or normalised_shape
    southern = latitude < 0
    shapes, keys = {}, {}
    for sub in substations:
        mix, avg = sub.get("mix"), float(sub.get("avg_mw") or 0)
        if not mix or avg <= 0:
            continue
        key = keys[sub["id"]] = tuple(sorted(mix.items()))
        if key not in shapes:
            shapes[key] = shape_fn(start, end, resolution, dict(mix), country, family, southern)
    if shapes:
        idx = next(iter(shapes.values())).index
    else:
        idx = pd.date_range(pd.Timestamp(start), pd.Timestamp(end).normalize() + pd.Timedelta("23:59:59"),
                            freq=f"{_RESOLUTIONS[resolution]}min")
    series, peaks = {}, {}
    for sub in substations:
        if sub["id"] not in keys:
            series[sub["id"]], peaks[sub["id"]] = [0.0] * len(idx), 0.0
            continue
        vals = np.round(np.asarray(shapes[keys[sub["id"]]], dtype=float) * float(sub["avg_mw"]), 4)
        series[sub["id"]], peaks[sub["id"]] = vals.tolist(), float(vals.max())
    assert all(len(v) == len(idx) for v in series.values()), "substation series differ in length"
    return {
        "datetimes": [t.strftime("%Y-%m-%d %H:%M:%S") for t in idx],
        "series": series,
        "peak_mw": peaks,
        "southern": bool(southern),
        "tropical": bool(abs(latitude) < 23.5),
        "unique_mixes": len(shapes),
    }

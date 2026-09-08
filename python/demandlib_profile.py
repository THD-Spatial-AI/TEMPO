"""
demandlib_profile.py — one-shot BDEW load-shape generator for the OSM Study-Area
substation demand feature.

Invoked by the Electron main process (spawned from the `demandlib-venv`), not a
long-running service. Two modes:

  1. Generate a normalised demand shape:
         echo '<json>' | python demandlib_profile.py
     stdin  : { "start": "2024-01-01", "end": "2024-12-31",
                "resolution": "60min"|"30min"|"15min",
                "sectors": { "h0": 0.5, "g0": 0.4, "l0": 0.1 },
                "country": "DE" }               # ISO-2, optional (holidays)
     stdout : { "datetimes": [...], "values": [...],   # mean ≈ 1 over a full year
                "source": "demandlib", "resolution": "...",
                "slp_columns": ["h0","g0","l0"] }

  2. List the SLP codes the installed demandlib ships (feeds the wizard dropdown):
         python demandlib_profile.py --list-profiles [--year 2024]
     stdout : { "profiles": ["g0","g1",...,"h0","h0_dyn","l0","l1","l2"] }

On any error a JSON object { "error": "..." } is written to stdout and the
process exits non-zero, so the renderer can fall back to the synthetic JS path.

The output shape is NORMALISED (average power ≈ 1 over a full reference year);
the caller scales it per substation. demandlib profiles are single calendar
year, so a multi-year span is generated per year and stitched, then sliced to
the exact requested window. Normalisation uses the FIRST full calendar year's
mean so seasonal/weekly variation is preserved (a winter interval is genuinely
higher than a summer one, and a full-year window integrates to the annual total).
"""

import sys
import json
import argparse
import datetime as dt

_RESOLUTIONS = {"15min": 15, "30min": 30, "60min": 60}


def _fail(msg):
    """Emit a JSON error to stdout and exit non-zero."""
    print(json.dumps({"error": str(msg)}))
    sys.exit(1)


def _load_bdew():
    try:
        from demandlib import bdew  # noqa: WPS433 (import inside fn: optional dep)
    except Exception as exc:  # pragma: no cover - env-dependent
        _fail(f"demandlib not available: {exc}")
    return bdew


def _holidays_for(country, year):
    """Country holidays as a {date: name} dict, or {} when unavailable."""
    if not country:
        return {}
    try:
        import holidays as holidays_lib
        return dict(holidays_lib.country_holidays(country.upper(), years=[year]))
    except Exception:
        # Unknown country / package missing → no holiday day-typing (weekday only).
        return {}


def _list_profiles(year):
    bdew = _load_bdew()
    try:
        e_slp = bdew.ElecSlp(year)
        cols = list(e_slp.get_profiles().columns)
    except Exception as exc:
        _fail(f"could not read profile list: {exc}")
    print(json.dumps({"profiles": cols}))


def _year_shape(bdew, year, sectors, country, minutes):
    """
    Blended, resampled relative shape for one full calendar year.

    Returns a pandas Series indexed at `minutes` resolution over the whole year.
    Weights in `sectors` are treated as energy shares (each BDEW SLP carries the
    same annual energy), so a normalised weighted average is a valid blend.
    """
    e_slp = bdew.ElecSlp(year, holidays=_holidays_for(country, year))
    profiles = e_slp.get_profiles()  # 15-min DataFrame, one column per SLP code
    available = set(profiles.columns)
    missing = [c for c in sectors if c not in available]
    if missing:
        raise ValueError(f"unknown SLP code(s) {missing}; available: {sorted(available)}")

    total = float(sum(sectors.values()))
    if total <= 0:
        raise ValueError("sector weights sum to zero")

    blend = None
    for code, weight in sectors.items():
        frac = float(weight) / total
        col = profiles[code] * frac
        blend = col if blend is None else blend + col

    if minutes != 15:
        blend = blend.resample(f"{minutes}min").mean()
    return blend


def _generate(payload):
    import pandas as pd

    start = str(payload.get("start") or "").strip()
    end = str(payload.get("end") or "").strip()
    resolution = str(payload.get("resolution") or "60min").strip()
    country = payload.get("country")
    sectors = payload.get("sectors") or {}

    if resolution not in _RESOLUTIONS:
        _fail(f"resolution must be one of {sorted(_RESOLUTIONS)}")
    if not sectors:
        _fail("no sectors given")
    # 'flat' is handled by the caller without a timeseries; nothing to do here.
    sectors = {k: v for k, v in sectors.items() if k != "flat" and float(v) > 0}
    if not sectors:
        _fail("no non-flat sectors with positive weight")

    try:
        start_ts = pd.Timestamp(start)
        end_ts = pd.Timestamp(end)
    except Exception as exc:
        _fail(f"invalid start/end: {exc}")
    if end_ts < start_ts:
        _fail("end is before start")

    minutes = _RESOLUTIONS[resolution]
    bdew = _load_bdew()

    years = list(range(start_ts.year, end_ts.year + 1))
    try:
        per_year = {y: _year_shape(bdew, y, sectors, country, minutes) for y in years}
    except Exception as exc:
        _fail(str(exc))

    full = pd.concat([per_year[y] for y in years]).sort_index()
    # Inclusive of the whole end day (last stamp 23:45/23:30/23:00 by resolution).
    window = full.loc[start: end + " 23:59:59"]
    if window.empty:
        _fail("generated series is empty for the requested window")

    ref_mean = float(per_year[years[0]].mean())
    if ref_mean <= 0:
        _fail("reference-year mean is non-positive")

    values = [round(float(v) / ref_mean, 4) for v in window.to_numpy()]
    datetimes = [ts.strftime("%Y-%m-%d %H:%M:%S") for ts in window.index]

    print(json.dumps({
        "datetimes": datetimes,
        "values": values,
        "source": "demandlib",
        "resolution": resolution,
        "slp_columns": sorted(sectors.keys()),
    }))


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--list-profiles", action="store_true")
    parser.add_argument("--year", type=int, default=dt.date.today().year)
    args, _ = parser.parse_known_args()

    if args.list_profiles:
        _list_profiles(args.year)
        return

    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except Exception as exc:
        _fail(f"invalid JSON on stdin: {exc}")
    _generate(payload)


if __name__ == "__main__":
    main()

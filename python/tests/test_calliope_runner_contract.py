"""
calliope_runner helpers that shape the frozen result contract and the model's
time window. No calliope install needed (xarray/pandas only):
    python -m pytest python/tests/test_calliope_runner_contract.py -v
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

sys.path.insert(0, str(Path(__file__).parent.parent))

import calliope_runner as r  # noqa: E402


def _write_series(path, start, periods):
    idx = pd.date_range(start, periods=periods, freq='h')
    pd.DataFrame({'arica': np.ones(periods)}, index=idx).to_csv(path)


def test_referenced_csv_files_collects_tech_and_location_refs():
    techs = {'pv': {'constraints': {'resource': 'file=resource_pv.csv'}}}
    locs = {'arica': {'techs': {'total_demand': {'constraints': {'resource': 'file=total_demand.csv:arica'}}}}}
    assert r._referenced_csv_files(techs, locs) == {'resource_pv.csv', 'total_demand.csv'}


def test_data_time_range_ignores_unreferenced_csv(tmp_path):
    # Arica: an unused 2024 OSM demand CSV sits next to the 2021 series the model uses.
    _write_series(tmp_path / 'resource_pv.csv', '2021-01-01', 24 * 7)
    _write_series(tmp_path / 'osm_substation_demand.csv', '2024-01-01', 24 * 7)
    lo, hi, freq = r._data_time_range(tmp_path, csv_names={'resource_pv.csv'})
    assert lo == pd.Timestamp('2021-01-01 00:00:00')
    assert hi == pd.Timestamp('2021-01-07 23:00:00')
    assert freq == pd.Timedelta('1h')


def test_data_time_range_without_filter_still_intersects_all(tmp_path):
    _write_series(tmp_path / 'a.csv', '2021-01-01', 48)
    _write_series(tmp_path / 'b.csv', '2021-01-01 12:00', 48)
    lo, hi, _ = r._data_time_range(tmp_path)
    assert lo == pd.Timestamp('2021-01-01 12:00') and hi == pd.Timestamp('2021-01-02 23:00')


def _unmet_ds(values):
    """Calliope 0.6.8 model.results['unmet_demand']: loc_carriers x timesteps, with
    unused_supply (<= 0) already folded in by postprocess.clean_results."""
    ts = pd.date_range('2021-01-04 14:00', periods=3, freq='h')
    return xr.Dataset({'unmet_demand': (('loc_carriers', 'timesteps'), np.array(values, dtype=float))},
                      coords={'loc_carriers': ['arica::electricity', 'putre::electricity'],
                              'timesteps': ts})


def test_unmet_demand_read_from_calliope_variable():
    ds = _unmet_ds([[0.0, 119.0, 183.0], [0.0, 0.0, -5.0]])  # -5 = unused supply, not unmet
    out = r._unmet_demand_results(ds)
    assert out['total_unmet_demand_mwh'] == 302.0
    assert out['unmet_demand_by_location'] == {'arica': 302.0}
    assert out['unmet_demand_timeseries'] == [0.0, 119.0, 183.0]


def test_no_unmet_demand_keys_when_nothing_unmet():
    assert r._unmet_demand_results(_unmet_ds([[0.0] * 3, [0.0, -1.0, 0.0]])) == {}
    assert r._unmet_demand_results(xr.Dataset()) == {}


def test_engine_contract_ids_equal_calliope06_ids():
    """PyPSA / AdOpT / 0.7 runners map their sanitised ids back to these."""
    import adoptnet0_translate
    import calliope07_runner
    import pypsa_translate
    sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'scripts'))
    import verify_engines
    names = ['hydro-ror', '66_kv', '13-8_kv', 'Electricity Substation', 'S/E ARICA',
             'N DIESEL-QUANI-ARICA', '9 North', ' a::b:c ', 'Ünïcode-1']
    import engine_common
    # one copy, shared by every engine runner
    assert pypsa_translate.contract_id is adoptnet0_translate.contract_id is calliope07_runner._contract_id         is engine_common.contract_id
    for n in names:
        assert engine_common.contract_id(n) == r._safe_id(n), n
        assert engine_common.contract_id(n, location=True) == r._safe_id(n).lower(), n
    assert all(verify_engines.contract_tech_id(n) == r._safe_id(n) for n in names)

"""Unit tests for adoptnet0_runner._to_frozen_contract — no venv required."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from adoptnet0_runner import _to_frozen_contract

CONTRACT_KEYS = {
    "success", "framework", "model_name", "solver", "objective", "termination_condition",
    "capacities", "generation", "dispatch", "timestamps", "transmission_flow",
    "demand_timeseries", "costs_by_tech", "costs_by_location",
    "tech_metadata", "tech_parents",
}

EXTRACTED = {  # model units: MW / MWh / EUR
    "objective": 12345.6,
    "solver_status": "ok",
    "capacity": {
        "north": {"solar": 0.1, "wind": 0.05},
        "south": {"solar": 0.08},
    },
    "storage_capacity": {},
    "tech_costs": {"north": {"solar": 10.0, "wind": 5.0}, "south": {"solar": 8.0}},
    "dispatch": {
        "north": {"solar": {"electricity": [0.010, 0.020, 0.030]},
                  "wind": {"electricity": [0.005, 0.006, 0.007]}},
        "south": {"solar": {"electricity": [0.008, 0.009, 0.010]}},
    },
    "arcs": {},
    "network_costs": {},
    "demand": {},
}

TIMESTAMPS = ["2024-01-01 00:00", "2024-01-01 01:00", "2024-01-01 02:00"]

MODEL_DATA = {
    "technologies": [
        {"name": "solar", "essentials": {"parent": "supply", "name": "Solar PV",
                                          "carrier_out": "electricity", "color": "#f59e0b"}},
        {"name": "wind", "essentials": {"parent": "supply", "name": "Wind",
                                         "carrier_out": "electricity", "color": "#3b82f6"}},
    ]
}


def test_all_contract_keys_present():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA, "Test")
    missing = CONTRACT_KEYS - set(r.keys())
    assert not missing, f"Missing contract keys: {missing}"


def test_framework_field():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA)
    assert r["framework"] == "adoptnet0"


def test_model_name_and_solver():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA, name="My Model", solver="glpk")
    assert r["model_name"] == "My Model"
    assert r["solver"] == "glpk"


def test_capacities_flat_keys():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA)
    caps = r["capacities"]
    assert "north::solar" in caps
    assert "north::wind" in caps
    assert "south::solar" in caps
    assert caps["north::solar"] == pytest.approx(100.0)   # MW → kW
    assert caps["south::solar"] == pytest.approx(80.0)
    for k in caps:
        assert "::" in k, f"capacities key missing '::': {k}"


def test_dispatch_summed_across_nodes():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA)
    disp = r["dispatch"]
    # solar: north [10,20,30] + south [8,9,10] = [18,29,40]
    assert disp["solar"] == pytest.approx([18.0, 29.0, 40.0])
    # wind: north only
    assert disp["wind"] == pytest.approx([5.0, 6.0, 7.0])


def test_termination_condition_ok():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA)
    assert r["termination_condition"] == "optimal"


def test_termination_condition_non_ok():
    ext = dict(EXTRACTED, solver_status="infeasible")
    r = _to_frozen_contract(ext, TIMESTAMPS, MODEL_DATA)
    assert r["termination_condition"] == "infeasible"


def test_termination_condition_optimal_passthrough():
    ext = dict(EXTRACTED, solver_status="optimal")
    r = _to_frozen_contract(ext, TIMESTAMPS, MODEL_DATA)
    assert r["termination_condition"] == "optimal"


def test_tech_metadata_populated():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA)
    assert r["tech_metadata"]["solar"]["name"] == "Solar PV"
    assert r["tech_metadata"]["wind"]["carrier"] == "electricity"


def test_empty_extracted():
    r = _to_frozen_contract({}, [], {})
    assert r["capacities"] == {}
    assert r["dispatch"] == {}
    assert r["objective"] is None
    assert r["termination_condition"] == "unknown"   # no HDF5 → no solver status


def test_objective_passed_through():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA)
    assert r["objective"] == 12345.6


def test_timestamps_passed_through():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA)
    assert r["timestamps"] == TIMESTAMPS


# --- Phase 3 review fixes -------------------------------------------------------

def test_capfactors_are_per_thread():
    import threading
    import adoptnet0_runner as R

    class _Coeff:
        def __init__(self):
            self.time_dependent_full = {}

    class FakeRes:
        def __init__(self, name):
            self.name = name
            self.processed_coeff = _Coeff()

        def fit_technology_performance(self, climate_data, location):
            pass

        def _calculate_bounds(self):
            pass

    class Loc:
        name = "north"

    R._patch_res_capfactor(FakeRes)
    seen = {}

    def job(val):
        R._thread_local.capfactors = {("north", "pv"): [val] * 3}
        barrier.wait()  # both threads have set their CFs before either reads
        tec = FakeRes("pv")
        tec.fit_technology_performance([0, 0, 0], Loc())
        seen[val] = list(tec.processed_coeff.time_dependent_full["capfactor"])

    barrier = threading.Barrier(2)
    threads = [threading.Thread(target=job, args=(v,)) for v in (0.2, 0.7)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert seen == {0.2: [0.2] * 3, 0.7: [0.7] * 3}


def test_duplicate_link_networks_sum_into_one_pair():
    model = {"technologies": [{"name": "grid_link", "essentials": {"parent": "transmission",
                                                                  "carrier": "electricity"}}],
             "links": [{"from": "north", "to": "south", "tech": "grid_link"},
                       {"from": "south", "to": "north", "tech": "grid_link"}]}
    ex = {"solver_status": "optimal", "arcs": {
        "grid_link__north__south": {("north", "south"): {"size": 0.1, "delivered": [0.05, 0.0]},
                                    ("south", "north"): {"size": 0.1, "delivered": [0.0, 0.0]}},
        "grid_link__south__north__2": {("south", "north"): {"size": 0.2, "delivered": [0.0, 0.03]},
                                       ("north", "south"): {"size": 0.2, "delivered": [0.0, 0.0]}},
    }, "network_costs": {"grid_link__north__south": 1.0, "grid_link__south__north__2": 2.0}}
    c = _to_frozen_contract(ex, ["t0", "t1"], model)
    assert list(c["transmission_flow"]) == ["north::south"]
    assert c["transmission_flow"]["north::south"]["timeseries"] == pytest.approx([50.0, -30.0])
    assert c["capacities"]["north::grid_link:south"] == pytest.approx(300.0)
    assert c["costs_by_tech"]["grid_link"] == pytest.approx(3.0)


def test_patch_highs_support_is_idempotent():
    pytest.importorskip("pyomo.environ")
    import adoptnet0_runner as R

    class FakeHub:
        def _perform_preprocessing_checks(self):
            pass

        def _define_solver_settings(self):
            pass

        def _call_solver(self):
            pass

    R._patch_highs_support(FakeHub)
    first = FakeHub._call_solver
    R._patch_highs_support(FakeHub)
    assert FakeHub._call_solver is first


# --- Calliope 0.6.8 contract ids + unmet demand ----------------------------------

ID_MODEL = {
    "locations": [{"name": "Zeta-1"}, {"name": "alpha"}],
    "technologies": [
        {"name": "hydro-ror", "essentials": {"parent": "supply", "carrier_out": "electricity"}},
        {"name": "66_kv", "essentials": {"parent": "transmission", "carrier": "electricity"}},
    ],
    "links": [{"from": "Zeta-1", "to": "alpha", "tech": "66_kv"}],
}
NET = "66_kv__Zeta_1__alpha"   # adoptnet0_translate.network_name('66_kv', 'Zeta-1', 'alpha')
ID_EXTRACTED = {
    "objective": 302_001.0, "violation_cost": 302_000.0, "solver_status": "optimal",
    "capacity": {"Zeta_1": {"hydro_ror": 0.5}}, "storage_capacity": {},
    "tech_costs": {"Zeta_1": {"hydro_ror": 1.0}},
    "dispatch": {"Zeta_1": {"hydro_ror": {"electricity": [0.1, 0.2, 0.3]}}},
    "arcs": {NET: {("Zeta_1", "alpha"): {"size": 0.1, "delivered": [0.01, 0.02, 0.03]},
                   ("alpha", "Zeta_1"): {"size": 0.1, "delivered": [0.0, 0.0, 0.0]}}},
    "network_costs": {NET: 2.0}, "demand": {},
    "violation": {"alpha": [0.0, 0.119, 0.183]},   # MW per timestep
}


def test_contract_ids_match_calliope06():
    from adoptnet0_translate import network_name
    assert network_name("66_kv", "Zeta-1", "alpha") == NET
    r = _to_frozen_contract(ID_EXTRACTED, TIMESTAMPS, ID_MODEL)
    assert r["capacities"] == {"zeta-1::hydro-ror": pytest.approx(500.0),
                               "zeta-1::66_kv:alpha": pytest.approx(100.0),
                               "alpha::66_kv:zeta-1": pytest.approx(100.0)}
    assert set(r["generation"]) == {"zeta-1::hydro-ror::electricity", "alpha::66_kv:zeta-1::electricity",
                                    "zeta-1::66_kv:alpha::electricity"}
    assert set(r["dispatch"]) == {"hydro-ror"}
    assert set(r["costs_by_tech"]) == {"hydro-ror", "66_kv"}
    assert set(r["costs_by_location"]) == {"zeta-1"}
    assert r["tech_parents"]["hydro-ror"] == "supply"
    assert "hydro-ror" in r["tech_metadata"]


def test_transmission_pair_resorted_on_contract_ids():
    tf = _to_frozen_contract(ID_EXTRACTED, TIMESTAMPS, ID_MODEL)["transmission_flow"]
    assert list(tf) == ["alpha::zeta-1"]
    assert tf["alpha::zeta-1"]["from"] == "alpha" and tf["alpha::zeta-1"]["to"] == "zeta-1"
    assert tf["alpha::zeta-1"]["timeseries"] == [pytest.approx(-10.0), pytest.approx(-20.0), pytest.approx(-30.0)]


def test_unmet_demand_reported_and_penalty_excluded_from_objective():
    r = _to_frozen_contract(ID_EXTRACTED, TIMESTAMPS, ID_MODEL)
    assert r["objective"] == pytest.approx(1.0)
    assert r["total_unmet_demand_mwh"] == pytest.approx(302.0)
    assert r["unmet_demand_by_location"] == {"alpha": pytest.approx(302.0)}
    assert r["unmet_demand_timeseries"] == [0.0, pytest.approx(119.0), pytest.approx(183.0)]


def test_no_unmet_keys_without_violation():
    r = _to_frozen_contract(dict(ID_EXTRACTED, violation_cost=0.0, violation={}), TIMESTAMPS, ID_MODEL)
    assert "total_unmet_demand_mwh" not in r
    assert r["objective"] == pytest.approx(302_001.0)


def test_violation_by_node_sums_carriers_in_time_order():
    pyo = pytest.importorskip("pyomo.environ")
    from adoptnet0_runner import _violation_by_node

    m = pyo.ConcreteModel()
    m.set_periods = pyo.Set(initialize=["period1"])

    def _period(b, p):
        b.var_violation = pyo.Var([1, 2], ["electricity", "heat"], ["alpha"], initialize=0.0)

    m.periods = pyo.Block(m.set_periods, rule=_period)
    v = m.periods["period1"].var_violation
    v[2, "electricity", "alpha"].value = 0.1
    v[2, "heat", "alpha"].value = 0.05
    assert _violation_by_node(m) == {"alpha": [0.0, pytest.approx(0.15)]}


def test_storage_eps_cost_added_in_run_path(tmp_path):
    import json
    from adoptnet0_runner import STORAGE_EPS_EUR_PER_MWH, _add_storage_eps_cost
    tdir = tmp_path / "period1" / "node_data" / "north" / "technology_data"
    tdir.mkdir(parents=True)
    (tdir / "battery.json").write_text(json.dumps({"tec_type": "STOR", "Economics": {"OPEX_variable": 2.0}}))
    (tdir / "pv.json").write_text(json.dumps({"tec_type": "RES", "Economics": {"OPEX_variable": 0.0}}))
    report = []
    assert _add_storage_eps_cost(str(tmp_path), report) == 1
    assert json.loads((tdir / "battery.json").read_text())["Economics"]["OPEX_variable"] == \
        pytest.approx(2.0 + STORAGE_EPS_EUR_PER_MWH)
    assert json.loads((tdir / "pv.json").read_text())["Economics"]["OPEX_variable"] == 0.0
    assert STORAGE_EPS_EUR_PER_MWH == pytest.approx(1e-3)   # 1e-6 €/kWh
    assert any("storage" in r and "1e-06" in r for r in report)


def test_transmission_generation_keys_like_calliope06():
    g = _to_frozen_contract(ID_EXTRACTED, TIMESTAMPS, ID_MODEL)["generation"]
    # energy arriving at the first node from the second: 'loc::tech:remote::carrier'
    assert g["alpha::66_kv:zeta-1::electricity"] == pytest.approx(60.0)
    assert g["zeta-1::66_kv:alpha::electricity"] == pytest.approx(0.0)


def test_free_unbounded_capacity_reported_as_peak_use_and_idle_entries_dropped():
    from adoptnet0_translate import _UNBOUNDED_KW
    ext = dict(ID_EXTRACTED)
    ext["capacity"] = {"Zeta_1": {"hydro_ror": 0.5, "import": _UNBOUNDED_KW / 1000.0, "oil": 13.207}}
    ext["dispatch"] = {"Zeta_1": {"hydro_ror": {"electricity": [0.1, 0.2, 0.3]},
                                  "import": {"electricity": [0.01, 0.04, 0.02]},
                                  "oil": {"electricity": [0.0, 0.0, 0.0]}}}
    ext["arcs"] = dict(ID_EXTRACTED["arcs"])
    idle = "66_kv__Zeta_1__alpha__2"
    ext["arcs"][idle] = {("Zeta_1", "alpha"): {"size": 0.0, "delivered": [0.0] * 3},
                         ("alpha", "Zeta_1"): {"size": 0.0, "delivered": [0.0] * 3}}
    ext["network_costs"] = {**ID_EXTRACTED["network_costs"], idle: 0.0}
    r = _to_frozen_contract(ext, TIMESTAMPS, ID_MODEL)
    assert r["capacities"]["zeta-1::import"] == pytest.approx(40.0)    # peak used, not the 1e9 sentinel
    assert r["capacities"]["zeta-1::oil"] == pytest.approx(13207.0)
    assert set(r["dispatch"]) == {"hydro-ror", "import"}                # idle oil dropped (0.6.8 rule)
    assert list(r["transmission_flow"]) == ["alpha::zeta-1"]


def test_all_zero_flow_pair_dropped():
    ext = dict(ID_EXTRACTED, arcs={NET: {("Zeta_1", "alpha"): {"size": 0.0, "delivered": [0.0] * 3},
                                         ("alpha", "Zeta_1"): {"size": 0.0, "delivered": [0.0] * 3}}})
    assert _to_frozen_contract(ext, TIMESTAMPS, ID_MODEL)["transmission_flow"] == {}


def test_zero_cost_techs_dropped_from_costs_by_tech():
    ext = dict(ID_EXTRACTED, tech_costs={"Zeta_1": {"hydro_ror": 1.0, "oil": 0.0}})
    assert "oil" not in _to_frozen_contract(ext, TIMESTAMPS, ID_MODEL)["costs_by_tech"]   # as 0.6.8 / PyPSA

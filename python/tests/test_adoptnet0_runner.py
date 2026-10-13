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

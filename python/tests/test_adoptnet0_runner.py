"""Unit tests for adoptnet0_runner._to_frozen_contract — no venv required."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from adoptnet0_runner import _to_frozen_contract

CONTRACT_KEYS = {
    "success", "framework", "model_name", "solver", "objective", "termination_condition",
    "capacities", "generation", "dispatch", "timestamps", "transmission_flow",
    "demand_timeseries", "costs_by_tech", "costs_by_location",
    "tech_metadata", "tech_parents",
}

EXTRACTED = {
    "objective": 12345.6,
    "solver_status": "ok",
    "capacity": {
        "north": {"solar": 100.0, "wind": 50.0},
        "south": {"solar": 80.0},
    },
    "dispatch": {
        "north": {"solar": [10.0, 20.0, 30.0], "wind": [5.0, 6.0, 7.0]},
        "south": {"solar": [8.0, 9.0, 10.0]},
    },
}

TIMESTAMPS = ["2024-01-01 00:00", "2024-01-01 01:00", "2024-01-01 02:00"]

MODEL_DATA = {
    "technologies": [
        {"id": "solar", "name": "Solar PV", "carrier": "electricity", "color": "#f59e0b"},
        {"id": "wind", "name": "Wind", "carrier": "electricity", "color": "#3b82f6"},
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
    assert caps["north::solar"] == 100.0
    assert caps["south::solar"] == 80.0
    for k in caps:
        assert "::" in k, f"capacities key missing '::': {k}"


def test_dispatch_summed_across_nodes():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA)
    disp = r["dispatch"]
    # solar: north [10,20,30] + south [8,9,10] = [18,29,40]
    assert disp["solar"] == [18.0, 29.0, 40.0]
    # wind: north only
    assert disp["wind"] == [5.0, 6.0, 7.0]


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
    assert r["termination_condition"] == "optimal"


def test_objective_passed_through():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA)
    assert r["objective"] == 12345.6


def test_timestamps_passed_through():
    r = _to_frozen_contract(EXTRACTED, TIMESTAMPS, MODEL_DATA)
    assert r["timestamps"] == TIMESTAMPS

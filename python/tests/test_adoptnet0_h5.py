"""HDF5 extraction tests for adoptnet0_runner — need h5py (AdOpT-NET0 venv)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

h5py = pytest.importorskip("h5py")

from adoptnet0_runner import _extract_results, _to_frozen_contract  # noqa: E402


def _make_h5(path):
    """Mirrors the real AdOpT-NET0 0.1.10 optimization_results.h5 layout."""
    with h5py.File(path, "w") as f:
        f["summary/total_cost"] = 1234.5
        f["summary/violation_cost"] = 0.0
        f["summary/solver_status"] = b"optimal"
        g = "design/nodes/period1/north/solar_pv/"
        f[g + "size"] = [0.35]
        f[g + "capex_tot"] = [400.0]
        f[g + "opex_fixed_tot"] = [50.0]
        f[g + "opex_variable"] = [10.0]
        s = "design/nodes/period1/north/battery/"
        f[s + "size"] = [4.0]                     # MWh
        f[s + "capacity_charge"] = [4.0]
        f[s + "capacity_discharge"] = [0.5]       # MW — the contract capacity
        f[s + "capex_tot"] = [100.0]
        f[s + "opex_fixed_tot"] = [0.0]
        f[s + "opex_variable"] = [0.0]
        op = "operation/technology_operation/period1/north/"
        f[op + "solar_pv/electricity_output"] = [0.1, 0.2]
        f[op + "solar_pv/curtailment_electricity"] = [0.0, 0.0]
        f[op + "battery/electricity_output"] = [0.0, 0.05]
        f[op + "battery/electricity_input"] = [0.05, 0.0]
        n = "design/networks/period1/grid_link__north__south/northsouth/"
        f[n + "size"] = 0.15
        f[n + "capex"] = 30.0
        f[n + "opex_fixed"] = [0.0]
        f[n + "opex_variable"] = 1.0
        f[n + "fromNode"] = b"north"
        f[n + "toNode"] = b"south"
        n2 = "design/networks/period1/grid_link__north__south/southnorth/"
        f[n2 + "size"] = 0.15
        f[n2 + "capex"] = 30.0
        f[n2 + "opex_fixed"] = [0.0]
        f[n2 + "opex_variable"] = 0.5
        f[n2 + "fromNode"] = b"south"
        f[n2 + "toNode"] = b"north"
        o = "operation/networks/period1/grid_link__north__south/"
        f[o + "northsouth/flow"] = [0.1, 0.0]
        f[o + "northsouth/losses"] = [0.003, 0.0]
        f[o + "southnorth/flow"] = [0.0, 0.05]
        f[o + "southnorth/losses"] = [0.0, 0.0015]
        f["operation/energy_balance/period1/north/electricity/demand"] = [0.1, 0.1]
        f["operation/energy_balance/period1/south/electricity/demand"] = [0.05, 0.05]
        f["operation/energy_balance/period1/south/gas/demand"] = [0, 0]


def test_extract_lowercase_hdf5(tmp_path):
    _make_h5(tmp_path / "optimization_results.h5")
    ex = _extract_results(str(tmp_path))
    assert ex["objective"] == 1234.5
    assert ex["violation_cost"] == 0.0
    assert ex["solver_status"] == "optimal"
    assert ex["capacity"]["north"]["solar_pv"] == pytest.approx(0.35)
    assert ex["capacity"]["north"]["battery"] == pytest.approx(0.5)          # discharge power
    assert ex["storage_capacity"]["north"]["battery"] == pytest.approx(4.0)  # energy
    assert ex["tech_costs"]["north"]["solar_pv"] == pytest.approx(460.0)
    assert ex["dispatch"]["north"]["solar_pv"]["electricity"] == [0.1, 0.2]
    assert ex["arcs"]["grid_link__north__south"][("north", "south")]["size"] == pytest.approx(0.15)
    # capex once per bidirectional pair, variable opex on every arc (AdOpT objective)
    assert ex["network_costs"]["grid_link__north__south"] == pytest.approx(31.5)
    assert ex["demand"]["electricity"] == [pytest.approx(0.15), pytest.approx(0.15)]


def test_frozen_contract_converts_mw_to_kw(tmp_path):
    _make_h5(tmp_path / "optimization_results.h5")
    ex = _extract_results(str(tmp_path))
    model = {"technologies": [
        {"name": "solar_pv", "essentials": {"parent": "supply", "carrier_out": "electricity"}},
        {"name": "battery", "essentials": {"parent": "storage", "carrier": "electricity"}},
        {"name": "grid_link", "essentials": {"parent": "transmission", "carrier": "electricity"}},
    ], "links": [{"from": "north", "to": "south", "tech": "grid_link"}]}
    c = _to_frozen_contract(ex, ["t0", "t1"], model, "m", "highs")
    assert c["capacities"]["north::solar_pv"] == pytest.approx(350.0)
    assert c["capacities"]["north::battery"] == pytest.approx(500.0)
    assert c["storage_capacities"]["north::battery"] == pytest.approx(4000.0)
    assert c["capacities"]["north::grid_link:south"] == pytest.approx(150.0)
    assert c["capacities"]["south::grid_link:north"] == pytest.approx(150.0)
    assert c["generation"]["north::solar_pv::electricity"] == pytest.approx(300.0)
    assert c["dispatch"]["solar_pv"] == [pytest.approx(100.0), pytest.approx(200.0)]
    assert c["costs_by_tech"] == {"solar_pv": pytest.approx(460.0), "battery": pytest.approx(100.0),
                                  "grid_link": pytest.approx(31.5)}
    tf = c["transmission_flow"]["north::south"]
    assert tf["from"] == "north" and tf["to"] == "south"
    assert tf["timeseries"] == [pytest.approx(97.0), pytest.approx(-48.5)]  # delivered, signed
    assert c["demand_timeseries"] == [pytest.approx(150.0), pytest.approx(150.0)]
    assert c["tech_parents"] == {"solar_pv": "supply", "battery": "storage", "grid_link": "transmission"}
    assert c["termination_condition"] == "optimal"


def test_tie_storage_power_adds_constraints():
    pyo = pytest.importorskip("pyomo.environ")
    from adoptnet0_runner import _tie_storage_power

    m = pyo.ConcreteModel()
    m.set_periods = pyo.Set(initialize=["period1"])

    def _tec(b, tec):
        b.var_capacity_charge = pyo.Var()
        b.var_capacity_discharge = pyo.Var()

    def _node(b, node):
        b.tech_blocks_active = pyo.Block(["battery"], rule=_tec)

    def _period(b, p):
        b.node_blocks = pyo.Block(["north"], rule=_node)

    m.periods = pyo.Block(m.set_periods, rule=_period)
    n = _tie_storage_power(m, {("north", "battery"): 1.0})
    b = m.periods["period1"].node_blocks["north"].tech_blocks_active["battery"]
    assert n == 1
    assert b.find_component("const_tempo_charge_eq_discharge") is not None
    assert b.const_tempo_power_max.upper == pytest.approx(1.0)


def test_non_flexratio_storage_size_not_reported_as_power(tmp_path):
    with h5py.File(tmp_path / "optimization_results.h5", "w") as f:
        f["summary/total_cost"] = 1.0
        f["summary/solver_status"] = b"optimal"
        f["design/nodes/period1/north/battery/size"] = [4.0]   # MWh; no capacity_discharge
        f["operation/technology_operation/period1/north/battery/storage_level"] = [1.0, 2.0]
        f["operation/technology_operation/period1/north/battery/electricity_output"] = [0.0, 0.1]
    ex = _extract_results(str(tmp_path))
    assert "battery" not in ex["capacity"].get("north", {})
    assert ex["storage_capacity"]["north"]["battery"] == pytest.approx(4.0)
    assert any("battery" in n for n in ex["notes"])


def test_tie_storage_power_applies_min():
    pyo = pytest.importorskip("pyomo.environ")
    from adoptnet0_runner import _tie_storage_power

    m = pyo.ConcreteModel()
    m.set_periods = pyo.Set(initialize=["period1"])

    def _tec(b, tec):
        b.var_capacity_charge = pyo.Var()
        b.var_capacity_discharge = pyo.Var()

    def _node(b, node):
        b.tech_blocks_active = pyo.Block(["battery"], rule=_tec)

    def _period(b, p):
        b.node_blocks = pyo.Block(["north"], rule=_node)

    m.periods = pyo.Block(m.set_periods, rule=_period)
    _tie_storage_power(m, {}, {("north", "battery"): 0.015})
    b = m.periods["period1"].node_blocks["north"].tech_blocks_active["battery"]
    assert b.const_tempo_power_min.lower == pytest.approx(0.015)
    assert b.find_component("const_tempo_power_max") is None

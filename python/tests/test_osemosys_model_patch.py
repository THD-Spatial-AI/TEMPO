"""TEMPO storage extension in the vendored osemosys.txt (cyclic year + hourly loss).
Integration tests: need glpsol (bundled on Windows in solvers/windows)."""
import json
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import osemosys_runner as R  # noqa: E402

ROOT = Path(__file__).parent.parent.parent
MODEL = ROOT / "python" / "osemosys" / "osemosys.txt"

try:
    GLPSOL = R._find_glpsol()
except Exception:
    GLPSOL = None
needs_glpsol = pytest.mark.skipif(GLPSOL is None, reason="glpsol not available")


def test_model_declares_tempo_params():
    text = MODEL.read_text(encoding="utf-8")
    assert "param StorageCyclicYear{r in REGION, s in STORAGE}, binary, default 0;" in text
    assert "param StorageLossRate{r in REGION, s in STORAGE}, >= 0, < 1, default 0;" in text
    assert "param TempoLevelScale, > 0, default 1;" in text
    assert "TempoStorage[r,s] = 0" in text            # upstream S/SC gated
    # last-instance equations only exist for day types that occur at least once
    for name in ("TS4_LastDayStart", "TS5_LastDayNext", "TS10_LowerLast", "TS11_UpperLast",
                 "TS12_LowerDayTypeEnd", "TS13_UpperDayTypeEnd"):
        decl = text[text.index(f"s.t. {name}"):].split("}:", 1)[0]
        assert "DaysInDayType[ls,ld,y] >= 1" in decl, name


def _run(payload_name):
    md = json.loads((ROOT / "scripts" / payload_name).read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as tmp:
        return R.run_model(md, tmp, log_fn=lambda line: None)


@needs_glpsol
def test_cyclic_storage_single_solve_matches_calliope_rich():
    res = _run("reference_model_rich.json")
    assert res["termination_condition"] == "optimal"
    assert res["objective"] == pytest.approx(2740.9219, rel=2e-4)
    assert res["capacities"]["north::battery"] == pytest.approx(504.351, rel=1e-3)


@needs_glpsol
def test_lossy_storage_matches_calliope_reference_model():
    res = _run("reference_model.json")                 # battery storage_loss 0.01/h
    assert res["objective"] == pytest.approx(541.4126, rel=2e-4)
    assert res["capacities"]["north::battery"] == pytest.approx(15.155, rel=1e-3)


@needs_glpsol
def test_lossy_storage_matches_calliope_rich_lossy():
    res = _run("reference_model_rich_lossy.json")      # battery storage_loss 0.01/h
    assert res["objective"] == pytest.approx(2796.1663, rel=2e-4)
    assert res["capacities"]["north::battery"] == pytest.approx(304.366, rel=1e-3)
    assert res["capacities"]["south::ccgt"] == pytest.approx(182.174, rel=1e-3)
# ─── Free, unbounded capacity is reported at the peak it is used, not the sentinel ──


def _csv(path, header, rows):
    path.write_text("\n".join([",".join(header)] + [",".join(str(v) for v in r) for r in rows]) + "\n",
                    encoding="utf-8")


def test_free_unbounded_capacity_reported_at_peak_use(tmp_path):
    csv_dir, res_dir = tmp_path / "csvs", tmp_path / "results"
    csv_dir.mkdir(); res_dir.mkdir()
    # IMP: free + unbounded (sentinel cap); PV: free but bounded; GAS: has capex
    _csv(csv_dir / "CapitalCost.csv", ["REGION", "TECHNOLOGY", "YEAR", "VALUE"],
         [["R", "IMP", 2021, 0], ["R", "PV", 2021, 0], ["R", "GAS", 2021, 50]])
    _csv(csv_dir / "FixedCost.csv", ["REGION", "TECHNOLOGY", "YEAR", "VALUE"], [["R", "IMP", 2021, 0]])
    _csv(csv_dir / "TotalAnnualMaxCapacity.csv", ["REGION", "TECHNOLOGY", "YEAR", "VALUE"],
         [["R", "IMP", 2021, 999.0], ["R", "PV", 2021, 2.0], ["R", "GAS", 2021, 999.0]])
    _csv(csv_dir / "CapacityToActivityUnit.csv", ["REGION", "TECHNOLOGY", "VALUE"],
         [["R", t, 31.536] for t in ("IMP", "PV", "GAS")])
    _csv(csv_dir / "CapacityFactor.csv", ["REGION", "TECHNOLOGY", "TIMESLICE", "YEAR", "VALUE"],
         [["R", "IMP", "s1d1", 2021, 1.0], ["R", "IMP", "s1d2", 2021, 0.5]])
    _csv(res_dir / "RateOfActivity.csv", ["REGION", "TIMESLICE", "TECHNOLOGY", "MODE_OF_OPERATION", "YEAR", "VALUE"],
         [["R", "s1d1", "IMP", 1, 2021, 31.536 * 3.0],     # 3 GW
          ["R", "s1d2", "IMP", 1, 2021, 31.536 * 2.0],     # 2 GW at CF 0.5 -> needs 4 GW
          ["R", "s1d1", "GAS", 1, 2021, 31.536]])
    assert R._free_unbounded_peak_gw(str(csv_dir), str(res_dir)) == {"IMP": pytest.approx(4.0)}


# ─── Contract: Calliope ids + unmet demand (G1) ──────────────────────────────


def test_contract_keys_mapped_to_calliope_ids():
    md = {"locations": [{"name": "S/E Arica"}, {"name": "Putre"}],
          "technologies": [{"name": "hydro-ror"}, {"name": "13.8 KV"}]}
    c = {"capacities": {"S/E Arica::hydro-ror": 1.0, "S/E Arica::13.8 KV:Putre": 2.0},
         "generation": {"S/E Arica::hydro-ror::electricity": 3.0, "Putre::13.8 KV:S/E Arica::electricity": 4.0},
         "dispatch": {"hydro-ror": [1.0]},
         "costs_by_tech": {"13.8 KV": 5.0},
         "costs_by_location": {"S/E Arica": {"hydro-ror": 6.0}},
         "transmission_flow": {"Putre::S/E Arica": {"from": "Putre", "to": "S/E Arica", "timeseries": [1.0, -2.0]}},
         "tech_metadata": {"13.8 KV": {"parent": "transmission"}},
         "tech_parents": {"13.8 KV": "transmission"},
         "unmet_demand_by_location": {"S/E Arica": 7.0}}
    out = R._to_contract_ids(c, md)
    assert out["capacities"] == {"s_e_arica::hydro-ror": 1.0, "s_e_arica::13_8_KV:putre": 2.0}
    assert out["generation"] == {"s_e_arica::hydro-ror::electricity": 3.0,
                                 "putre::13_8_KV:s_e_arica::electricity": 4.0}
    assert out["dispatch"] == {"hydro-ror": [1.0]}
    assert out["costs_by_tech"] == {"13_8_KV": 5.0}
    assert out["costs_by_location"] == {"s_e_arica": {"hydro-ror": 6.0}}
    # ids re-sorted: putre < s_e_arica keeps the order here
    assert out["transmission_flow"] == {"putre::s_e_arica": {"from": "putre", "to": "s_e_arica",
                                                             "timeseries": [1.0, -2.0]}}
    assert out["tech_metadata"]["13_8_KV"] == {"parent": "transmission"}
    assert out["tech_parents"]["13_8_KV"] == "transmission"
    assert out["unmet_demand_by_location"] == {"s_e_arica": 7.0}


def test_contract_transmission_flow_resorted_after_id_mapping():
    # raw names sort "Zeta" < "alpha"; contract ids "alpha" < "zeta"
    md = {"locations": [{"name": "Zeta"}, {"name": "alpha"}], "technologies": []}
    c = {"transmission_flow": {"Zeta::alpha": {"from": "Zeta", "to": "alpha", "timeseries": [3.0, -1.0]}}}
    out = R._to_contract_ids(c, md)
    assert out["transmission_flow"] == {"alpha::zeta": {"from": "alpha", "to": "zeta", "timeseries": [-3.0, 1.0]}}


@needs_glpsol
def test_unmet_demand_reported_and_penalty_excluded_from_objective():
    md = json.loads((ROOT / "scripts" / "reference_model.json").read_text(encoding="utf-8"))
    next(t for t in md["technologies"] if t["name"] == "solar_pv")["constraints"]["energy_cap_max"] = 50
    lines = []
    with tempfile.TemporaryDirectory() as tmp:
        res = R.run_model(md, tmp, log_fn=lines.append)
    total = res["total_unmet_demand_mwh"]
    assert total > 1000
    assert len(res["unmet_demand_timeseries"]) == 168
    assert sum(res["unmet_demand_timeseries"]) == pytest.approx(total, rel=1e-4)
    assert set(res["unmet_demand_by_location"]) <= {"north", "south"}
    assert sum(res["unmet_demand_by_location"].values()) == pytest.approx(total, rel=1e-4)
    assert res["objective"] < 1e3 * total / 100          # the 1000 EUR/kWh penalty is not in it
    assert res["objective"] == pytest.approx(sum(res["costs_by_tech"].values()), rel=1e-3)
    assert any("WARNING" in l and "unmet demand" in l for l in lines)


@needs_glpsol
def test_no_unmet_keys_when_demand_met():
    with tempfile.TemporaryDirectory() as tmp:
        res = R.run_model(json.loads((ROOT / "scripts" / "reference_model.json").read_text(encoding="utf-8")),
                          tmp, log_fn=lambda line: None)
    assert "total_unmet_demand_mwh" not in res and "unmet_demand_timeseries" not in res



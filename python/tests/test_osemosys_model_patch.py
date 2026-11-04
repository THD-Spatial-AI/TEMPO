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
    assert "param StorageTempoBlock{r in REGION, s in STORAGE}, binary, default 0;" in text
    assert "or StorageTempoBlock[r,s] = 1 then 1 else 0;" in text   # forces the TEMPO block
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


# ─── Chronological parity scheme (one season per day, DaysInDayType = 1) ──────


@pytest.mark.parametrize("raw,n_seasons,chrono", [
    (None, 7, True),                              # 1-week window: chronological by default
    ({"chronological": False}, 1, False),         # forced representative
    ({"seasons": 2, "dayBlocks": 24}, 2, False),  # explicit scheme unchanged
    ({"seasons": 7, "dayBlocks": 24}, 7, True),   # one season per window day = chronological
])
def test_runner_scheme_selection(raw, n_seasons, chrono):
    md = {"modelConfig": {"startDate": "2005-01-01", "endDate": "2005-01-07"}}
    if raw is not None:
        md["modelConfig"]["osemosysScheme"] = raw
    sch = R._parity_scheme(md)
    assert sch["seasons"] == n_seasons and bool(sch.get("chronological")) == chrono


def test_runner_scheme_chronological_override_for_long_window():
    md = {"modelConfig": {"startDate": "2005-01-01", "endDate": "2005-02-28",
                          "osemosysScheme": {"chronological": True}}}
    assert R._parity_scheme(md)["seasons"] == 59
    md["modelConfig"].pop("osemosysScheme")
    assert not R._parity_scheme(md).get("chronological")    # 59 days > threshold


def _tempo_chain(net, loss, start, cyclic):
    """TS1-TS7 of the TEMPO block for one day type per season, DaysInDayType = 1,
    DaySplit = 1/8760 (net = per-hour net charge = rate x DaySplit). Returns the level
    at the end of every hour; for cyclic, start is solved as year start = year end."""
    ret = (1 - loss) ** ((1 / 8760) * 8760)                    # BracketRetention
    days = [net[i:i + 24] for i in range(0, len(net), 24)]

    def run(y0):
        levels, day_start = [], y0
        for day in days:
            first = day_start                                   # TS2
            for h, n in enumerate(day):
                levels.append(ret * first + n)                  # end of bracket h
                first = ret * first + n                         # TS3
            day_net = sum(n * ret ** (23 - h) for h, n in enumerate(day))   # TS1 (RetentionAfter)
            # TS6: DayTypeRetention(n=0) = ret^24, CarryDays(n=0) = 1 for one day
            day_start = ret ** 24 * day_start + 1 * day_net
        return levels, day_start

    if cyclic:   # y0 = a*y0 + b  (TS7); lossless: any y0 works when the window nets to zero
        _, b = run(0.0)
        a = ret ** len(net)
        start = b / (1 - a) if a < 1 else 1.0
    return run(start)[0], start


def _calliope_chain(net, loss, start):
    """Calliope 0.6.8 storage_level: s[t] = (1 - loss)^1 * s[t-1] + charge*eff - discharge/eff."""
    out, s = [], start
    for n in net:
        s = (1 - loss) * s + n
        out.append(s)
    return out


@pytest.mark.parametrize("loss", [0.0, 0.01])
@pytest.mark.parametrize("cyclic", [False, True])
def test_chronological_tempo_chain_reproduces_calliope_hourly_levels(loss, cyclic):
    import math
    net = [math.sin(h / 5.0) - 0.02 * (h % 7) + 0.15 for h in range(72)]
    if cyclic and loss == 0:
        net = [n - sum(net) / len(net) for n in net]           # lossless cycle must net to zero
    tempo, start = _tempo_chain(net, loss, 0.0, cyclic)
    cal = _calliope_chain(net, loss, start)
    assert tempo == pytest.approx(cal, abs=1e-12)
    if cyclic:
        assert cal[-1] == pytest.approx(start)                 # Calliope cyclic: end == start


@needs_glpsol
def test_non_cyclic_storage_chronological_matches_calliope_rich():
    md = json.loads((ROOT / "scripts" / "reference_model_rich.json").read_text(encoding="utf-8"))
    md["modelConfig"]["cyclicStorage"] = False
    with tempfile.TemporaryDirectory() as tmp:
        res = R.run_model(md, tmp, log_fn=lambda line: None)
    # Calliope 0.6.8 on the same model: objective 2783.9922, battery 251.563 kW
    assert res["objective"] == pytest.approx(2783.9922, rel=2e-5)
    assert res["capacities"]["north::battery"] == pytest.approx(251.563, rel=1e-4)


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


# ─── HiGHS route: result CSVs written straight from the solution (no glpsol -r) ──


def test_results_written_from_highs_columns(tmp_path):
    names = ["TotalCapacityAnnual[R,IMP,2021]", "TotalCapacityAnnual[R,GAS,2021]",
             "RateOfActivity[R,s1d1,IMP,1,2021]", "ProductionByTechnology[R,s1d1,IMP,F,2021]",
             "TotalDiscountedCost[R,2021]", "NetChargeWithinDay[R,S,1,1,1,2021]"]
    values = [2.5, 0.0, 31.5, 0.01, 12.0, -3.0]
    out = tmp_path / "glpsol_output.txt"
    assert R._write_results_from_columns(names, values, 12.0, str(tmp_path), str(out))
    assert R._read_csv(str(tmp_path / "TotalCapacityAnnual.csv")) == [
        {"REGION": "R", "TECHNOLOGY": "IMP", "YEAR": "2021", "VALUE": "2.5"}]       # > 0 only, like the tables
    assert R._read_csv(str(tmp_path / "RateOfActivity.csv"))[0]["MODE_OF_OPERATION"] == "1"
    assert R._read_csv(str(tmp_path / "ProductionByTechnology.csv"))[0]["FUEL"] == "F"
    assert R._read_csv(str(tmp_path / "CapitalInvestment.csv")) == []                # header only
    assert R._parse_glpsol_output(str(out)) == ("optimal", 12.0)


def test_results_from_columns_refuses_when_a_result_variable_is_missing(tmp_path):
    assert not R._write_results_from_columns(["Foo[1]"], [1.0], 0.0, str(tmp_path), str(tmp_path / "o.txt"))

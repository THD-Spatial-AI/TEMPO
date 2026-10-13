"""
Tests for adoptnet0_translate.py demand handling — specifically that the OSM
study-area demand (a `file=name:col` resource on the inline power_demand tech)
reaches the per-node carrier CSV, not just the legacy demandProfile path.
"""
import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import adoptnet0_translate as tr


def _read_carrier_csv(root, carrier="electricity"):
    for base, _dirs, files in os.walk(root):
        if f"{carrier}.csv" in files:
            with open(os.path.join(base, f"{carrier}.csv"), encoding="utf-8") as f:
                return f.read().strip().splitlines()
    return None


OSM_DATA = [{"datetime": f"2005-01-01 {h:02d}:00:00", "dem_1": -(10 + h)} for h in range(24)]

TECHS = [{"id": "power_demand", "name": "power_demand",
          "essentials": {"parent": "demand", "carrier": "electricity"}}]  # global: parent only

TIME_SERIES = [{"name": "osm_substation_demand", "fileName": "osm_substation_demand.csv",
                "columns": ["datetime", "dem_1"], "dataColumns": ["dem_1"], "data": OSM_DATA}]


def _write(locations):
    tmp = tempfile.mkdtemp()
    tr._write_node_data(tmp, locations, TECHS, {}, TIME_SERIES, ["electricity"], "2005-01-01", "2005-01-01")
    return _read_carrier_csv(tmp)


def test_osm_file_ref_demand_reaches_carrier_csv():
    locations = [{
        "id": "arica", "name": "Arica",
        "techs": {"power_demand": {"constraints": {"resource": "file=osm_substation_demand.csv:dem_1"}}},
    }]
    rows = _write(locations)
    assert rows is not None, "electricity.csv not written"
    demands = [r.split(";")[1] for r in rows[1:]]
    assert all(d != "" for d in demands), "demand column is empty — file ref not resolved"
    assert float(demands[0]) == pytest.approx(0.010)  # |−10| kW → MW
    assert round(float(demands[-1]), 6) in (0.033, 0.01)  # last hour or tiled wrap


def test_scalar_resource_demand_also_works():
    locations = [{
        "id": "n", "name": "Node",
        "techs": {"power_demand": {"constraints": {"resource": -42}}},
    }]
    rows = _write(locations)
    demands = [r.split(";")[1] for r in rows[1:]]
    assert all(float(d) == pytest.approx(0.042) for d in demands)


def test_no_demand_leaves_column_blank():
    locations = [{"id": "n", "name": "Node", "techs": {}}]
    rows = _write(locations)
    demands = [r.split(";")[1] for r in rows[1:]]
    assert all(d == "" for d in demands)


REF = Path(__file__).parent.parent.parent / "scripts" / "reference_model.json"


def _node_techs(model_dir, node):
    p = Path(model_dir) / "period1" / "node_data" / node / "Technologies.json"
    return json.loads(p.read_text(encoding="utf-8"))["new"]


def test_techs_placed_only_where_location_lists_them():
    md = json.loads(REF.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    assert sorted(_node_techs(tmp, "north")) == ["battery", "solar_pv"]
    assert _node_techs(tmp, "south") == []


def _tech_json(model_dir, node, tid):
    p = Path(model_dir) / "period1" / "node_data" / node / "technology_data" / f"{tid}.json"
    return json.loads(p.read_text(encoding="utf-8"))


def test_units_are_true_mw_and_capex_scaled_for_window():
    md = json.loads(REF.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp, capex_scale=168 / 8760)
    solar = _tech_json(tmp, "north", "solar_pv")
    assert solar["size_max"] == pytest.approx(2.0)                      # 2000 kW → 2 MW
    assert solar["Economics"]["unit_CAPEX"] == pytest.approx(900_000 * 168 / 8760, rel=1e-4)
    assert solar["Economics"]["OPEX_fixed"] == pytest.approx(10 / 900)   # fraction of capex, unscaled
    rows = _read_carrier_csv(tmp)
    assert float(rows[1].split(";")[1]) == pytest.approx(0.100)         # 100 kW → 0.1 MW


def test_export_path_keeps_unscaled_capex():
    md = json.loads(REF.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    assert _tech_json(tmp, "north", "solar_pv")["Economics"]["unit_CAPEX"] == pytest.approx(900_000)


def test_location_override_reaches_tech_json():
    md = json.loads(REF.read_text(encoding="utf-8"))
    md["locations"][0]["techs"]["solar_pv"] = {"constraints": {"energy_cap_max": 500}}
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    assert _tech_json(tmp, "north", "solar_pv")["size_max"] == pytest.approx(0.5)


def test_one_network_per_link_with_costs_and_per_km_loss():
    md = json.loads(REF.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp, capex_scale=168 / 8760)
    netw = json.loads((Path(tmp) / "period1" / "Networks.json").read_text(encoding="utf-8"))
    assert netw["new"] == ["grid_link__north__south"]
    data = json.loads((Path(tmp) / "period1" / "network_data" / "grid_link__north__south.json")
                      .read_text(encoding="utf-8"))
    eco, perf = data["Economics"], data["Performance"]
    assert eco["gamma2"] == pytest.approx(0.0)
    assert eco["gamma4"] == pytest.approx(0.5 * 1000 * 168 / 8760)   # €/kW/km → €/MW/km, scaled
    assert eco["discount_rate"] == 0.05 and eco["lifetime"] == 40
    assert perf["loss"] == pytest.approx((1 - 0.97) / 400)            # per km
    assert perf["bidirectional_network"] == 1
    assert data["size_max"] == pytest.approx(3.0)                     # 3000 kW → 3 MW
    conn = (Path(tmp) / "period1" / "network_topology" / "new" / "grid_link__north__south"
            / "connection.csv").read_text(encoding="utf-8").splitlines()
    assert conn[1] == "north;0;1" and conn[2] == "south;1;0"


def test_storage_capex_model4_and_eff_each_way():
    md = json.loads(REF.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp, capex_scale=168 / 8760)
    b = _tech_json(tmp, "north", "battery")
    s = 168 / 8760
    assert b["Economics"]["CAPEX_model"] == 4
    assert b["Economics"]["unit_CAPEX"] == pytest.approx(300_000 * s)          # €/MWh
    assert b["Flexibility"]["power_energy_ratio"] == "flexratio"
    assert b["Flexibility"]["capex_discharging_power"] == pytest.approx(100_000 * s)
    assert b["Flexibility"]["capex_charging_power"] == 0
    perf = b["Performance"]["performance"]
    assert perf["eta_in"] == pytest.approx(0.95) and perf["eta_out"] == pytest.approx(0.95)
    assert perf["lambda"] == pytest.approx(0.01)
    assert b["size_max"] == pytest.approx(5.0)                                   # 5000 kWh → 5 MWh


RICH = Path(__file__).parent.parent.parent / "scripts" / "reference_model_rich.json"


def test_compute_capfactors_from_location_override():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    cf = tr.compute_capfactors(md, [])
    assert set(cf) == {("north", "solar_pv"), ("east", "solar_pv")}
    assert len(cf[("north", "solar_pv")]) == 168
    assert cf[("north", "solar_pv")][12] == pytest.approx(0.72)
    assert ("south", "gas_supply") not in cf          # no resource → unconstrained (CF 1)


def test_demand_written_only_to_its_own_carrier():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    cdir = Path(tmp) / "period1" / "node_data" / "north" / "carrier_data"
    gas = (cdir / "gas.csv").read_text(encoding="utf-8").splitlines()[1:]
    elec = (cdir / "electricity.csv").read_text(encoding="utf-8").splitlines()[1:]
    assert all(r.split(";")[1] == "" for r in gas)
    assert all(r.split(";")[1] != "" for r in elec)


def test_default_interest_rate_is_calliope_zero():
    md = json.loads(REF.read_text(encoding="utf-8"))
    for t in md["technologies"]:
        (t.get("costs") or {}).get("monetary", {}).pop("interest_rate", None)
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    assert _tech_json(tmp, "north", "solar_pv")["Economics"]["discount_rate"] == 0.0
    net = json.loads((Path(tmp) / "period1" / "network_data" / "grid_link__north__south.json")
                     .read_text(encoding="utf-8"))
    assert net["Economics"]["discount_rate"] == 0.0


def test_conversion_om_prod_is_per_output():
    # AdOpT charges CONV OPEX_variable on the main input; Calliope om_prod is per output.
    md = json.loads(RICH.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    ccgt = _tech_json(tmp, "south", "ccgt")
    assert ccgt["Economics"]["OPEX_variable"] == pytest.approx(0.004 * 1000 * 0.55)


def test_storage_om_annual_folded_into_power_capex():
    from engine_common import annuity
    md = json.loads(RICH.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    s = 168 / 8760
    tr.build_model_dir(md, tmp, capex_scale=s)
    b = _tech_json(tmp, "north", "battery")
    expected = (80 + 2 / annuity(0.05, 15)) * 1000 * s
    assert b["Flexibility"]["capex_discharging_power"] == pytest.approx(expected, rel=1e-6)


def test_storage_power_caps():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    assert tr.storage_power_caps(md) == {("north", "battery"): pytest.approx(1.0)}


# --- Phase 3 review fixes -------------------------------------------------------

def test_short_duration_storage_not_capped_by_size():
    md = json.loads(REF.read_text(encoding="utf-8"))
    bat = next(t for t in md["technologies"] if t["name"] == "battery")
    bat["constraints"].update({"energy_cap_max": 10_000, "storage_cap_max": 5_000})  # 10 MW / 5 MWh
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    b = _tech_json(tmp, "north", "battery")
    flex = b["Flexibility"]
    # power ≤ rate × size must not bind: a 0.5 h battery at full power needs rate ≥ 2;
    # a tiny 0.1 MWh build of it at 10 MW needs rate ≥ 100 — the cap is a loose relaxation.
    assert flex["discharge_rate"] >= 1e3 and flex["charge_rate"] >= 1e3
    # Calliope is an LP: no one-direction cut/disjunction (big-M) on storage
    assert b["Performance"]["allow_only_one_direction"] == 0


def test_unbounded_caps_use_large_sentinel_and_report():
    md = json.loads(REF.read_text(encoding="utf-8"))
    solar = next(t for t in md["technologies"] if t["name"] == "solar_pv")
    solar["constraints"]["energy_cap_max"] = "inf"
    link = next(t for t in md["technologies"] if t["name"] == "grid_link")
    del link["constraints"]["energy_cap_max"]
    tmp = tempfile.mkdtemp()
    _, report = tr.build_model_dir(md, tmp)
    assert _tech_json(tmp, "north", "solar_pv")["size_max"] == pytest.approx(1e6)  # MW
    net = json.loads((Path(tmp) / "period1" / "network_data" / "grid_link__north__south.json")
                     .read_text(encoding="utf-8"))
    assert net["size_max"] == pytest.approx(1e6)
    assert net["Performance"]["bidirectional_network_precise"] == 0   # LP, no big-M
    assert any("north/solar_pv" in r and "unbounded" in r for r in report)
    assert any("grid_link" in r and "unbounded" in r for r in report)


def _assignment_payload():
    md = json.loads(REF.read_text(encoding="utf-8"))
    for t in md["technologies"]:
        t["id"] = "t_" + t["name"]
    solar = next(t for t in md["technologies"] if t["name"] == "solar_pv")
    solar["constraints"].update({"resource": 0.3, "resource_unit": "energy_per_cap"})
    md["locationTechAssignments"] = {"north": [{"id": "t_solar_pv"}], "south": ["t_battery", "t_solar_pv"]}
    md["locations"][0]["techs"] = {"t_solar_pv": {"constraints": {"resource": 0.5}}, "power_demand": None}
    md["locations"][1]["techs"] = {"power_demand": None}
    return md


def test_assignment_mode_placement_shared_by_capfactors_and_storage_caps():
    md = _assignment_payload()
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    assert _node_techs(tmp, "north") == ["solar_pv"]
    assert sorted(_node_techs(tmp, "south")) == ["battery", "solar_pv"]
    cf = tr.compute_capfactors(md, [])
    assert cf[("north", "solar_pv")][0] == pytest.approx(0.5)   # location override (by id)
    assert cf[("south", "solar_pv")][0] == pytest.approx(0.3)   # tech-level resource
    assert tr.storage_power_caps(md) == {("south", "battery"): pytest.approx(1.0)}


def test_multi_carrier_demand_written_per_carrier():
    techs = TECHS + [{"id": "heat_demand", "name": "heat_demand",
                      "essentials": {"parent": "demand", "carrier": "heat"},
                      "constraints": {"resource": -10}}]                     # tech-level resource
    locations = [{"id": "n", "name": "Node",
                  "techs": {"power_demand": {"constraints": {"resource": -42}}, "heat_demand": None}}]
    tmp = tempfile.mkdtemp()
    tr._write_node_data(tmp, locations, techs, {}, TIME_SERIES, ["electricity", "heat"],
                        "2005-01-01", "2005-01-01")
    elec = _read_carrier_csv(tmp, "electricity")
    heat = _read_carrier_csv(tmp, "heat")
    assert all(float(r.split(";")[1]) == pytest.approx(0.042) for r in elec[1:])
    assert all(float(r.split(";")[1]) == pytest.approx(0.010) for r in heat[1:])


def test_transmission_om_prod_per_delivered_and_om_annual_folded():
    from engine_common import annuity
    md = json.loads(REF.read_text(encoding="utf-8"))
    link = next(t for t in md["technologies"] if t["name"] == "grid_link")
    link["costs"]["monetary"].update({"om_prod": 0.002, "om_annual": 1.0})
    s = 168 / 8760
    tmp = tempfile.mkdtemp()
    _, report = tr.build_model_dir(md, tmp, capex_scale=s)
    eco = json.loads((Path(tmp) / "period1" / "network_data" / "grid_link__north__south.json")
                     .read_text(encoding="utf-8"))["Economics"]
    assert eco["OPEX_variable"] == pytest.approx(0.002 * 0.97 * 1000)   # AdOpT charges sent flow
    # Calliope pays om_annual on both link ends; AdOpT counts gamma2 once per pair
    assert eco["gamma2"] == pytest.approx(2 * 1.0 / annuity(0.05, 40) * 1000 * s, rel=1e-6)
    assert not any("om_annual" in r and "dropped" in r for r in report)


def test_duplicate_links_get_distinct_networks():
    md = json.loads(REF.read_text(encoding="utf-8"))
    md["links"].append(dict(md["links"][0]))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    netw = json.loads((Path(tmp) / "period1" / "Networks.json").read_text(encoding="utf-8"))
    assert netw["new"] == ["grid_link__north__south", "grid_link__north__south__2"]
    assert tr.network_names(md["links"], md["technologies"]) == {
        "grid_link__north__south": "grid_link", "grid_link__north__south__2": "grid_link"}


def test_import_no_phantom_demand_and_conv_om_prod_reversed():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    model, report = tr.adoptnet0_to_internal(tmp)
    names = {t["name"] for t in model["technologies"]}
    assert "power_demand" in names and "gas_demand" not in names
    ccgt = next(t for t in model["technologies"] if t["name"] == "ccgt")
    assert ccgt["costs"]["monetary"]["om_prod"] == pytest.approx(0.004)
    assert any("storage" in r and "om_annual" in r for r in report)


def test_assignment_mode_demand_tech_contributes_demand():
    techs = [{"id": "t_dem", "name": "elec_demand",
              "essentials": {"parent": "demand", "carrier": "electricity"},
              "constraints": {"resource": -20}}]
    locations = [{"id": "n", "name": "Node", "techs": {}}]
    tmp = tempfile.mkdtemp()
    tr._write_node_data(tmp, locations, techs, {"n": ["t_dem"]}, [], ["electricity"],
                        "2005-01-01", "2005-01-01")
    rows = _read_carrier_csv(tmp)
    assert all(float(r.split(";")[1]) == pytest.approx(0.020) for r in rows[1:])


def test_import_default_interest_rate_is_calliope_zero():
    t = tr._parse_tech_json("x", {"tec_type": "RES", "Economics": {}}, [])
    assert t["costs"]["monetary"]["interest_rate"] == 0.0


# --- energy_cap_equals / energy_cap_min (Calliope 0.6 fixed / floor capacity) ----

def test_energy_cap_equals_fixes_size_no_sentinel():
    md = json.loads(REF.read_text(encoding="utf-8"))
    solar = next(t for t in md["technologies"] if t["name"] == "solar_pv")
    del solar["constraints"]["energy_cap_max"]                     # shadow tech: no max
    north = next(l for l in md["locations"] if l["name"] == "north")
    north["techs"]["solar_pv"] = {"constraints": {"energy_cap_equals": 349.5}}
    north["techs"]["battery"] = {"constraints": {"energy_cap_equals": 15.0,
                                                 "storage_cap_min": 40.0}}
    link = next(t for t in md["technologies"] if t["name"] == "grid_link")
    link["constraints"]["energy_cap_min"] = 500
    tmp = tempfile.mkdtemp()
    _, report = tr.build_model_dir(md, tmp)
    pv = _tech_json(tmp, "north", "solar_pv")
    assert pv["size_min"] == pytest.approx(0.3495) and pv["size_max"] == pytest.approx(0.3495)
    assert not any("north/solar_pv" in r and "unbounded" in r for r in report)
    b = _tech_json(tmp, "north", "battery")
    assert b["size_min"] == pytest.approx(0.04) and b["size_max"] == pytest.approx(5.0)
    net = json.loads((Path(tmp) / "period1" / "network_data" / "grid_link__north__south.json")
                     .read_text(encoding="utf-8"))
    assert net["size_min"] == pytest.approx(0.5) and net["size_max"] == pytest.approx(3.0)
    assert tr.storage_power_caps(md) == {("north", "battery"): pytest.approx(0.015)}
    assert tr.storage_power_mins(md) == {("north", "battery"): pytest.approx(0.015)}


def test_storage_power_mins_empty_without_min():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    assert tr.storage_power_mins(md) == {}


def test_om_annual_without_capex_folded_into_capex():
    # Myopic shadow tech: capex zeroed, om_annual kept — must still be charged.
    from engine_common import annuity
    md = json.loads(REF.read_text(encoding="utf-8"))
    solar = next(t for t in md["technologies"] if t["name"] == "solar_pv")
    solar["costs"]["monetary"]["energy_cap"] = 0
    tmp = tempfile.mkdtemp()
    s = 168 / 8760
    _, report = tr.build_model_dir(md, tmp, capex_scale=s)
    econ = _tech_json(tmp, "north", "solar_pv")["Economics"]
    assert econ["unit_CAPEX"] == pytest.approx(10 / annuity(0.05, 25) * 1000 * s, rel=1e-6)
    assert econ["OPEX_fixed"] == 0
    assert not any("om_annual" in r and "dropped" in r for r in report)


def test_om_annual_above_capex_folded_exactly():
    # OPEX_fixed (fraction of capex) would need > 1.0 here — fold om_annual / CRF instead.
    from engine_common import annuity
    md = json.loads(REF.read_text(encoding="utf-8"))
    solar = next(t for t in md["technologies"] if t["name"] == "solar_pv")
    solar["costs"]["monetary"].update({"energy_cap": 5, "om_annual": 10})
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    econ = _tech_json(tmp, "north", "solar_pv")["Economics"]
    assert econ["unit_CAPEX"] == pytest.approx((5 + 10 / annuity(0.05, 25)) * 1000, rel=1e-6)
    assert econ["OPEX_fixed"] == 0


def test_per_link_capacity_sets_network_size():
    md = json.loads(REF.read_text(encoding="utf-8"))
    md["links"][0].update({"capacity": 400, "capacityKey": "energy_cap_equals"})
    tmp = tempfile.mkdtemp()
    _, report = tr.build_model_dir(md, tmp)
    net = json.loads((Path(tmp) / "period1" / "network_data" / "grid_link__north__south.json")
                     .read_text(encoding="utf-8"))
    assert net["size_min"] == pytest.approx(0.4) and net["size_max"] == pytest.approx(0.4)

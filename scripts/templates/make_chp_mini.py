"""Build scripts/templates/chp_mini.json: a tiny model that exercises Calliope conversion_plus
(CHP with a heat ratio and electricity export revenue; a heat pump with a secondary input) so every
engine's multi-carrier translation can be compared with Calliope 0.6.8.

    python scripts/templates/make_chp_mini.py [grid_om_con] [hp]

With `hp` the CHP is disabled and gas is expensive, so the heat pump (and its secondary ground-heat
input) is the cheapest way to make heat — writes chp_mini_hp.json instead.
"""
import json
import sys
from pathlib import Path

grid_price = float(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] != "hp" else 0.30
heat_pump_case = "hp" in sys.argv[1:]


def tech(name, parent, constraints=None, costs=None, **ess):
    return {"name": name, "essentials": {"name": name, "parent": parent, **ess},
            "constraints": constraints or {}, "costs": {"monetary": {"interest_rate": 0.1, **(costs or {})}}}


model = {
    "name": "CHP mini",
    "locations": [{"name": "a", "latitude": 52.0, "longitude": 0.1,
                   "techs": {t: None for t in ("supply_gas", "supply_grid", "chp", "boiler", "gshp", "ground_heat",
                                               "demand_elec", "demand_heat")}}],
    "links": [], "parameters": [], "timeSeries": [], "overrides": {}, "scenarios": {},
    "metadata": {"source": "calliope_yaml", "modelType": "calliope"},
    "locationTechAssignments": {}, "solver": "highs",
    "modelConfig": {"mode": "plan", "startDate": "2015-01-01", "endDate": "2015-01-02", "ensureFeasibility": True,
                    "cyclicStorage": False},
    "technologies": [
        tech("supply_gas", "supply", {"resource": "inf", "energy_cap_max": 10000, "lifetime": 15},
             {"om_con": 0.03}, carrier_out="gas"),
        tech("supply_grid", "supply", {"resource": "inf", "energy_cap_max": 1000, "lifetime": 15},
             {"om_con": grid_price}, carrier_out="electricity"),
        tech("chp", "conversion_plus",
             {"energy_cap_max": 500, "energy_eff": 0.4, "lifetime": 15, "export_carrier": "electricity",
              "carrier_ratios": {"carrier_out_2": {"heat": 0.8}}},
             {"energy_cap": 300, "om_prod": 0.004, "export": -0.10},
             carrier_in="gas", carrier_out="electricity", primary_carrier_out="electricity", carrier_out_2="heat"),
        tech("boiler", "conversion", {"energy_cap_max": 500, "energy_eff": 0.8, "lifetime": 15},
             {"energy_cap": 40}, carrier_in="gas", carrier_out="heat"),
        tech("gshp", "conversion_plus", {"energy_cap_max": 500, "energy_eff": 4.0, "lifetime": 15},
             {"energy_cap": 200}, carrier_in="electricity", carrier_out="heat",
             primary_carrier_in="electricity", primary_carrier_out="heat", carrier_in_2="low_t_heat"),
        tech("ground_heat", "supply", {"resource": "inf", "energy_cap_max": 10000, "lifetime": 15},
             {}, carrier_out="low_t_heat"),
        tech("demand_elec", "demand", {"resource": -150}, {}, carrier_in="electricity"),
        tech("demand_heat", "demand", {"resource": -120}, {}, carrier_in="heat"),
    ],
}
if heat_pump_case:
    for t in model["technologies"]:
        if t["name"] == "chp":
            t["constraints"]["energy_cap_max"] = 0
        if t["name"] == "supply_gas":
            t["costs"]["monetary"]["om_con"] = 0.50
    model["name"] = "CHP mini (heat pump case)"
out = Path(__file__).with_name("chp_mini_hp.json" if heat_pump_case else "chp_mini.json")
out.write_text(json.dumps(model, indent=1), encoding="utf-8")
print(f"wrote {out}")

"""
OSeMOSYS translation: TEMPO internal model → otoole CSV dataset.

Design decisions:
  - Single REGION ("REGION1"). Transmission is encoded as bidirectional
    conversion tech pairs between location-specific fuels, not via
    OSeMOSYS TradeRoute parameters (simpler, universally supported by otoole).
  - Location-suffixed IDs: technology "{LOC}_{TID}", fuel "{LOC}_{CARRIER}".
  - Demand encoded via SpecifiedAnnualDemand + SpecifiedDemandProfile
    (not as technologies). The 24-element demandProfile is tiled to fill
    the model period, then aggregated to timeslices.
  - Storage encoded as a charge+discharge technology pair connected by a
    virtual stored-energy fuel "{LOC}_{TID}_STORED". This avoids needing
    OSeMOSYS STORAGE objects and keeps MODE_OF_OPERATION = {1} only.
    Round-trip efficiency is split as sqrt(eff) per direction.
    Storage energy cost (storage_cap EUR/kWh) is not mapped to CapitalCost
    — it would require a C-rate assumption; noted in translation report.
  - Single model YEAR = start-year of the model period.
  - Timeslices from osemosys_timeslices (default 4 seasons × 3 day-parts = 12 slices).
  - CapacityFactor defaults to 1.0 for all techs and timeslices; hourly
    resource profiles are not yet aggregated (noted in report when present).

Unit conventions (TEMPO → otoole):
  energy_cap_max  kW     → TotalAnnualMaxCapacity  GW      (÷ 1 000 000)
  energy_cap      EUR/kW → CapitalCost             M€/GW   (× 1)
  om_annual       EUR/kW → FixedCost               M€/GW   (× 1)
  om_prod         EUR/kWh → VariableCost           M€/PJ   (× 277.778)
  storage_cap     EUR/kWh → (not mapped, see above)
  kW demand × n_hours    → SpecifiedAnnualDemand   PJ      (× 3.6e-9)
  CapacityToActivityUnit = 31.536  (1 GW × 8760 h = 31.536 PJ at 100% CF)
"""

from __future__ import annotations

import csv as _csv
import itertools
import math
import os
import re
import sys
from pathlib import Path

_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

import osemosys_timeslices as timeslices

# ─── Constants ───────────────────────────────────────────────────────────────

REGION = "REGION1"
CAPACITY_TO_ACTIVITY = 31.536   # GW × yr → PJ at 100% CF
_KWH_TO_PJ = 3.6e-9
_EUR_KW_TO_M_EUR_GW = 1.0      # 1 EUR/kW = 1 M€/GW (unit coincidence)
_EUR_KWH_TO_M_EUR_PJ = 277.778
_LARGE_CAP_GW = 999.0           # stand-in for unconstrained capacity


# ─── Utilities ───────────────────────────────────────────────────────────────

def _sid(name: str) -> str:
    """Make a safe OSeMOSYS identifier (uppercase, underscores only)."""
    s = re.sub(r"[^A-Za-z0-9]", "_", str(name).strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return (s or "UNKNOWN").upper()


def _float(val, default: float = 0.0) -> float:
    if val is None:
        return default
    try:
        v = float(val)
        return default if (math.isinf(v) or math.isnan(v) or v >= 1e13) else v
    except (TypeError, ValueError):
        return default


def _parent(tech: dict) -> str:
    ess = tech.get("essentials") or {}
    return (tech.get("parent") or ess.get("parent") or "supply").lower()


def _carrier_out(tech: dict) -> str:
    ess = tech.get("essentials") or {}
    for key in ("carrier_out", "carrier"):
        val = ess.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip().lower()
        if isinstance(val, dict):
            first = next(iter(val), None)
            if first:
                return str(first).lower()
        if isinstance(val, list) and val:
            return str(val[0]).lower()
    return "electricity"


def _carrier_in(tech: dict) -> str:
    ess = tech.get("essentials") or {}
    for key in ("carrier_in", "carrier"):
        val = ess.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip().lower()
        if isinstance(val, dict):
            first = next(iter(val), None)
            if first:
                return str(first).lower()
        if isinstance(val, list) and val:
            return str(val[0]).lower()
    return "electricity"


def _write_csv(path: str, fieldnames: list, rows: list) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = _csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def _resolve_timeseries(ref: str, ts_list: list) -> list:
    """Return hourly kW values from a timeSeries entry by id or filename."""
    for ts in ts_list:
        fname = str(ts.get("fileName") or ts.get("file") or "")
        ts_id = str(ts.get("id") or ts.get("modelId") or "")
        if ref in (fname, ts_id, fname.removesuffix(".csv")):
            data = ts.get("data") or []
            if not data:
                return []
            if isinstance(data[0], (list, tuple)):
                return [_float(row[1] if len(row) > 1 else row[0]) for row in data]
            return [_float(v) for v in data]
    return []


# ─── Public API ──────────────────────────────────────────────────────────────

def translate_model(model_data: dict, csv_dir: str, scheme: dict | None = None) -> tuple:
    """
    Write otoole-compatible CSV dataset from a TEMPO model dict.

    Parameters
    ----------
    model_data : dict   TEMPO model (as stored in SQLite / returned by API)
    csv_dir    : str    Output directory; will be created if absent.
    scheme     : dict   Timeslice scheme {"seasons": N, "dayBlocks": M}.
                        Defaults to 4×3 (12 slices).

    Returns
    -------
    (csv_dir, report) where report is a list of translation note strings.
    """
    if scheme is None:
        scheme = timeslices.default_scheme()

    report: list[str] = []
    os.makedirs(csv_dir, exist_ok=True)

    # ── Model metadata ────────────────────────────────────────────────────────
    model_config = model_data.get("modelConfig") or {}
    start_date = (model_config.get("startDate") or "2024-01-01")[:10]
    end_date = (model_config.get("endDate") or "2024-12-31")[:10]
    year = int(start_date[:4])

    # Hours in model period
    try:
        from datetime import date as _date
        d0 = _date.fromisoformat(start_date)
        d1 = _date.fromisoformat(end_date)
        n_hours = (d1 - d0).days * 24 + 24
    except Exception:
        n_hours = 8760

    labels = timeslices.slice_labels(scheme)
    year_split = timeslices.year_split_for_n_hours(n_hours, scheme)

    # ── Lookups ───────────────────────────────────────────────────────────────
    technologies = model_data.get("technologies") or []
    locations = model_data.get("locations") or []
    links = model_data.get("links") or []
    ts_store = model_data.get("timeSeries") or []

    by_name = {t.get("name", ""): t for t in technologies}
    by_id = {str(t.get("id", "")): t for t in technologies}

    def _find(ref) -> dict | None:
        return by_name.get(str(ref)) or by_id.get(str(ref))

    # ── Collect all carriers ──────────────────────────────────────────────────
    all_carriers: set[str] = set()
    for tech in technologies:
        p = _parent(tech)
        if p == "demand":
            all_carriers.add(_carrier_in(tech))
        elif p in ("supply", "supply_plus"):
            all_carriers.add(_carrier_out(tech))
        elif p in ("conversion", "conversion_plus"):
            all_carriers.add(_carrier_in(tech))
            all_carriers.add(_carrier_out(tech))
        elif p == "storage":
            ess = tech.get("essentials") or {}
            all_carriers.add((ess.get("carrier") or "electricity").lower())
        elif p == "transmission":
            all_carriers.add(_carrier_out(tech))
    for lnk in links:
        t = _find(lnk.get("tech") or "")
        if t:
            all_carriers.add(_carrier_out(t))
    if not all_carriers:
        all_carriers = {"electricity"}

    # Location-specific fuels
    loc_names = [loc.get("name") or loc.get("id", f"L{i}") for i, loc in enumerate(locations)]
    loc_fuels: set[str] = {f"{_sid(ln)}_{_sid(c)}" for ln in loc_names for c in all_carriers}

    # ── Parameter accumulators ────────────────────────────────────────────────
    osem_techs: list[str] = []
    cap_cost: list[dict] = []
    fix_cost: list[dict] = []
    var_cost: list[dict] = []
    op_life: list[dict] = []
    cap_max: list[dict] = []
    inp_act: list[dict] = []
    out_act: list[dict] = []
    cap2act: list[dict] = []
    avail: list[dict] = []
    resid_cap: list[dict] = []
    cap_factor: list[dict] = []

    # ── Process each location × tech ──────────────────────────────────────────
    for loc in locations:
        loc_name = loc.get("name") or loc.get("id", "loc")
        loc_s = _sid(loc_name)
        loc_techs = loc.get("techs") or {}

        for tech_ref in loc_techs:
            tech = _find(tech_ref)
            if tech is None:
                report.append(f"WARNING: tech '{tech_ref}' at '{loc_name}' not found — skipped.")
                continue

            p = _parent(tech)
            if p == "demand":
                continue  # demand → SpecifiedAnnualDemand, handled below

            tid = tech.get("name") or tech.get("id") or "tech"
            tid_s = _sid(tid)
            constr = tech.get("constraints") or {}
            costs = (tech.get("costs") or {}).get("monetary") or {}

            cap_max_kw = _float(constr.get("energy_cap_max"), 1e13)
            cap_max_gw = min(cap_max_kw / 1e6, _LARGE_CAP_GW)
            if cap_max_kw >= 1e13:
                report.append(f"{loc_name}/{tid}: energy_cap_max=∞ → capped at {_LARGE_CAP_GW} GW.")

            capex = _float(costs.get("energy_cap")) * _EUR_KW_TO_M_EUR_GW
            opex_f = _float(costs.get("om_annual")) * _EUR_KW_TO_M_EUR_GW
            opex_v = _float(costs.get("om_prod")) * _EUR_KWH_TO_M_EUR_PJ
            life = max(1, int(_float(constr.get("lifetime"), 25)))
            eff = min(1.0, max(0.01, _float(constr.get("energy_eff"), 1.0)))

            if p in ("supply", "supply_plus"):
                tech_id = f"{loc_s}_{tid_s}"
                cout = f"{loc_s}_{_sid(_carrier_out(tech))}"
                osem_techs.append(tech_id)
                cap_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(capex, 6)})
                fix_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(opex_f, 6)})
                var_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": round(opex_v, 6)})
                op_life.append({"REGION": REGION, "TECHNOLOGY": tech_id, "VALUE": life})
                cap_max.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(cap_max_gw, 9)})
                out_act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "FUEL": cout, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": 1.0})
                cap2act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "VALUE": CAPACITY_TO_ACTIVITY})
                avail.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 1.0})
                resid_cap.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 0.0})
                for lbl in labels:
                    cap_factor.append({"REGION": REGION, "TECHNOLOGY": tech_id, "TIMESLICE": lbl, "YEAR": year, "VALUE": 1.0})
                if constr.get("resource") is not None:
                    report.append(f"{loc_name}/{tid}: resource profile not aggregated to CF — CapacityFactor=1.0.")

            elif p in ("conversion", "conversion_plus"):
                tech_id = f"{loc_s}_{tid_s}"
                cin = f"{loc_s}_{_sid(_carrier_in(tech))}"
                cout = f"{loc_s}_{_sid(_carrier_out(tech))}"
                osem_techs.append(tech_id)
                cap_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(capex, 6)})
                fix_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(opex_f, 6)})
                var_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": round(opex_v, 6)})
                op_life.append({"REGION": REGION, "TECHNOLOGY": tech_id, "VALUE": life})
                cap_max.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(cap_max_gw, 9)})
                inp_act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "FUEL": cin, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": round(1.0 / eff, 6)})
                out_act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "FUEL": cout, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": 1.0})
                cap2act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "VALUE": CAPACITY_TO_ACTIVITY})
                avail.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 1.0})
                resid_cap.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 0.0})
                for lbl in labels:
                    cap_factor.append({"REGION": REGION, "TECHNOLOGY": tech_id, "TIMESLICE": lbl, "YEAR": year, "VALUE": 1.0})

            elif p == "storage":
                ess = tech.get("essentials") or {}
                carrier = (ess.get("carrier") or "electricity").lower()
                fuel = f"{loc_s}_{_sid(carrier)}"
                stored_fuel = f"{loc_s}_{tid_s}_STORED"
                ch_id = f"{loc_s}_{tid_s}_CH"
                dc_id = f"{loc_s}_{tid_s}_DC"
                stor_cap_max_gw = min(_float(constr.get("energy_cap_max"), 1e13) / 1e6, _LARGE_CAP_GW)
                eff_rt = min(1.0, max(0.01, _float(constr.get("energy_eff"), 0.9)))
                eff_one_way = math.sqrt(eff_rt)
                stor_life = max(1, int(_float(constr.get("lifetime"), 15)))

                loc_fuels.add(stored_fuel)

                # Charge tech
                osem_techs.append(ch_id)
                cap_cost.append({"REGION": REGION, "TECHNOLOGY": ch_id, "YEAR": year, "VALUE": round(capex, 6)})
                fix_cost.append({"REGION": REGION, "TECHNOLOGY": ch_id, "YEAR": year, "VALUE": round(opex_f, 6)})
                var_cost.append({"REGION": REGION, "TECHNOLOGY": ch_id, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": 0.0})
                op_life.append({"REGION": REGION, "TECHNOLOGY": ch_id, "VALUE": stor_life})
                cap_max.append({"REGION": REGION, "TECHNOLOGY": ch_id, "YEAR": year, "VALUE": round(stor_cap_max_gw, 9)})
                inp_act.append({"REGION": REGION, "TECHNOLOGY": ch_id, "FUEL": fuel, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": round(1.0 / eff_one_way, 6)})
                out_act.append({"REGION": REGION, "TECHNOLOGY": ch_id, "FUEL": stored_fuel, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": 1.0})
                cap2act.append({"REGION": REGION, "TECHNOLOGY": ch_id, "VALUE": CAPACITY_TO_ACTIVITY})
                avail.append({"REGION": REGION, "TECHNOLOGY": ch_id, "YEAR": year, "VALUE": 1.0})
                resid_cap.append({"REGION": REGION, "TECHNOLOGY": ch_id, "YEAR": year, "VALUE": 0.0})
                for lbl in labels:
                    cap_factor.append({"REGION": REGION, "TECHNOLOGY": ch_id, "TIMESLICE": lbl, "YEAR": year, "VALUE": 1.0})

                # Discharge tech
                osem_techs.append(dc_id)
                cap_cost.append({"REGION": REGION, "TECHNOLOGY": dc_id, "YEAR": year, "VALUE": 0.0})
                fix_cost.append({"REGION": REGION, "TECHNOLOGY": dc_id, "YEAR": year, "VALUE": 0.0})
                var_cost.append({"REGION": REGION, "TECHNOLOGY": dc_id, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": round(opex_v, 6)})
                op_life.append({"REGION": REGION, "TECHNOLOGY": dc_id, "VALUE": stor_life})
                cap_max.append({"REGION": REGION, "TECHNOLOGY": dc_id, "YEAR": year, "VALUE": round(stor_cap_max_gw, 9)})
                inp_act.append({"REGION": REGION, "TECHNOLOGY": dc_id, "FUEL": stored_fuel, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": round(1.0 / eff_one_way, 6)})
                out_act.append({"REGION": REGION, "TECHNOLOGY": dc_id, "FUEL": fuel, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": 1.0})
                cap2act.append({"REGION": REGION, "TECHNOLOGY": dc_id, "VALUE": CAPACITY_TO_ACTIVITY})
                avail.append({"REGION": REGION, "TECHNOLOGY": dc_id, "YEAR": year, "VALUE": 1.0})
                resid_cap.append({"REGION": REGION, "TECHNOLOGY": dc_id, "YEAR": year, "VALUE": 0.0})
                for lbl in labels:
                    cap_factor.append({"REGION": REGION, "TECHNOLOGY": dc_id, "TIMESLICE": lbl, "YEAR": year, "VALUE": 1.0})

                if costs.get("storage_cap"):
                    report.append(
                        f"{loc_name}/{tid}: storage_cap cost ({costs['storage_cap']} EUR/kWh) "
                        "not mapped to CapitalCost (requires C-rate assumption) — omitted."
                    )
                if _float(constr.get("storage_loss")) > 0:
                    report.append(f"{loc_name}/{tid}: storage_loss has no OSeMOSYS equivalent — omitted.")

            else:
                report.append(f"{loc_name}/{tid}: parent '{p}' not translated — skipped.")

    # ── Transmission links ────────────────────────────────────────────────────
    for lnk in links:
        from_name = lnk.get("from")
        to_name = lnk.get("to")
        if not from_name or not to_name:
            report.append("Link missing from/to fields — skipped.")
            continue

        from_s = _sid(from_name)
        to_s = _sid(to_name)
        tech = _find(lnk.get("tech") or "")

        if tech:
            tid = tech.get("name") or tech.get("id") or "TX"
            tid_s = _sid(tid)
            constr = tech.get("constraints") or {}
            costs = (tech.get("costs") or {}).get("monetary") or {}
            cap_max_kw = _float(constr.get("energy_cap_max"), 1e13)
            cap_max_gw_tx = min(cap_max_kw / 1e6, _LARGE_CAP_GW)
            eff_tx = min(1.0, max(0.01, _float(constr.get("energy_eff"), 0.97)))
            carrier = _carrier_out(tech)
            dist = _float(lnk.get("distance"), 0.0)
            capex_tx = (_float(costs.get("energy_cap")) + _float(costs.get("energy_cap_per_distance")) * dist) * _EUR_KW_TO_M_EUR_GW
            life_tx = max(1, int(_float(constr.get("lifetime"), 40)))
        else:
            tid_s = "TX"
            cap_max_gw_tx = _LARGE_CAP_GW
            eff_tx = 0.97
            carrier = "electricity"
            capex_tx = 0.0
            life_tx = 40
            report.append(f"Link {from_name}→{to_name}: no tech — defaults applied.")

        fuel_from = f"{from_s}_{_sid(carrier)}"
        fuel_to = f"{to_s}_{_sid(carrier)}"

        for tech_id, fin, fout in (
            (f"{from_s}_{to_s}_{tid_s}", fuel_from, fuel_to),
            (f"{to_s}_{from_s}_{tid_s}", fuel_to, fuel_from),
        ):
            osem_techs.append(tech_id)
            cap_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(capex_tx / 2, 6)})
            fix_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 0.0})
            var_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": 0.0})
            op_life.append({"REGION": REGION, "TECHNOLOGY": tech_id, "VALUE": life_tx})
            cap_max.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(cap_max_gw_tx, 9)})
            inp_act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "FUEL": fin, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": round(1.0 / eff_tx, 6)})
            out_act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "FUEL": fout, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": 1.0})
            cap2act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "VALUE": CAPACITY_TO_ACTIVITY})
            avail.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 1.0})
            resid_cap.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 0.0})
            for lbl in labels:
                cap_factor.append({"REGION": REGION, "TECHNOLOGY": tech_id, "TIMESLICE": lbl, "YEAR": year, "VALUE": 1.0})

    # ── Demand ────────────────────────────────────────────────────────────────
    demand_annual: list[dict] = []
    demand_profile: list[dict] = []

    for loc in locations:
        loc_name = loc.get("name") or loc.get("id", "loc")
        loc_s = _sid(loc_name)
        loc_tech_refs = loc.get("techs") or {}
        dp_timeseries = (loc.get("demandProfile") or {}).get("timeseries")

        for tech_ref in loc_tech_refs:
            tech = _find(tech_ref)
            if tech is None or _parent(tech) != "demand":
                continue

            carrier = _carrier_in(tech)
            fuel = f"{loc_s}_{_sid(carrier)}"
            constr = tech.get("constraints") or {}

            # Resolve demand values (kW)
            vals_kw: list[float] = []
            if isinstance(dp_timeseries, list):
                vals_kw = [_float(v) for v in dp_timeseries]
            elif isinstance(dp_timeseries, str):
                vals_kw = _resolve_timeseries(dp_timeseries, ts_store)
            if not vals_kw:
                resource = abs(_float(constr.get("resource"), 0.0))
                if resource > 0:
                    vals_kw = [resource] * 24
                else:
                    report.append(f"{loc_name}/{tech_ref}: no demand data — skipped.")
                    continue

            # Tile to model period
            full_vals = list(itertools.islice(itertools.cycle(vals_kw), n_hours))
            total_kwh = sum(full_vals)
            total_pj = total_kwh * _KWH_TO_PJ
            if total_pj < 1e-15:
                report.append(f"{loc_name}/{tech_ref}: demand is zero — skipped.")
                continue

            demand_annual.append({"REGION": REGION, "FUEL": fuel, "YEAR": year, "VALUE": round(total_pj, 12)})

            # Aggregate to timeslices; each slice fraction = share of annual energy
            slices_mean, _ys = timeslices.aggregate(full_vals, scheme)
            total_energy = sum(slices_mean[lbl] * year_split[lbl] * n_hours for lbl in labels)
            for lbl in labels:
                frac = (slices_mean[lbl] * year_split[lbl] * n_hours / total_energy
                        if total_energy > 0 else 1.0 / len(labels))
                demand_profile.append({
                    "REGION": REGION, "FUEL": fuel, "TIMESLICE": lbl,
                    "YEAR": year, "VALUE": round(frac, 9),
                })

    # ── Write CSV files ───────────────────────────────────────────────────────
    def _p(name: str) -> str:
        return os.path.join(csv_dir, name)

    # Sets
    _write_csv(_p("REGION.csv"), ["VALUE"], [{"VALUE": REGION}])
    _write_csv(_p("TECHNOLOGY.csv"), ["VALUE"], [{"VALUE": t} for t in sorted(set(osem_techs))])
    _write_csv(_p("FUEL.csv"), ["VALUE"], [{"VALUE": f} for f in sorted(loc_fuels)])
    _write_csv(_p("YEAR.csv"), ["VALUE"], [{"VALUE": year}])
    _write_csv(_p("TIMESLICE.csv"), ["VALUE"], [{"VALUE": lbl} for lbl in labels])
    _write_csv(_p("MODE_OF_OPERATION.csv"), ["VALUE"], [{"VALUE": 1}])
    _write_csv(_p("EMISSION.csv"), ["VALUE"], [])
    _write_csv(_p("STORAGE.csv"), ["VALUE"], [])

    # Parameters
    _write_csv(_p("CapitalCost.csv"), ["REGION", "TECHNOLOGY", "YEAR", "VALUE"], cap_cost)
    _write_csv(_p("FixedCost.csv"), ["REGION", "TECHNOLOGY", "YEAR", "VALUE"], fix_cost)
    _write_csv(_p("VariableCost.csv"), ["REGION", "TECHNOLOGY", "MODE_OF_OPERATION", "YEAR", "VALUE"], var_cost)
    _write_csv(_p("OperationalLife.csv"), ["REGION", "TECHNOLOGY", "VALUE"], op_life)
    _write_csv(_p("TotalAnnualMaxCapacity.csv"), ["REGION", "TECHNOLOGY", "YEAR", "VALUE"], cap_max)
    _write_csv(_p("TotalAnnualMaxCapacityInvestment.csv"), ["REGION", "TECHNOLOGY", "YEAR", "VALUE"], cap_max)
    _write_csv(_p("InputActivityRatio.csv"), ["REGION", "TECHNOLOGY", "FUEL", "MODE_OF_OPERATION", "YEAR", "VALUE"], inp_act)
    _write_csv(_p("OutputActivityRatio.csv"), ["REGION", "TECHNOLOGY", "FUEL", "MODE_OF_OPERATION", "YEAR", "VALUE"], out_act)
    _write_csv(_p("CapacityToActivityUnit.csv"), ["REGION", "TECHNOLOGY", "VALUE"], cap2act)
    _write_csv(_p("AvailabilityFactor.csv"), ["REGION", "TECHNOLOGY", "YEAR", "VALUE"], avail)
    _write_csv(_p("ResidualCapacity.csv"), ["REGION", "TECHNOLOGY", "YEAR", "VALUE"], resid_cap)
    _write_csv(_p("CapacityFactor.csv"), ["REGION", "TECHNOLOGY", "TIMESLICE", "YEAR", "VALUE"], cap_factor)
    _write_csv(_p("SpecifiedAnnualDemand.csv"), ["REGION", "FUEL", "YEAR", "VALUE"], demand_annual)
    _write_csv(_p("SpecifiedDemandProfile.csv"), ["REGION", "FUEL", "TIMESLICE", "YEAR", "VALUE"], demand_profile)
    _write_csv(_p("YearSplit.csv"), ["TIMESLICE", "YEAR", "VALUE"],
               [{"TIMESLICE": lbl, "YEAR": year, "VALUE": round(year_split[lbl], 9)} for lbl in labels])

    report.append(
        f"Single REGION ({REGION}), year {year}, {len(labels)} timeslices ({scheme}). "
        f"{len(set(osem_techs))} technologies, {len(loc_fuels)} fuels. "
        "Transmission as bidirectional conversion pairs. Storage as CH/DC tech pair + virtual fuel."
    )
    return csv_dir, report

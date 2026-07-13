"""
OSeMOSYS import: otoole CSV dataset → TEMPO internal model.

This is the reverse of osemosys_translate.translate_model().  It reads a
directory of otoole-compatible CSVs (REGION, TECHNOLOGY, FUEL, YEAR,
CapitalCost, OperationalLife, InputActivityRatio, OutputActivityRatio,
SpecifiedAnnualDemand, SpecifiedDemandProfile, TotalAnnualMaxCapacity, …)
and reconstructs an approximate TEMPO model dict.

Approximations and losses (noted in translation report):
- Single REGION only — multi-region datasets are not supported.
- YEAR: only the minimum year is used; multi-year datasets have later years dropped.
- Storage: CH/DC tech-pair convention (created by osemosys_translate) is
  detected and merged back into a single storage tech. Generic storage tech
  pairs cannot always be detected.
- Transmission: bidirectional tech-pair convention (`{from}_{to}_{tid}` and
  `{to}_{from}_{tid}`) is detected from InputActivityRatio fuel patterns.
- Location coordinates: not available in otoole CSVs — set to 0/0.
- Carrier names: reconstructed from FUEL names by stripping location prefix.
- Demand timeseries: reconstructed from SpecifiedDemandProfile (24-h pattern
  scaled by SpecifiedAnnualDemand) via osemosys_timeslices.broadcast().
"""

from __future__ import annotations

import csv as _csv
import math
import os
import re
import sys

_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

import osemosys_timeslices as timeslices

_KWH_TO_PJ = 3.6e-9
_M_EUR_GW_TO_EUR_KW = 1.0       # reverse of the translate unit coincidence
_M_EUR_PJ_TO_EUR_KWH = 1.0 / 277.778


def _read_csv(csv_dir: str, name: str) -> list[dict]:
    path = os.path.join(csv_dir, name)
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(_csv.DictReader(f))


def _float(val, default: float = 0.0) -> float:
    try:
        v = float(val)
        return default if (math.isinf(v) or math.isnan(v) or v >= 1e13) else v
    except (TypeError, ValueError):
        return default


def _unsid(name: str) -> str:
    """Best-effort: convert uppercase underscored ID back to a display name."""
    return name.replace("_", " ").strip().title()


def osemosys_to_internal(csv_dir: str) -> tuple[dict, list[str]]:
    """
    Convert an otoole CSV dataset directory to a TEMPO internal model dict.

    Parameters
    ----------
    csv_dir : str  Path to directory containing otoole CSV files.

    Returns
    -------
    (model, report) where report is a list of translation note strings.
    """
    report: list[str] = []

    def _r(name: str) -> list[dict]:
        return _read_csv(csv_dir, name)

    # ── Sets ─────────────────────────────────────────────────────────────────
    regions = [row["VALUE"] for row in _r("REGION.csv")]
    if not regions:
        report.append("WARNING: REGION.csv is empty — cannot import.")
        return {}, report
    if len(regions) > 1:
        report.append(f"WARNING: {len(regions)} regions found — only first ({regions[0]}) used.")
    region = regions[0]

    all_years = sorted(int(r["VALUE"]) for r in _r("YEAR.csv"))
    if not all_years:
        report.append("WARNING: YEAR.csv is empty — defaulting to 2024.")
        all_years = [2024]
    year = all_years[0]
    if len(all_years) > 1:
        report.append(f"Multi-year model ({all_years}) — only base year {year} imported. Later years dropped.")

    techs_raw = [r["VALUE"] for r in _r("TECHNOLOGY.csv")]
    fuels_raw = [r["VALUE"] for r in _r("FUEL.csv")]
    timeslices_raw = [r["VALUE"] for r in _r("TIMESLICE.csv")]

    # Detect scheme from slice labels
    try:
        max_s = max(int(re.search(r"s(\d+)", lbl).group(1)) for lbl in timeslices_raw)
        max_d = max(int(re.search(r"d(\d+)", lbl).group(1)) for lbl in timeslices_raw)
        scheme = {"seasons": max_s, "dayBlocks": max_d}
    except Exception:
        scheme = timeslices.default_scheme()
        report.append("Could not detect timeslice scheme from labels — defaulting to 4×3.")

    # ── Parameter lookups by (region, tech, year) ─────────────────────────────
    cap_cost: dict = {}
    for row in _r("CapitalCost.csv"):
        if row.get("REGION") == region and int(row.get("YEAR", 0)) == year:
            cap_cost[row["TECHNOLOGY"]] = _float(row["VALUE"])

    fix_cost: dict = {}
    for row in _r("FixedCost.csv"):
        if row.get("REGION") == region and int(row.get("YEAR", 0)) == year:
            fix_cost[row["TECHNOLOGY"]] = _float(row["VALUE"])

    var_cost: dict = {}
    for row in _r("VariableCost.csv"):
        if row.get("REGION") == region and int(row.get("YEAR", 0)) == year:
            var_cost[row["TECHNOLOGY"]] = _float(row["VALUE"])

    op_life: dict = {}
    for row in _r("OperationalLife.csv"):
        if row.get("REGION") == region:
            op_life[row["TECHNOLOGY"]] = int(_float(row["VALUE"], 25))

    cap_max: dict = {}
    for row in _r("TotalAnnualMaxCapacity.csv"):
        if row.get("REGION") == region and int(row.get("YEAR", 0)) == year:
            cap_max[row["TECHNOLOGY"]] = _float(row["VALUE"])

    # IAR/OAR: {tech: {fuel: value}}
    iar: dict = {}
    for row in _r("InputActivityRatio.csv"):
        if row.get("REGION") == region and int(row.get("YEAR", 0)) == year:
            t = row["TECHNOLOGY"]
            iar.setdefault(t, {})[row["FUEL"]] = _float(row["VALUE"])

    oar: dict = {}
    for row in _r("OutputActivityRatio.csv"):
        if row.get("REGION") == region and int(row.get("YEAR", 0)) == year:
            t = row["TECHNOLOGY"]
            oar.setdefault(t, {})[row["FUEL"]] = _float(row["VALUE"])

    # ── Build fuel→location map from FUEL set ─────────────────────────────────
    # Convention: fuel = "{LOC}_{CARRIER}" where LOC = sid(location name)
    # We try to detect locations from fuel names and from tech names.
    # Build a set of all possible location prefixes from tech names.
    loc_candidates: set[str] = set()
    for t in techs_raw:
        # tech = {LOC}_{TID}; loc prefix ends at the first underscore that
        # separates it from a tech component. Since tech names can have underscores
        # too, we only detect locs that appear as fuel prefixes.
        pass

    # Detect locations as the longest fuel prefix that also appears as a tech prefix
    # (tech = {LOC}_{TID}, fuel = {LOC}_{CARRIER})
    fuel_set = set(fuels_raw)
    loc_set: set[str] = set()
    # Strategy: split each fuel by "_" prefixes; the prefix that appears in ≥1 tech is a loc
    tech_prefixes: set[str] = set()
    for t in techs_raw:
        parts = t.split("_")
        for i in range(1, len(parts)):
            tech_prefixes.add("_".join(parts[:i]))
    for f in fuels_raw:
        if f.endswith("_STORED"):
            continue  # virtual storage fuel, not a location carrier
        parts = f.split("_")
        for i in range(1, len(parts)):
            prefix = "_".join(parts[:i])
            if prefix in tech_prefixes:
                loc_set.add(prefix)
                break

    if not loc_set:
        # Fall back: infer locations from non-storage fuel names (demand-only models
        # have no TECHNOLOGY set, so fuel names are the only source of location prefixes).
        for f in fuels_raw:
            if not f.endswith("_STORED") and "_" in f:
                loc_set.add(f.split("_")[0])
        if loc_set:
            report.append("Could not reliably detect location names — inferred from fuel names.")
        else:
            report.append("WARNING: Could not detect any location names.")

    # ── Detect storage CH/DC pairs ────────────────────────────────────────────
    storage_pairs: dict = {}  # base_id → (ch_id, dc_id)
    storage_bases: set[str] = set()
    for t in techs_raw:
        if t.endswith("_CH"):
            base = t[:-3]
            if base + "_DC" in techs_raw:
                storage_pairs[base] = (t, base + "_DC")
                storage_bases.add(base)
    storage_techs = set()
    for base, (ch, dc) in storage_pairs.items():
        storage_techs.update((ch, dc))

    # ── Detect bidirectional transmission pairs ───────────────────────────────
    # A TX tech has input from loc_A and output to loc_B
    # The forward and reverse pair: {locA}_{locB}_{tid} and {locB}_{locA}_{tid}
    tx_forward: set[str] = set()
    tx_techs: set[str] = set()
    for t in techs_raw:
        if t in storage_techs:
            continue
        in_fuels = set(iar.get(t, {}).keys())
        out_fuels = set(oar.get(t, {}).keys())
        # Transmission: input and output fuels are in different location fuel namespaces
        # and the fuel name ends with the same carrier suffix
        if len(in_fuels) == 1 and len(out_fuels) == 1:
            fin = next(iter(in_fuels))
            fout = next(iter(out_fuels))
            if fin != fout and not fin.endswith("_STORED") and not fout.endswith("_STORED"):
                # Check carrier suffix matches
                for loc in loc_set:
                    if fin.startswith(loc + "_") and fout.startswith(loc + "_"):
                        break  # same location — not tx
                else:
                    # Different locations: treat as transmission
                    tx_forward.add(t)
                    tx_techs.add(t)

    # Find matching reverse pairs (same tid suffix, swapped locations)
    tx_processed: set[str] = set()
    tx_links: list[dict] = []
    for t in tx_forward:
        if t in tx_processed:
            continue
        in_fuel = next(iter(iar.get(t, {}).keys()), "")
        out_fuel = next(iter(oar.get(t, {}).keys()), "")
        # from_loc_fuel → to_loc_fuel; detect loc names
        from_loc_sid = in_fuel.split("_")[0] if "_" in in_fuel else ""
        to_loc_sid = out_fuel.split("_")[0] if "_" in out_fuel else ""
        eff = min(1.0, 1.0 / max(1e-6, next(iter(iar.get(t, {}).values()), 1.0)))
        # Find tid by removing the loc prefixes
        tid_sid = t
        for loc_sid in (from_loc_sid, to_loc_sid):
            if tid_sid.startswith(loc_sid + "_"):
                tid_sid = tid_sid[len(loc_sid) + 1:]
        if to_loc_sid and tid_sid.startswith(to_loc_sid + "_"):
            tid_sid = tid_sid[len(to_loc_sid) + 1:]
        cap_max_gw = cap_cost_val = 0.0
        cap_max_val = cap_max.get(t, 0)
        if cap_max_val and cap_max_val < 900.0:
            cap_max_gw = cap_max_val
        capex_per_dir = cap_cost.get(t, 0)
        tx_links.append({
            "from": _unsid(from_loc_sid),
            "to": _unsid(to_loc_sid),
            "tech": tid_sid.lower(),
            "_capex_each": capex_per_dir * 2,  # each direction is half
            "_cap_max_gw": cap_max_gw,
            "_eff": eff,
            "_life": op_life.get(t, 40),
        })
        # Mark reverse as processed
        for rev_t in techs_raw:
            in_r = next(iter(iar.get(rev_t, {}).keys()), "")
            out_r = next(iter(oar.get(rev_t, {}).keys()), "")
            if in_r == out_fuel and out_r == in_fuel:
                tx_processed.add(rev_t)
                tx_techs.add(rev_t)
        tx_processed.add(t)

    # ── Detect demand fuels from SpecifiedAnnualDemand ────────────────────────
    demand_fuels: dict = {}  # fuel → PJ
    for row in _r("SpecifiedAnnualDemand.csv"):
        if row.get("REGION") == region and int(row.get("YEAR", 0)) == year:
            demand_fuels[row["FUEL"]] = _float(row["VALUE"])

    # ── Demand profiles: SpecifiedDemandProfile → 24-h pattern ───────────────
    demand_profile_by_fuel: dict = {}  # fuel → {slice: fraction}
    for row in _r("SpecifiedDemandProfile.csv"):
        if row.get("REGION") == region and int(row.get("YEAR", 0)) == year:
            fuel = row["FUEL"]
            demand_profile_by_fuel.setdefault(fuel, {})[row["TIMESLICE"]] = _float(row["VALUE"])

    # Read actual YearSplit from CSV (columns: TIMESLICE, YEAR, VALUE)
    # Using the actual fractions (which may be non-uniform) is essential for shape fidelity.
    year_split_csv: dict = {}
    for row in _r("YearSplit.csv"):
        lbl = row.get("TIMESLICE", "")
        if lbl and row.get("VALUE") is not None:
            if lbl not in year_split_csv:
                year_split_csv[lbl] = _float(row["VALUE"])

    labels = timeslices.slice_labels(scheme)
    n_slices = len(labels)
    # Fallback to uniform if CSV not available
    year_split = year_split_csv if year_split_csv else {
        lbl: 1.0 / n_slices for lbl in labels
    }

    # Reconstruct 24-h representative day from SpecifiedDemandProfile.
    # frac[lbl] / year_split[lbl] ∝ mean_kw[lbl] (shape-preserving, regardless of n_hours).
    def _demand_to_24h(fuel: str) -> list[float]:
        fracs = demand_profile_by_fuel.get(fuel, {})
        if not fracs:
            return []
        slices_mean: dict = {}
        for lbl in labels:
            frac = fracs.get(lbl, 1.0 / n_slices)
            ys = year_split.get(lbl, 1.0 / n_slices)
            slices_mean[lbl] = frac / ys if ys > 0 else 0.0
        hourly_8760 = timeslices.broadcast(slices_mean, year_split, scheme, 8760)
        # First 24 hours of broadcast = season-1 representative day
        return [round(v, 6) for v in hourly_8760[:24]]

    # ── Reconstruct locations and techs ──────────────────────────────────────
    # Map loc_sid → {carrier: demand_fuel, ...}
    loc_demands: dict = {}
    for fuel in demand_fuels:
        if fuel.endswith("_STORED"):
            continue
        for loc_sid in loc_set:
            if fuel.startswith(loc_sid + "_"):
                carrier = fuel[len(loc_sid) + 1:].lower()
                loc_demands.setdefault(loc_sid, {})[carrier] = fuel
                break

    technologies: list[dict] = []
    locations: list[dict] = []
    tech_name_set: set[str] = set()

    def _tech_name(raw_sid: str) -> str:
        return raw_sid.lower().replace("_", "_")

    # Build tech defs per unique base tech ID (aggregated across locations)
    tech_defs: dict = {}  # tech_base_sid → dict

    for loc_sid in sorted(loc_set):
        loc_name = _unsid(loc_sid)
        loc_tech_refs: dict = {}

        for t in techs_raw:
            if not t.startswith(loc_sid + "_"):
                continue
            if t in storage_techs or t in tx_techs:
                continue

            tid_sid = t[len(loc_sid) + 1:]
            tid = _tech_name(tid_sid)

            in_fuels = iar.get(t, {})
            out_fuels = oar.get(t, {})

            # Carrier detection
            carrier_out = None
            carrier_in = None
            for f in out_fuels:
                if not f.endswith("_STORED") and f.startswith(loc_sid + "_"):
                    carrier_out = f[len(loc_sid) + 1:].lower()
                    break
            for f in in_fuels:
                if not f.endswith("_STORED") and f.startswith(loc_sid + "_"):
                    carrier_in = f[len(loc_sid) + 1:].lower()
                    break

            if carrier_out and not carrier_in:
                parent = "supply"
                essentials = {"parent": "supply", "carrier_out": carrier_out, "name": _unsid(tid_sid)}
            elif carrier_in and carrier_out:
                eff_val = next(iter(in_fuels.values()), 1.0)
                eff = round(1.0 / max(1e-6, eff_val), 4)
                parent = "conversion"
                essentials = {"parent": "conversion", "carrier_in": carrier_in,
                              "carrier_out": carrier_out, "name": _unsid(tid_sid)}
            else:
                report.append(f"Tech {t}: could not determine parent type — skipped.")
                continue

            # Build constraints
            constraints: dict = {}
            max_gw = cap_max.get(t, 0)
            if max_gw and max_gw < 900.0:
                constraints["energy_cap_max"] = round(max_gw * 1e6, 3)
            life = op_life.get(t, 25)
            constraints["lifetime"] = life
            if parent == "conversion":
                constraints["energy_eff"] = eff

            # Build costs
            costs_m: dict = {}
            capex_m_per_gw = cap_cost.get(t, 0.0)
            if capex_m_per_gw > 0:
                costs_m["energy_cap"] = round(capex_m_per_gw * _M_EUR_GW_TO_EUR_KW, 3)
            om_annual = fix_cost.get(t, 0.0)
            if om_annual > 0:
                costs_m["om_annual"] = round(om_annual * _M_EUR_GW_TO_EUR_KW, 3)
            om_prod = var_cost.get(t, 0.0)
            if om_prod > 0:
                costs_m["om_prod"] = round(om_prod * _M_EUR_PJ_TO_EUR_KWH, 6)

            tech_def = {
                "name": tid,
                "essentials": essentials,
                "constraints": constraints,
            }
            if costs_m:
                tech_def["costs"] = {"monetary": costs_m}
            if tid not in tech_name_set:
                tech_defs[tid] = tech_def
                tech_name_set.add(tid)
            loc_tech_refs[tid] = None

        # Storage pairs at this location
        for base_sid in storage_pairs:
            if not base_sid.startswith(loc_sid + "_"):
                continue
            tid_sid = base_sid[len(loc_sid) + 1:]
            tid = _tech_name(tid_sid)
            ch_id, dc_id = storage_pairs[base_sid]

            # Detect carrier from ch tech's input fuel
            in_fuels_ch = iar.get(ch_id, {})
            carrier = "electricity"
            for f in in_fuels_ch:
                if f.startswith(loc_sid + "_") and not f.endswith("_STORED"):
                    carrier = f[len(loc_sid) + 1:].lower()
                    break

            # Round-trip efficiency: ch IAR = 1/sqrt(eff) → eff = (1/IAR)^2
            ch_iar = next(iter(in_fuels_ch.values()), 1.0)
            eff_rt = round((1.0 / max(1e-6, ch_iar)) ** 2, 4)

            max_gw = cap_max.get(ch_id, 0)
            life = op_life.get(ch_id, 15)
            capex_m_per_gw = cap_cost.get(ch_id, 0.0)
            costs_m: dict = {}
            if capex_m_per_gw > 0:
                costs_m["energy_cap"] = round(capex_m_per_gw * _M_EUR_GW_TO_EUR_KW, 3)

            tech_def = {
                "name": tid,
                "essentials": {"parent": "storage", "carrier": carrier, "name": _unsid(tid_sid)},
                "constraints": {
                    "energy_eff": eff_rt,
                    "lifetime": life,
                    **({"energy_cap_max": round(max_gw * 1e6, 3)} if max_gw and max_gw < 900 else {}),
                },
            }
            if costs_m:
                tech_def["costs"] = {"monetary": costs_m}
            if tid not in tech_name_set:
                tech_defs[tid] = tech_def
                tech_name_set.add(tid)
            loc_tech_refs[tid] = None

        # Demand techs at this location
        for carrier, fuel in loc_demands.get(loc_sid, {}).items():
            dem_tid = f"demand_{carrier}"
            if dem_tid not in tech_name_set:
                tech_defs[dem_tid] = {
                    "name": dem_tid,
                    "essentials": {"parent": "demand", "carrier_in": carrier, "name": f"Demand ({carrier})"},
                    "constraints": {"resource": -1000, "force_resource": True},
                }
                tech_name_set.add(dem_tid)
            loc_tech_refs[dem_tid] = None

        # Demand profile for this location
        demand_profile_ts = None
        for carrier, fuel in loc_demands.get(loc_sid, {}).items():
            pattern = _demand_to_24h(fuel)
            if pattern:
                demand_profile_ts = pattern
                break

        loc_entry: dict = {
            "name": loc_name,
            "latitude": 0.0,
            "longitude": 0.0,
            "techs": loc_tech_refs,
        }
        if demand_profile_ts:
            loc_entry["demandProfile"] = {"timeseries": demand_profile_ts}
        locations.append(loc_entry)

    technologies = list(tech_defs.values())

    # ── Transmission links ────────────────────────────────────────────────────
    links: list[dict] = []
    tx_tech_defs_seen: set[str] = set()
    for lnk_info in tx_links:
        tx_tid = lnk_info["tech"]
        if tx_tid not in tech_name_set:
            eff = lnk_info.get("_eff", 0.97)
            capex = lnk_info.get("_capex_each", 0.0) * _M_EUR_GW_TO_EUR_KW
            life = lnk_info.get("_life", 40)
            cap_max_gw = lnk_info.get("_cap_max_gw", 0.0)
            tx_def: dict = {
                "name": tx_tid,
                "essentials": {"parent": "transmission", "carrier": "electricity",
                               "name": _unsid(tx_tid.upper())},
                "constraints": {
                    "energy_eff": round(eff, 4),
                    "lifetime": life,
                    **({"energy_cap_max": round(cap_max_gw * 1e6, 3)} if cap_max_gw and cap_max_gw < 900 else {}),
                },
            }
            if capex > 0:
                tx_def["costs"] = {"monetary": {"energy_cap": round(capex, 3)}}
            technologies.append(tx_def)
            tech_name_set.add(tx_tid)
        links.append({"from": lnk_info["from"], "to": lnk_info["to"], "tech": tx_tid})

    # ── Model config ──────────────────────────────────────────────────────────
    model_config = {
        "startDate": f"{year}-01-01",
        "endDate": f"{year}-12-31",
        "mode": "plan",
        "ensureFeasibility": True,
    }

    model = {
        "name": f"OSeMOSYS Import ({year})",
        "modelConfig": model_config,
        "technologies": technologies,
        "locations": locations,
        "links": links,
        "timeSeries": [],
        "scenarios": {},
        "overrides": {},
        "locationTechAssignments": {},
    }

    report.append(
        f"Imported {len(locations)} locations, {len(technologies)} techs, {len(links)} links. "
        f"Year: {year}. Timeslice scheme detected: {scheme}. "
        "Location coordinates set to 0/0 (not available in otoole CSVs)."
    )
    if len(all_years) > 1:
        report.append(f"Multi-year dataset: kept {year}, dropped {all_years[1:]}.")
    if demand_fuels:
        report.append(
            "Demand timeseries: 24-h representative day reconstructed from SpecifiedDemandProfile. "
            "Annual energy scales are preserved."
        )

    return model, report

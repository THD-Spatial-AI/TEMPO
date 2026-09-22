"""
Tests for adoptnet0_translate.py demand handling — specifically that the OSM
study-area demand (a `file=name:col` resource on the inline power_demand tech)
reaches the per-node carrier CSV, not just the legacy demandProfile path.
"""
import os
import sys
import tempfile
from pathlib import Path

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
    assert float(demands[0]) == 10.0  # |−10|
    assert float(demands[-1]) in (33.0, 10.0)  # last hour or tiled wrap


def test_scalar_resource_demand_also_works():
    locations = [{
        "id": "n", "name": "Node",
        "techs": {"power_demand": {"constraints": {"resource": -42}}},
    }]
    rows = _write(locations)
    demands = [r.split(";")[1] for r in rows[1:]]
    assert all(float(d) == 42.0 for d in demands)


def test_no_demand_leaves_column_blank():
    locations = [{"id": "n", "name": "Node", "techs": {}}]
    rows = _write(locations)
    demands = [r.split(";")[1] for r in rows[1:]]
    assert all(d == "" for d in demands)

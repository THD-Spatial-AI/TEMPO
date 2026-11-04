"""
Calliope runners write payload timeSeries back to CSV for `file=` refs. Saved
(non-loaded) models reach the runner with raw csvContent but no parsed `data`;
those CSVs must still be written (otherwise the 0.6 runner silently falls back
to a constant 0.5 placeholder).

    python -m pytest python/tests/test_runner_csv_content.py -v
"""
import csv
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import calliope_runner as r06  # noqa: E402
import calliope07_runner as r07  # noqa: E402

MD = {"timeSeries": [{"fileName": "pv.csv", "columns": ["time", "Arica Norte"], "dateColumn": "time",
                      "csvContent": "time,Arica Norte\n2021-01-01 00:00:00,0\n2021-01-01 01:00:00,0.25\n"}]}
EXPECTED = [["time", "arica_norte"], ["2021-01-01 00:00:00", "0"], ["2021-01-01 01:00:00", "0.25"]]


def _read(p):
    with open(p, newline="", encoding="utf-8") as fh:
        return list(csv.reader(fh))


def test_calliope06_writes_csv_content_only_timeseries():
    d = Path(tempfile.mkdtemp())
    r06._write_calliope_yaml_csv_files(MD, d)
    assert _read(d / "pv.csv") == EXPECTED


def test_calliope07_writes_csv_content_only_timeseries():
    d = Path(tempfile.mkdtemp())
    assert r07._write_payload_csvs(MD, d) == {"pv.csv"}
    assert _read(d / "pv.csv") == EXPECTED


def test_calliope07_user_data_table_from_csv_content():
    md = {"timeSeries": [{"type": "data_table", "fileName": "t.csv", "columns": ["techs", "v"],
                          "dataTableConfig": {"rows": "techs"}, "csvContent": "techs,v\npv,3\n"}]}
    d = Path(tempfile.mkdtemp())
    assert r07._build_user_data_tables(md, d)
    assert _read(d / "t.csv") == [["techs", "v"], ["pv", "3"]]

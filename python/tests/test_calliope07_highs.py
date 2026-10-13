"""HiGHS solution parsing / solving for the Calliope 0.7 LP-file path."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import calliope07_runner as r  # noqa: E402

SOL = """Model status
Optimal

# Primal solution values
Feasible
Objective 12.5
# Columns 2
x1 1.5
x2 0
# Rows 1
c1 1.5

# Dual solution values
Feasible
# Columns 2
x1 0
x2 0.25
# Rows 1
c1 -3.0

# Basis
HiGHS v1
"""


def test_parse_highs_solution_raw_style():
    status, values, objective, duals = r._parse_highs_solution(SOL)
    assert status == 'optimal'
    assert values == {'x1': 1.5, 'x2': 0.0}
    assert objective == 12.5
    assert duals == {'c1': -3.0}


def test_parse_highs_solution_infeasible():
    status, values, objective, duals = r._parse_highs_solution("Model status\nInfeasible\n")
    assert status == 'infeasible' and values == {} and objective is None


LP = """Minimize
 obj: 2 x1 + 3 x2
Subject To
 c1: x1 + x2 >= 4
 c2: x1 <= 3
End
"""


def test_solve_lp_with_highspy_writes_parsable_solution(tmp_path):
    pytest.importorskip("highspy")
    lp, sol = tmp_path / "m.lp", tmp_path / "m.sol"
    lp.write_text(LP)
    logs = []
    r._solve_lp_with_highs(str(lp), str(sol), {}, logs.append, which=lambda n: None)
    status, values, objective, duals = r._parse_highs_solution(sol.read_text())
    assert status == 'optimal'
    assert objective == pytest.approx(9.0)          # x1=3, x2=1
    assert values['x1'] == pytest.approx(3.0) and values['x2'] == pytest.approx(1.0)
    assert duals['c1'] == pytest.approx(3.0)
    assert any('highspy' in line for line in logs)


def test_solve_lp_with_highspy_coerces_cli_style_options(tmp_path):
    pytest.importorskip("highspy")
    lp, sol = tmp_path / "m.lp", tmp_path / "m.sol"
    lp.write_text(LP)
    logs = []
    r._solve_lp_with_highs(str(lp), str(sol), {'time_limit': '300', 'presolve': 'on', 'bogus_opt': '1'},
                           logs.append, which=lambda n: None)
    status, _, objective, _ = r._parse_highs_solution(sol.read_text())
    assert status == 'optimal' and objective == pytest.approx(9.0)
    assert any('bogus_opt' in line for line in logs)

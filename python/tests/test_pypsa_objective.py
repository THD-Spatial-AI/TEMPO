"""
Regression: the PyPSA objective must count each capital cost once against its own capacity.

Some pandas / xarray / linopy combinations made PyPSA 0.35 build the capital-cost term as
an outer product (sum of all capital costs x sum of all capacities). This network gives 30
when correct.

    <pypsa-venv>/python -m pytest python/tests/test_pypsa_objective.py -v
"""

import pytest

pypsa = pytest.importorskip('pypsa')


def test_capital_cost_objective_is_per_component():
    n = pypsa.Network()
    n.set_snapshots([0])
    n.add('Bus', 'a')
    n.add('Bus', 'b')
    n.add('Generator', 'cheap', bus='a', p_nom_extendable=True, capital_cost=1.0)
    n.add('Generator', 'dear', bus='a', p_nom_extendable=True, capital_cost=100.0, p_nom_max=0.0)
    n.add('Link', 'cheap_link', bus0='a', bus1='b', p_nom_extendable=True, capital_cost=2.0)
    n.add('Link', 'dear_link', bus0='a', bus1='b', p_nom_extendable=True, capital_cost=50.0,
          p_nom_max=0.0)
    n.add('Load', 'load', bus='b', p_set=10.0)
    status, condition = n.optimize(solver_name='highs')
    assert condition == 'optimal'
    # 10 MW generator x 1 + 10 MW link x 2
    assert n.objective == pytest.approx(30.0)

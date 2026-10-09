"""Compare a full-year TEMPO SPORES result against values published in
Lombardi et al. 2020 (Joule 4, 2185-2207), reference scenario.

    python scripts/italy/compare_paper.py result.json [--tol 10]

Checks:
  1. Cost-optimal capacity expansion (paper, "Cost Optimality Makes Implicit
     Trade-Offs", Fig. 1): PV +144.5 GW, onshore wind +59.6 GW, offshore wind
     +17.6 GW, electrolysis 7.0 GW H2, methanation 5.6 GW CH4, 11.7 GW CCGT on
     syngas kept in operation.
  2. Minimise SPORES at the run's slack ("Alternatives to Potentially
     Problematic Technologies"): offshore wind, batteries and power-to-gas can
     be entirely excluded for any slack in 5-20%; new bioenergy can be fully
     avoided for slacks above 5% (else ~+1 GW).
Capacities are in model units (kW); conversion caps are output-referenced in
Calliope 0.6.8, as the paper reports them.
"""
import argparse
import json

PAPER_COST_OPTIMAL_GW = {
    'PV (farm + rooftop, new)': (('pv_farm_new', 'pv_rooftop_new'), 144.5),
    'Onshore wind (new)': (('wind_new',), 59.6),
    'Offshore wind': (('wind_offshore',), 17.6),
    'Electrolysis (H2 out)': (('electrolysis',), 7.0),
    'Methanation DAC (CH4 out)': (('methanation_dac',), 5.6),
    'CCGT on syngas': (('ccgt_syngas',), 11.7),
}
P2G = ('electrolysis', 'methanation_dac', 'ccgt_syngas')


def national_gw(caps, techs):
    return sum(v for k, v in caps.items() if k.split('::')[-1] in techs) / 1e6


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('result')
    ap.add_argument('--tol', type=float, default=10.0, help='cost-optimal tolerance, %%')
    a = ap.parse_args()
    r = json.load(open(a.result, encoding='utf-8'))
    spores = r['spores_data']
    slack = r['spores_meta']['plan']['slack']
    co = spores[0]

    print(f"Cost-optimal: {co['cost']:.6g} (slacked cap {r['spores_meta']['slacked_cost']:.6g}, slack {slack:.0%})\n")
    print(f"{'Cost-optimal capacity':28s} {'paper GW':>9s} {'TEMPO GW':>9s} {'diff %':>8s}")
    ok_all = True
    for label, (techs, paper) in PAPER_COST_OPTIMAL_GW.items():
        got = national_gw(co['capacities'], techs)
        d = (got - paper) / paper * 100
        ok = abs(d) <= a.tol
        ok_all &= ok
        print(f"{label:28s} {paper:9.1f} {got:9.1f} {d:+8.1f} {'ok' if ok else 'DIFF'}")

    print(f"\nMinimise SPORES at {slack:.0%} slack (paper: target can be fully excluded)")
    print(f"{'target':40s} {'cost-opt GW':>11s} {'SPORE GW':>9s} {'cost/opt':>9s}")
    for s in spores[1:]:
        if s['stage'] != 'minimise' or s['iteration'] != 1:
            continue
        tgt = tuple(s['target'])
        before, after = national_gw(co['capacities'], tgt), national_gw(s['capacities'], tgt)
        # P2G: the existing CCGT fleet stays; "excluded" = no electrolysis/methanation.
        check = tuple(t for t in tgt if t != 'ccgt_syngas') if tgt == P2G else tgt
        excluded = national_gw(s['capacities'], check) < 0.05
        ok_all &= excluded
        print(f"{'+'.join(tgt):40s} {before:11.2f} {after:9.2f} {s['cost'] / co['cost']:9.4f} "
              f"{'excluded' if excluded else 'NOT excluded'}")
    print('\nRESULT:', 'matches the paper' if ok_all else 'differs from the paper (see above)')


if __name__ == '__main__':
    main()

"""
Gate B diagnostic: export a Calliope 0.7 (MEME-emitted) result's capacities in the
0.6.8 result-contract key format ('loc::tech', 'a::link_tech:b'), so
fix_caps_from_result.mjs can pin a 0.6.8 run to the 0.7 design.
Conversion capacity is converted back to Calliope 0.6's output basis
(input flow_cap × efficiency). Run in the Calliope 0.7 venv:

    python scripts/italy/caps_07_to_06_json.py r07.nc payload.json out.json
"""

import json
import sys

import calliope


def main():
    nc, payload_path, out_path = sys.argv[1:4]
    techs = {t['name']: t for t in json.load(open(payload_path, encoding='utf-8'))['technologies']}
    m = calliope.read_netcdf(nc)
    fc = m.results['flow_cap'].to_series().dropna()
    inp = m.inputs
    base = inp['base_tech'].to_series()
    # link_from/link_to are not kept in the netCDF: a link's ends are the two
    # nodes its flow_cap is defined at.
    ends = {}
    for (node, tech, _carrier) in fc.index:
        if base.get(tech) == 'transmission':
            ends.setdefault(tech, set()).add(node)
    caps = {}
    for (node, tech, carrier), v in fc.items():
        bt = base.get(tech)
        if bt == 'transmission':
            a, b = sorted(ends[tech])
            name = next((t for t in sorted(techs, key=len, reverse=True) if tech.startswith(t + '_')), tech)
            if node == a:
                caps[f'{a.lower()}::{name}:{b.lower()}'] = float(v)
                caps[f'{b.lower()}::{name}:{a.lower()}'] = float(v)
            continue
        t = techs.get(tech, {})
        ess = t.get('essentials') or {}
        if bt == 'conversion':
            if carrier != (ess.get('carrier_in') or ess.get('carrier')):
                continue  # input-referenced capacity only
            v = float(v) * float((t.get('constraints') or {}).get('energy_eff', 1))
        caps[f'{node.lower()}::{tech}'] = float(v)
    json.dump({'capacities': caps}, open(out_path, 'w', encoding='utf-8'))
    print(f'{len(caps)} capacities → {out_path}')


if __name__ == '__main__':
    main()

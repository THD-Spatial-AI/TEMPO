// Figure 3 of Lombardi et al. (2020) (Supplement S1 at 5 % / 20 %): Spearman correlation of
// technology capacity across all SPORES, 6 bidding zones × 7 groups. Square colour and side ∝ ρ.
import { useMemo, useState } from 'react';
import PaperFigure, { SvgPanel } from './PaperFigure';
import { correlationMatrix } from '../../../services/sporesFigures';

// RdBu reversed (matplotlib 'RdBu_r'): blue −1, white 0, red +1
const STOPS = [[-1, [5, 48, 97]], [-0.6, [33, 102, 172]], [-0.3, [146, 197, 222]], [0, [247, 247, 247]],
  [0.3, [244, 165, 130]], [0.6, [214, 96, 77]], [1, [103, 0, 31]]];
function rdbu(v) {
  const x = Math.max(-1, Math.min(1, v));
  const i = STOPS.findIndex(s => s[0] >= x);
  if (i <= 0) return `rgb(${STOPS[0][1]})`;
  const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i];
  const t = (x - a) / (b - a);
  return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * t)).join(',')})`;
}

const C = 12;          // cell size
const LEFT = 120, BOTTOM = 110, TOP = 8, BAR = 50;
const FONT = { fontFamily: 'Arial, sans-serif', fontSize: 8, fill: '#333' };

const MAX_ZONES = 6; // the paper's six bidding zones; larger models pick which locations to compare

export default function Fig3Correlation({ spores, meta, metrics, slack }) {
  const all = useMemo(() => metrics.zones || [], [metrics]);
  const [picked, setPicked] = useState(null);
  const zones = useMemo(() => picked ?? all.slice(0, MAX_ZONES), [picked, all]);
  const toggle = (z) => setPicked(zones.includes(z) ? zones.filter(x => x !== z) : all.filter(x => zones.includes(x) || x === z));
  const sel = useMemo(() => ({ ...metrics, zones }), [metrics, zones]);
  const { atoms, rho } = useMemo(() => correlationMatrix(spores, meta, sel), [spores, meta, sel]);
  const groups = metrics.fig3Groups.map(g => g.label);
  const name = (z) => metrics.regionNames?.[z] || z;
  const n = atoms.length, G = groups.length;
  const size = n * C;
  const W = LEFT + size + BAR + 30, H = TOP + size + BOTTOM;
  // column i left→right; row i bottom→top
  const cx = (i) => LEFT + i * C;
  const cy = (i) => TOP + size - (i + 1) * C;

  const csv = () => ({
    name: `figure3_correlation_${slack}pct.csv`,
    text: ['row_zone,row_group,col_zone,col_group,rho',
      ...atoms.flatMap((a, i) => atoms.map((b, j) => `${a.zone},${a.group},${b.zone},${b.group},${rho[i][j] ?? ''}`))].join('\n'),
  });
  const blank = atoms.filter((_, i) => rho[i].every(v => v == null)).map(a => `${a.zone} ${a.group}`);

  return (
    <PaperFigure label={metrics.auto || slack === 10 ? 'Figure 3' : 'Figure S1'} title={`Correlation of technology capacity across all SPORES${slack != null ? ` (${slack}% cost relaxation)` : ''}`}
      file={`figure3_correlation_${slack}pct`} csv={csv}
      caption={`Spearman ρ (average ranks for ties) of each group's capacity in each ${metrics.auto ? 'location' : 'bidding zone'} across all ${spores.length} SPORES (cost optimum included); a rank correlation, so capacity and utilisation give the same ρ. ${metrics.auto
        ? `Groups by technology type${groups.includes('Transmission') ? '; transmission: new capacity of the lines with an end in the location' : ''}.${all.length > MAX_ZONES ? ` Showing ${zones.length} of ${all.length} locations (pick them above the matrix).` : ''}`
        : 'PV: rooftop + farm; storage: pumped hydro + battery; gas turbines: the power-to-gas chain’s dispatchable capacity; transmission: new capacity of the inter-zonal and international lines with an end in the zone (TEMPO’s definition; the paper doesn’t give one).'} Self-correlation not shown; a series that never changes has no ρ and is left blank${blank.length ? ` (${blank.join(', ')})` : ''}.`}>
      {all.length > MAX_ZONES && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-xs text-slate-400">Locations ({zones.length}):</span>
          {all.map(z => (
            <button key={z} onClick={() => toggle(z)}
              className={`text-[11px] px-2 py-0.5 border ${zones.includes(z) ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-black/15'}`}>
              {name(z)}
            </button>
          ))}
        </div>
      )}
      <SvgPanel className="overflow-x-auto">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <rect width={W} height={H} fill="#fff" />
          {rho.map((row, i) => row.map((v, j) => {
            if (v == null) return null;
            const s = Math.max(1.5, Math.abs(v) * (C - 1)); // side ∝ |ρ|
            return (
              <rect key={`${i}-${j}`} x={cx(j) + (C - s) / 2} y={cy(i) + (C - s) / 2} width={s} height={s} fill={rdbu(v)}>
                <title>{`${atoms[i].zone} ${atoms[i].group} × ${atoms[j].zone} ${atoms[j].group}: ρ = ${v.toFixed(2)}`}</title>
              </rect>
            );
          }))}
          {/* zone separators */}
          {zones.slice(1).map((_, k) => (
            <g key={k} stroke="#999" strokeWidth={0.6}>
              <line x1={cx((k + 1) * G)} x2={cx((k + 1) * G)} y1={TOP} y2={TOP + size} />
              <line x1={LEFT} x2={LEFT + size} y1={cy((k + 1) * G) + C} y2={cy((k + 1) * G) + C} />
            </g>
          ))}
          <rect x={LEFT} y={TOP} width={size} height={size} fill="none" stroke="#999" strokeWidth={0.6} />
          {/* row labels: group, then zone */}
          {atoms.map((a, i) => (
            <text key={`r${i}`} x={LEFT - 4} y={cy(i) + C * 0.75} textAnchor="end" {...FONT}>{a.group}</text>
          ))}
          {zones.map((z, k) => (
            <text key={`rz${z}`} x={18} y={cy(k * G + G / 2) + C / 2} textAnchor="middle" {...FONT} fontSize={9} fontWeight="bold"
              transform={`rotate(-90 18 ${cy(k * G + G / 2) + C / 2})`}>{name(z).slice(0, 14)}</text>
          ))}
          {/* column labels */}
          {atoms.map((a, j) => {
            const x = cx(j) + C * 0.7, y = TOP + size + 4;
            return <text key={`c${j}`} x={x} y={y} textAnchor="end" {...FONT} transform={`rotate(-90 ${x} ${y})`}>{a.group}</text>;
          })}
          {zones.map((z, k) => (
            <text key={`cz${z}`} x={cx(k * G + G / 2)} y={H - 8} textAnchor="middle" {...FONT} fontSize={9} fontWeight="bold">{name(z).slice(0, 14)}</text>
          ))}
          {/* colour bar */}
          {Array.from({ length: 100 }, (_, k) => (
            <rect key={`b${k}`} x={LEFT + size + 22} y={TOP + size * 0.1 + (size * 0.8) * k / 100} width={10} height={size * 0.8 / 100 + 0.5}
              fill={rdbu(1 - 2 * k / 100)} />
          ))}
          {[1, 0, -1].map(v => (
            <text key={v} x={LEFT + size + 36} y={TOP + size * 0.1 + size * 0.8 * (1 - v) / 2 + 3} {...FONT}>{v === -1 ? '−1' : v}</text>
          ))}
        </svg>
      </SvgPanel>
    </PaperFigure>
  );
}

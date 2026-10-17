// Looping SVG illustrations of the Scenario Studio workflow: add a card, scope it
// to a year, chain years into a timeline, and run (parallel vs sequential).
import { a, kt, move, INK } from '../illustrations/anim';
import { Cursor, Ripple } from '../illustrations/Parts';

const W = 280;
const H = 150;
const BLUE = '#3b82f6';
const RED = '#ef4444';
const GREEN = '#10b981';

function Canvas({ id }) {
  return (
    <>
      <defs>
        <pattern id={`${id}-dots`} width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="#dbe2ea" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#f8fafc" />
      <rect width={W} height={H} fill={`url(#${id}-dots)`} />
    </>
  );
}

function YearBox({ x, y, w = 100, h = 70, year, highlight }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#fff" stroke="#cbd5e1" />
      <rect x={x} y={y} width={w} height="17" fill="#fff" stroke="#cbd5e1" />
      <rect x={x + 5} y={y + 4} width="9" height="9" fill={INK} />
      <text x={x + 19} y={y + 12} fontSize="9" fontWeight="700" fill={INK}>{year}</text>
      <text x={x + w - 6} y={y + 12} textAnchor="end" fontSize="7.5" fontWeight="600" fill="#475569">+ Card</text>
      <rect x={x + 6} y={y + 23} width={w - 12} height={h - 29} fill="none" stroke="#cbd5e1" strokeDasharray="3 3" />
      {highlight}
      <circle cx={x} cy={y + h / 2} r="3" fill="#94a3b8" />
      <circle cx={x + w} cy={y + h / 2} r="3" fill={INK} />
    </g>
  );
}

function Card({ color, title, sub, w = 74 }) {
  return (
    <g>
      <rect width={w} height="26" fill="#fff" stroke="#e2e8f0" />
      <rect width="3" height="26" fill={color} />
      <text x="8" y="11" fontSize="8" fontWeight="700" fill={INK}>{title}</text>
      <text x="8" y="21" fontSize="7" fill="#64748b">{sub}</text>
    </g>
  );
}

function AddCardScene() {
  const D = 5;
  const items = [['Demand', BLUE], ['Emissions', RED], ['Renewables', GREEN], ['Technology', '#f59e0b']];
  return (
    <>
      <g transform="translate(10 10)">
        <rect width="60" height="18" fill={INK} />
        <text x="30" y="12.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff">+ Add card</text>
      </g>
      <g opacity="0" transform="translate(10 32)">
        {a('opacity', '0;0;1;1;0;0', kt(0, 0.2, 0.24, 0.5, 0.54, 1), D)}
        <rect width="86" height="74" fill="#fff" stroke="#e2e8f0" />
        {items.map(([label, color], i) => (
          <g key={label} transform={`translate(0 ${4 + i * 17})`}>
            {i === 1 && (
              <rect x="3" y="0" width="80" height="15" fill="#f1f5f9" opacity="0">
                {a('opacity', '0;0;1;1', kt(0, 0.4, 0.42, 1), D)}
              </rect>
            )}
            <rect x="8" y="4" width="7" height="7" fill={color} />
            <text x="20" y="11" fontSize="8" fill="#334155">{label}</text>
          </g>
        ))}
      </g>
      <g opacity="0" transform="translate(150 62)">
        {a('opacity', '0;0;1;1;0', kt(0, 0.52, 0.58, 0.92, 1), D)}
        <g>
          {move('0 -8;0 -8;0 0;0 0', kt(0, 0.52, 0.6, 1), D)}
          <Card color={RED} title="Emissions" sub="−55 % CO₂ cap" w={92} />
        </g>
      </g>
      <g opacity="0" transform="translate(196 104)">
        {a('opacity', '0;0;1;1;0', kt(0, 0.62, 0.68, 0.92, 1), D)}
        <text textAnchor="middle" fontSize="7.5" fontWeight="600" fill="#64748b">On the canvas → applies to all years</text>
      </g>
      <Ripple x={40} y={19} t={0.18} dur={D} />
      <Ripple x={45} y={58} t={0.46} dur={D} color={RED} />
      <Cursor values="120 130;40 20;40 20;45 58;45 58;196 76;120 130" keyTimes={kt(0, 0.16, 0.3, 0.44, 0.52, 0.66, 1)} dur={D} />
    </>
  );
}

function NestScene() {
  const D = 5;
  const glow = (
    <rect x="146" y="45" width="118" height="61" fill="none" stroke={BLUE} strokeWidth="1.6" opacity="0">
      {a('opacity', '0;0;1;1;0;0', kt(0, 0.38, 0.42, 0.62, 0.68, 1), D)}
    </rect>
  );
  return (
    <>
      <YearBox x={140} y={22} w={130} h={90} year="2030" highlight={glow} />
      <g>
        {move('16 62;16 62;16 62;152 60;152 60;152 60;16 62', kt(0, 0.2, 0.26, 0.58, 0.62, 0.94, 1), D)}
        <Card color={BLUE} title="Demand" sub="+15 % by 2030" />
      </g>
      <g opacity="0" transform="translate(205 124)">
        {a('opacity', '0;0;1;1;0', kt(0, 0.64, 0.7, 0.92, 1), D)}
        <rect x="-52" y="-9" width="104" height="15" rx="7.5" fill={BLUE} />
        <text y="1.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff">Applies to 2030 only</text>
      </g>
      <Ripple x={50} y={74} t={0.22} dur={D} color={BLUE} />
      <Cursor values="40 135;50 74;50 74;186 72;186 72;40 135" keyTimes={kt(0, 0.2, 0.26, 0.58, 0.7, 1)} dur={D} />
    </>
  );
}

function LinkYearsScene() {
  const D = 5;
  const A = [112, 75];
  const B = [168, 75];
  return (
    <>
      <YearBox x={12} y={40} year="2025" />
      <YearBox x={168} y={40} year="2030" />
      <g transform="translate(18 66)"><Card color={GREEN} title="Renewables" sub="40 % share" w={88} /></g>
      <g transform="translate(174 66)"><Card color={GREEN} title="Renewables" sub="65 % share" w={88} /></g>
      <line x1={A[0]} y1={A[1]} x2={A[0]} y2={A[1]} stroke="#94a3b8" strokeWidth="1.6" strokeDasharray="4 3" opacity="0">
        {a('x2', `${A[0]};${A[0]};${B[0]};${B[0]}`, kt(0, 0.26, 0.5, 1), D)}
        {a('opacity', '0;0;1;1;0;0', kt(0, 0.25, 0.26, 0.5, 0.52, 1), D)}
      </line>
      <g opacity="0">
        {a('opacity', '0;0;1;1;0', kt(0, 0.5, 0.53, 0.92, 1), D)}
        <line x1={A[0]} y1={A[1]} x2={B[0] - 5} y2={B[1]} stroke={INK} strokeWidth="2" />
        <path d={`M${B[0] - 7} ${B[1] - 4} L${B[0] - 1} ${B[1]} L${B[0] - 7} ${B[1] + 4} Z`} fill={INK} />
      </g>
      <g opacity="0" transform="translate(140 30)">
        {a('opacity', '0;0;1;1;0', kt(0, 0.56, 0.62, 0.92, 1), D)}
        <rect x="-50" y="-9" width="100" height="15" rx="7.5" fill={INK} />
        <text y="1.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff">2030 follows on from 2025</text>
      </g>
      <Ripple x={A[0]} y={A[1]} t={0.22} dur={D} />
      <Ripple x={B[0]} y={B[1]} t={0.5} dur={D} />
      <Cursor values={`60 140;${A[0]} ${A[1]};${A[0]} ${A[1]};${B[0]} ${B[1]};${B[0]} ${B[1]};60 140`} keyTimes={kt(0, 0.2, 0.26, 0.5, 0.75, 1)} dur={D} />
    </>
  );
}

function RunScene() {
  const D = 8;
  const years = ['2025', '2030', '2035'];
  const seq = [[0.56, 0.66], [0.66, 0.76], [0.76, 0.86]];
  return (
    <>
      <g transform="translate(70 12)">
        <rect width="140" height="18" fill="#f1f5f9" />
        <rect x="2" y="2" width="68" height="14" fill={INK}>
          {a('x', '2;2;70;70', kt(0, 0.48, 0.5, 1), D, { calcMode: 'discrete' })}
        </rect>
        <text x="36" y="12.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">
          {a('fill', '#ffffff;#475569', kt(0, 0.5), D, { calcMode: 'discrete' })}
          Parallel
        </text>
        <text x="104" y="12.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#475569">
          {a('fill', '#475569;#ffffff', kt(0, 0.5), D, { calcMode: 'discrete' })}
          Sequential
        </text>
      </g>
      {years.map((y, i) => {
        const top = 44 + i * 30;
        const [s0, s1] = seq[i];
        return (
          <g key={y} transform={`translate(30 ${top})`}>
            <rect width="9" height="9" y="2" fill={INK} />
            <text x="14" y="10" fontSize="8.5" fontWeight="700" fill={INK}>{y}</text>
            <rect x="46" y="3" width="160" height="7" fill="#e2e8f0" />
            <rect x="46" y="3" width="0" height="7" fill={GREEN}>
              {a('width', `0;0;160;160;0;0;160;160;0`, kt(0, 0.08, 0.36, 0.46, 0.47, s0, s1, 0.95, 1), D)}
            </rect>
            <text x="214" y="10" fontSize="12" fill={GREEN} opacity="0" style={{ fontFamily: 'Material Symbols Outlined' }}>
              {a('opacity', '0;0;1;1;0;0;1;1;0', kt(0, 0.36, 0.37, 0.46, 0.47, s1, s1 + 0.01, 0.95, 1), D)}
              check_circle
            </text>
          </g>
        );
      })}
      <text x={W / 2} y="140" textAnchor="middle" fontSize="7.5" fontWeight="600" fill="#64748b">
        {a('opacity', '1;1;0;0', kt(0, 0.46, 0.48, 1), D)}
        All years solve at the same time
      </text>
      <text x={W / 2} y="140" textAnchor="middle" fontSize="7.5" fontWeight="600" fill="#64748b" opacity="0">
        {a('opacity', '0;0;1;1', kt(0, 0.48, 0.5, 1), D)}
        One year after another, in year order
      </text>
    </>
  );
}

const SCENES = { 'scn-add': AddCardScene, 'scn-nest': NestScene, 'scn-link': LinkYearsScene, 'scn-run': RunScene };

export default function ScenarioIllustration({ mode = 'scn-add', className = '' }) {
  const Scene = SCENES[mode] || AddCardScene;
  return (
    <svg key={mode} viewBox={`0 0 ${W} ${H}`} className={`block w-full ${className}`} role="img" aria-label={`${mode} illustration`}>
      <Canvas id={`si-${mode}`} />
      <Scene />
    </svg>
  );
}

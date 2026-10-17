// Looping SVG illustrations of how a model is drawn: locations, links, polylines
// and the full build sequence. Pure SVG/SMIL, no runtime dependencies.
import { a, kt, move, INK } from '../illustrations/anim';
import { Cursor, Ripple } from '../illustrations/Parts';

const W = 280;
const H = 150;
const LINK = '#f59e0b';
const POLY = '#0ea5e9';

function Backdrop({ id, height = H }) {
  return (
    <>
      <defs>
        <pattern id={`${id}-grid`} width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M14 0H0V14" fill="none" stroke="#eef2f7" strokeWidth="1" />
        </pattern>
        <linearGradient id={`${id}-land`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="1" stopColor="#eef2f7" />
        </linearGradient>
      </defs>
      <rect width={W} height={height} fill="#fbfdff" />
      <rect width={W} height={height} fill={`url(#${id}-grid)`} />
      <path
        d="M18 46 C55 14 118 24 160 32 C212 42 258 18 268 62 C279 104 238 132 188 128 C140 124 118 140 68 132 C28 126 6 92 18 46Z"
        fill={`url(#${id}-land)`} stroke="#e2e8f0" strokeWidth="1.2"
      />
    </>
  );
}

function Node({ x, y, label, labelDy = 18 }) {
  return (
    <g>
      <circle cx={x} cy={y} r="6" fill={INK} stroke="#fff" strokeWidth="2" />
      {label && <text x={x} y={y + labelDy} textAnchor="middle" fontSize="9" fontWeight="600" fill="#475569">{label}</text>}
    </g>
  );
}

function LocationScene() {
  const D = 4;
  return (
    <>
      <Node x={62} y={58} />
      <Node x={222} y={104} />
      <Ripple x={140} y={82} t={0.3} dur={D} />
      <g transform="translate(140 82)">
        <g opacity="0">
          {a('opacity', '0;0;1;1;0', kt(0, 0.3, 0.36, 0.9, 1), D)}
          <ellipse cx="0" cy="1" rx="6" ry="2" fill={INK} opacity="0.18" />
          <g>
            {move('0 -48;0 -48;0 0;0 -5;0 0;0 0', kt(0, 0.3, 0.42, 0.47, 0.52, 1), D)}
            <path d="M0 0 C-7 -9 -10 -13 -10 -18 A10 10 0 1 1 10 -18 C10 -13 7 -9 0 0Z" fill={INK} />
            <circle cy="-18" r="3.6" fill="#fff" />
          </g>
        </g>
        <g opacity="0">
          {a('opacity', '0;0;1;1;0', kt(0, 0.5, 0.56, 0.9, 1), D)}
          <rect x="-30" y="7" width="60" height="16" rx="8" fill="#fff" stroke="#e2e8f0" />
          <text y="18.5" textAnchor="middle" fontSize="9" fontWeight="600" fill={INK}>Location 3</text>
        </g>
      </g>
      <Cursor values="34 138;140 82;140 82;140 82;34 138" keyTimes={kt(0, 0.28, 0.4, 0.85, 1)} dur={D} />
    </>
  );
}

function LinkScene() {
  const D = 4.5;
  const A = [70, 102];
  const B = [214, 58];
  return (
    <>
      <circle cx={A[0]} cy={A[1]} r="11" fill="none" stroke={LINK} strokeWidth="2" opacity="0">
        {a('opacity', '0;0;1;1;0;0', kt(0, 0.2, 0.22, 0.55, 0.6, 1), D)}
      </circle>
      <line x1={A[0]} y1={A[1]} x2={A[0]} y2={A[1]} stroke="#94a3b8" strokeWidth="1.6" strokeDasharray="4 4" opacity="0">
        {a('x2', `${A[0]};${A[0]};${B[0]};${B[0]}`, kt(0, 0.28, 0.55, 1), D)}
        {a('y2', `${A[1]};${A[1]};${B[1]};${B[1]}`, kt(0, 0.28, 0.55, 1), D)}
        {a('opacity', '0;0;1;1;0;0', kt(0, 0.27, 0.28, 0.54, 0.56, 1), D)}
      </line>
      <g opacity="0">
        {a('opacity', '0;0;1;1;0', kt(0, 0.55, 0.58, 0.92, 1), D)}
        <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={LINK} strokeWidth="3.5" strokeLinecap="round" opacity="0.35" />
        <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={LINK} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="7 7">
          <animate attributeName="stroke-dashoffset" values="28;0" dur="0.9s" repeatCount="indefinite" />
        </line>
      </g>
      <g opacity="0" transform={`translate(${(A[0] + B[0]) / 2} ${(A[1] + B[1]) / 2 - 16})`}>
        {a('opacity', '0;0;1;1;0', kt(0, 0.62, 0.67, 0.92, 1), D)}
        <rect x="-32" y="-9" width="64" height="17" rx="8.5" fill="#fff" stroke="#fde68a" />
        <circle cx="-22" cy="-0.5" r="3" fill={LINK} />
        <text x="4" y="2.8" textAnchor="middle" fontSize="9" fontWeight="600" fill="#92400e">HVAC line</text>
      </g>
      <Node x={A[0]} y={A[1]} label="Berlin" />
      <Node x={B[0]} y={B[1]} label="Hamburg" labelDy={-12} />
      <Ripple x={A[0]} y={A[1]} t={0.2} dur={D} color={LINK} />
      <Ripple x={B[0]} y={B[1]} t={0.55} dur={D} color={LINK} />
      <Cursor values={`30 140;${A[0]} ${A[1]};${A[0]} ${A[1]};${B[0]} ${B[1]};${B[0]} ${B[1]};30 140`} keyTimes={kt(0, 0.2, 0.28, 0.55, 0.8, 1)} dur={D} />
    </>
  );
}

function PolylineScene() {
  const D = 5;
  const P = [[44, 112], [104, 70], [170, 98], [236, 54]];
  const T = [0.12, 0.3, 0.48, 0.66];
  return (
    <>
      {P.slice(1).map((p, i) => (
        <line key={`s${i}`} x1={P[i][0]} y1={P[i][1]} x2={p[0]} y2={p[1]} pathLength="1" stroke={POLY} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="1" strokeDashoffset="1" opacity="0">
          {a('stroke-dashoffset', '1;1;0;0', kt(0, T[i], T[i + 1], 1), D)}
          {a('opacity', '0;0;1;1;0', kt(0, T[i], T[i] + 0.01, 0.92, 1), D)}
        </line>
      ))}
      {P.map(([x, y], i) => (
        <g key={`p${i}`} opacity="0">
          {a('opacity', '0;0;1;1;0', kt(0, T[i], T[i] + 0.02, 0.92, 1), D)}
          <circle cx={x} cy={y} r="5" fill="#fff" stroke={POLY} strokeWidth="2.5" />
          <text x={x} y={y + (i % 2 ? -11 : 17)} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#0369a1">Point {i + 1}</text>
        </g>
      ))}
      {P.map(([x, y], i) => <Ripple key={`r${i}`} x={x} y={y} t={T[i]} dur={D} color={POLY} />)}
      <Cursor values={`22 140;${P.map((p) => p.join(' ')).join(';')};${P[3].join(' ')};22 140`} keyTimes={kt(0, ...T, 0.85, 1)} dur={D} />
    </>
  );
}

const MODEL_NODES = [
  { x: 56, y: 98, label: 'Berlin', icon: 'solar_power', color: '#f59e0b', t: 0.04 },
  { x: 124, y: 50, label: 'Hamburg', icon: 'air', color: '#0ea5e9', t: 0.1 },
  { x: 208, y: 58, label: 'Leipzig', icon: 'factory', color: '#475569', t: 0.16 },
  { x: 186, y: 116, label: 'Munich', icon: 'battery_charging_full', color: '#10b981', t: 0.22 },
];
const MODEL_LINKS = [[0, 1, 0.28], [1, 2, 0.34], [2, 3, 0.4], [0, 3, 0.46]];
const PHASES = [['Locations', 0, 0.27], ['Links', 0.27, 0.54], ['Technologies', 0.54, 0.76], ['Save', 0.76, 1]];

function ModelScene() {
  const D = 7.5;
  return (
    <>
      {MODEL_LINKS.map(([i, j, t]) => {
        const p = MODEL_NODES[i];
        const q = MODEL_NODES[j];
        return (
          <g key={`${i}-${j}`}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} pathLength="1" stroke={LINK} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="1" strokeDashoffset="1" opacity="0">
              {a('stroke-dashoffset', '1;1;0;0', kt(0, t, t + 0.08, 1), D)}
              {a('opacity', '0;0;1;1;0', kt(0, t, t + 0.01, 0.93, 1), D)}
            </line>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 12" opacity="0">
              <animate attributeName="stroke-dashoffset" values="28;0" dur="1.1s" repeatCount="indefinite" />
              {a('opacity', '0;0;0.95;0.95;0', kt(0, 0.56, 0.6, 0.93, 1), D)}
            </line>
          </g>
        );
      })}
      {MODEL_NODES.map((n, i) => (
        <g key={n.label}>
          <circle cx={n.x} cy={n.y} r="0" fill={INK} stroke="#fff" strokeWidth="2">
            {a('r', '0;0;8;6;6;0', kt(0, n.t, n.t + 0.03, n.t + 0.05, 0.93, 1), D)}
          </circle>
          <text x={n.x} y={n.y + (n.y < 80 ? -12 : 19)} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#475569" opacity="0">
            {a('opacity', '0;0;1;1;0', kt(0, n.t + 0.03, n.t + 0.06, 0.93, 1), D)}
            {n.label}
          </text>
          <g opacity="0" transform={`translate(${n.x + 15} ${n.y < 80 ? n.y + 11 : n.y - 11})`}>
            {a('opacity', '0;0;1;1;0', kt(0, 0.56 + i * 0.04, 0.59 + i * 0.04, 0.93, 1), D)}
            <circle r="9" fill="#fff" stroke={n.color} strokeWidth="1.5" />
            <text y="4.5" textAnchor="middle" fontSize="12" fill={n.color} style={{ fontFamily: 'Material Symbols Outlined' }}>{n.icon}</text>
          </g>
        </g>
      ))}
      <g opacity="0" transform="translate(222 18)">
        {a('opacity', '0;0;1;1;0', kt(0, 0.78, 0.82, 0.93, 1), D)}
        <rect x="-44" y="-10" width="88" height="20" rx="10" fill={INK} />
        <text x="-30" y="4.5" textAnchor="middle" fontSize="12" fill="#34d399" style={{ fontFamily: 'Material Symbols Outlined' }}>check_circle</text>
        <text x="6" y="3.5" textAnchor="middle" fontSize="9" fontWeight="600" fill="#fff">Model saved</text>
      </g>
      <g transform={`translate(0 ${H + 4})`}>
        <rect width={W} height="26" fill="#fff" />
        <line x1="0" x2={W} y1="0" y2="0" stroke="#e2e8f0" />
        {PHASES.map(([label, s, e], i) => {
          const x = 35 + i * 70;
          return (
            <g key={label}>
              <text x={x} y="17" textAnchor="middle" fontSize="9" fontWeight="600" fill="#cbd5e1">
                {a('fill', '#cbd5e1;#0f172a;#cbd5e1', kt(0, s, e), D, { calcMode: 'discrete' })}
                {i + 1}. {label}
              </text>
            </g>
          );
        })}
        <rect y="0" height="2.5" width="70" fill={INK}>
          {a('x', '0;70;140;210', kt(0, 0.27, 0.54, 0.76), D, { calcMode: 'discrete' })}
        </rect>
      </g>
    </>
  );
}

const SCENES = { location: LocationScene, link: LinkScene, polyline: PolylineScene, model: ModelScene };

export default function ModeIllustration({ mode = 'model', className = '' }) {
  const Scene = SCENES[mode] || ModelScene;
  const height = mode === 'model' ? H + 30 : H;
  return (
    <svg key={mode} viewBox={`0 0 ${W} ${height}`} className={`block w-full ${className}`} role="img" aria-label={`${mode} illustration`}>
      <Backdrop id={`mi-${mode}`} height={height} />
      <Scene />
    </svg>
  );
}

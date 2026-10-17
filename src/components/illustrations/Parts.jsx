// Shared SVG parts for the illustrations: cursor and click ripple.
import { a, kt, move, INK } from './anim';

export function Cursor({ values, keyTimes, dur }) {
  return (
    <g>
      {move(values, keyTimes, dur)}
      <path d="M0 0 L0 15 L4 11 L7 17 L9.5 16 L6.6 10 L11.5 10 Z" fill="#fff" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
    </g>
  );
}

export function Ripple({ x, y, t, dur, color = INK }) {
  return (
    <circle cx={x} cy={y} r="0" fill="none" stroke={color} strokeWidth="1.5" opacity="0">
      {a('r', '0;0;18;18', kt(0, t, t + 0.12, 1), dur)}
      {a('opacity', '0;0.55;0;0', kt(0, t, t + 0.12, 1), dur)}
    </circle>
  );
}

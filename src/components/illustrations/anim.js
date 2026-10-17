// SMIL helpers shared by the looping SVG illustrations.
import { createElement } from 'react';

export const kt = (...t) => t.map((v) => Math.min(1, Math.max(0, v)).toFixed(3)).join(';');

export const a = (attributeName, values, keyTimes, dur, extra = {}) =>
  createElement('animate', { attributeName, values, keyTimes, dur: `${dur}s`, repeatCount: 'indefinite', ...extra });

export const move = (values, keyTimes, dur) =>
  createElement('animateTransform', { attributeName: 'transform', type: 'translate', values, keyTimes, dur: `${dur}s`, repeatCount: 'indefinite' });

export const INK = '#0f172a';

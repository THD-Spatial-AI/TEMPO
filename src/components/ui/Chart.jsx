import React, { forwardRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { trLoose, getLanguage } from '../../i18n';

// Translate display names
const T = (v) => (typeof v === 'string' ? trLoose(v) : v);
const each = (x, fn) => (Array.isArray(x) ? x.map(fn) : x && fn(x));
const item = (d) => (d && typeof d === 'object' && !Array.isArray(d) && typeof d.name === 'string' ? { ...d, name: T(d.name) } : T(d));

const axis = (a) => {
  if (!a) return a;
  const out = { ...a, name: T(a.name) };
  if (Array.isArray(a.data)) out.data = a.data.map(item);
  return out;
};

const series = (s) => {
  if (!s) return s;
  const out = { ...s, name: T(s.name) };
  if (Array.isArray(s.data)) out.data = s.data.map(item);
  if (Array.isArray(s.nodes)) out.nodes = s.nodes.map(item);
  if (Array.isArray(s.links)) out.links = s.links.map((l) => ({ ...l, source: T(l.source), target: T(l.target) }));
  if (Array.isArray(s.edges)) out.edges = s.edges.map((l) => ({ ...l, source: T(l.source), target: T(l.target) }));
  return out;
};

const legend = (l) => {
  if (!l) return l;
  const out = { ...l };
  if (Array.isArray(l.data)) out.data = l.data.map(item);
  if (l.selected) out.selected = Object.fromEntries(Object.entries(l.selected).map(([k, v]) => [T(k), v]));
  return out;
};

function localizeOption(o) {
  if (!o || getLanguage() === 'en') return o;
  const out = { ...o };
  if (o.xAxis) out.xAxis = each(o.xAxis, axis);
  if (o.yAxis) out.yAxis = each(o.yAxis, axis);
  if (o.radar) out.radar = each(o.radar, (r) => (Array.isArray(r?.indicator) ? { ...r, indicator: r.indicator.map(item) } : r));
  if (o.legend) out.legend = each(o.legend, legend);
  if (o.series) out.series = each(o.series, series);
  return out;
}

// ECharts with translated labels
const Chart = forwardRef(function Chart({ option, onEvents, ...rest }, ref) {
  // keep raw names when events read them
  const opt = useMemo(() => (onEvents ? option : localizeOption(option)), [option, onEvents]);
  return <ReactECharts ref={ref} option={opt} onEvents={onEvents} {...rest} />;
});

export default Chart;

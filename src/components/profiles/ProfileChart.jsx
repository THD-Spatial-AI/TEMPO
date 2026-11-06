// Year (daily mean) / typical-day chart of an hourly profile, shared by the
// resource-profile dialogs.
import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

/** Daily means of an hourly series (365 / 366 points). */
function dailyMeans(values) {
  const out = [];
  for (let d = 0; d * 24 < values.length; d++) {
    const day = values.slice(d * 24, d * 24 + 24);
    out.push({ x: d + 1, value: day.reduce((a, b) => a + b, 0) / day.length });
  }
  return out;
}

/** Mean value per hour of day (24 points, UTC). */
function typicalDay(values) {
  const sums = new Array(24).fill(0);
  const counts = new Array(24).fill(0);
  values.forEach((v, i) => { sums[i % 24] += v; counts[i % 24] += 1; });
  return sums.map((s, h) => ({ x: h, value: counts[h] ? s / counts[h] : 0 }));
}

export default function ProfileChart({ values }) {
  const [view, setView] = useState('year');
  const chartData = useMemo(
    () => (values ? (view === 'year' ? dailyMeans(values) : typicalDay(values)) : []),
    [values, view],
  );
  if (!values) return null;

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        {[['year', 'Year'], ['day', 'Typical day']].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`px-3 py-1 text-xs font-medium border ${view === id ? 'bg-black text-white border-black' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-3 text-[11px] text-slate-500">
          {view === 'year' ? 'Daily mean' : 'Hourly mean (UTC)'}
        </span>
      </div>
      <div className="h-64 border border-slate-200 bg-white">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis domain={[0, (dataMax) => Math.max(1, dataMax)]} tick={{ fontSize: 11 }} stroke="#94a3b8" width={40} />
            <Tooltip formatter={(v) => Number(v).toFixed(3)} labelFormatter={(x) => (view === 'year' ? `Day ${x}` : `${x}:00`)} />
            <Line type="monotone" dataKey="value" stroke="#000000" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

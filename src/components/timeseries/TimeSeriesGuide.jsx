import { useState } from 'react';
import { LuUpload, LuDownload, LuCalendarClock, LuColumns3, LuHash, LuLink } from 'react-icons/lu';

const pad = (n) => String(n).padStart(2, '0');
const hourStamp = (h) => `2024-01-01 ${pad(h)}:00`;

// Small, realistic example files the user can download and edit.
const EXAMPLES = {
  demand: {
    file: 'demand_example.csv',
    header: ['timestamp', 'Berlin', 'Munich'],
    row: (h) => {
      const shape = 0.75 + 0.25 * Math.sin(((h - 6) / 24) * 2 * Math.PI);
      return [hourStamp(h), -(1200 * shape).toFixed(1), -(900 * shape).toFixed(1)];
    },
  },
  capacityFactor: {
    file: 'solar_cf_example.csv',
    header: ['timestamp', 'Berlin', 'Munich'],
    row: (h) => {
      const sun = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
      return [hourStamp(h), (0.82 * sun).toFixed(3), (0.88 * sun).toFixed(3)];
    },
  },
};

function downloadExample(kind) {
  const ex = EXAMPLES[kind];
  const lines = [ex.header.join(','), ...Array.from({ length: 24 }, (_, h) => ex.row(h).join(','))];
  const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: ex.file });
  a.click();
  URL.revokeObjectURL(url);
}

const RULES = [
  { icon: LuColumns3, title: 'CSV with a header row', text: 'Comma-separated, one header line with column names.' },
  { icon: LuCalendarClock, title: 'First column = timestamp', text: 'e.g. 2024-01-01 00:00 — one row per time step (usually hourly), covering the period you run.' },
  { icon: LuHash, title: 'Other columns = numeric series', text: 'One column per series, usually named after a location (Berlin, Munich…). Numbers only.' },
  { icon: LuLink, title: 'Referenced by file and column', text: 'Technologies point at a column as file=demand.csv:Berlin.' },
];

const SAMPLE = [
  ['timestamp', 'Berlin', 'Munich'],
  ['2024-01-01 00:00', '-1050.2', '-787.6'],
  ['2024-01-01 01:00', '-998.7', '-749.0'],
  ['2024-01-01 02:00', '-963.1', '-722.3'],
  ['…', '…', '…'],
];

// Explains the CSV structure TEMPO expects, with a drop zone and example downloads.
export default function TimeSeriesGuide({ onFile, compact = false }) {
  const [dragging, setDragging] = useState(false);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className={`grid gap-6 ${compact ? 'xl:grid-cols-[1fr_1.2fr]' : 'lg:grid-cols-[1fr_1.2fr]'}`}>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? 'border-slate-900 bg-slate-100' : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20">
          <LuUpload size={24} />
        </span>
        <span className="text-base font-semibold text-slate-900">Drop a CSV file here</span>
        <span className="mt-1 text-sm text-slate-500">or click to browse your computer</span>
        <span className="mt-4 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">.csv · header row · timestamp first</span>
        <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = null; }} />
      </label>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Required structure</h2>
        <p className="mt-0.5 text-xs text-slate-500">What a time series file needs to look like.</p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {RULES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon size={15} /></span>
              <span>
                <span className="block text-[13px] font-semibold text-slate-900">{title}</span>
                <span className="block text-xs leading-snug text-slate-500">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5">
            <span className="font-mono text-[11px] text-slate-500">demand.csv</span>
            <span className="text-[11px] text-slate-400">example</span>
          </div>
          <table className="w-full font-mono text-xs">
            <tbody>
              {SAMPLE.map((row, i) => (
                <tr key={i} className={i === 0 ? 'bg-white font-semibold text-slate-900' : 'border-t border-slate-100 text-slate-600'}>
                  {row.map((cell, j) => (
                    <td key={j} className={`px-3 py-1.5 ${j === 0 ? 'text-left' : 'text-right'}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-xs font-semibold text-slate-900">Demand profiles</div>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">Power per time step in kW. Calliope 0.6 stores demand as <b>negative</b> numbers; the chart shows them as positive.</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-xs font-semibold text-slate-900">Resource / capacity factors</div>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">Solar or wind availability as a fraction from <b>0 to 1</b> per time step.</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-slate-400">
          A file whose first column is not a date is imported as a <b>data table</b> (Calliope 0.7 <span className="font-mono">data_tables</span>).
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => downloadExample('demand')} className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <LuDownload size={13} /> Demand example
          </button>
          <button onClick={() => downloadExample('capacityFactor')} className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <LuDownload size={13} /> Capacity-factor example
          </button>
        </div>
      </div>
    </div>
  );
}

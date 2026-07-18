// Small labelled metric tile used across the H2 and CCS plant-simulation panels.
// Extracted from seven near-identical copies; the differences between them were
// CSS-irrelevant whitespace, key ordering, and the H2-only `wide`/`indigo`
// additions, so this superset behaves identically for every caller. Every colour
// except `slate` intentionally renders the same neutral grey.
export default function MetricBadge({ label, value, unit, color = "slate", wide = false }) {
  const palettes = {
    amber:  "bg-gray-50 border-gray-200 text-gray-700",
    green:  "bg-gray-50 border-gray-200 text-gray-700",
    violet: "bg-gray-50 border-gray-200 text-gray-700",
    blue:   "bg-gray-50 border-gray-200 text-gray-700",
    slate:  "bg-slate-50 border-slate-200 text-slate-700",
    red:    "bg-gray-50 border-gray-200 text-gray-700",
    indigo: "bg-gray-50 border-gray-200 text-gray-700",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${palettes[color] ?? palettes.slate} ${wide ? "col-span-2" : ""}`}>
      <p className="text-[10px] text-slate-500 font-medium leading-none mb-1">{label}</p>
      <p className="text-sm font-bold leading-none">
        {value ?? "—"}
        {value != null && unit && <span className="text-xs font-normal ml-1 text-slate-500">{unit}</span>}
      </p>
    </div>
  );
}

// Compact uppercase KPI card used by the Dashboard widgets.
// Every colour except `electric`/`slate` renders the same neutral grey.
export default function KpiCard({ label, value, unit, color = "slate" }) {
  const ring = {
    electric: "border-electric-200 bg-electric-50",
    emerald:  "border-gray-200 bg-gray-50",
    amber:    "border-gray-200 bg-gray-50",
    blue:     "border-gray-200 bg-gray-50",
    violet:   "border-gray-200 bg-gray-50",
    slate:    "border-black/15 bg-surface-container-lowest",
  };
  const text = {
    electric: "text-electric-700",
    emerald:  "text-gray-700",
    amber:    "text-gray-700",
    blue:     "text-gray-700",
    violet:   "text-gray-700",
    slate:    "text-slate-700",
  };
  return (
    <div className={`border px-4 py-3 ${ring[color] ?? ring.slate}`}>
      <p className="text-[10px] text-black/60 uppercase tracking-widest font-bold">{label}</p>
      <p className={`text-lg font-black tracking-tighter leading-tight ${text[color] ?? text.slate}`}>
        {value ?? "—"}
        {value != null && <span className="text-sm font-medium ml-1">{unit}</span>}
      </p>
    </div>
  );
}

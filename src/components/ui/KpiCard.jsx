// Compact uppercase KPI card shared by the five CCS unit panels (Absorber,
// Compressor, Source, Storage, Stripper), which each carried an identical copy.
// Every colour except `electric`/`slate` renders the same neutral grey.
// Note: HydrogenPlantDashboard uses a visually different KpiCard and keeps its own.
export default function KpiCard({ label, value, unit, color = "slate" }) {
  const ring = {
    electric: "border-electric-200 bg-electric-50",
    emerald:  "border-gray-200 bg-gray-50",
    amber:    "border-gray-200 bg-gray-50",
    blue:     "border-gray-200 bg-gray-50",
    violet:   "border-gray-200 bg-gray-50",
    slate:    "border-slate-200 bg-slate-50",
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
    <div className={`rounded-xl border px-4 py-3 ${ring[color] ?? ring.slate}`}>
      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-lg font-bold leading-tight ${text[color] ?? text.slate}`}>
        {value ?? "—"}
        {value != null && <span className="text-sm font-medium ml-1">{unit}</span>}
      </p>
    </div>
  );
}

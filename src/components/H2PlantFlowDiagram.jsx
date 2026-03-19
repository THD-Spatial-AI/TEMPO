/**
 * H2PlantFlowDiagram.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulink-style interactive PFD for the Hydrogen Power Plant Digital Twin.
 * Built with @xyflow/react (React Flow v12).
 *
 * Props:
 *   elz, setElz, sto, setSto, fc, setFc   – parameter state + setters
 *   simState                               – 'idle'|'queued'|'running'|'done'|'error'
 *   kpi                                    – result KPIs (shown on nodes after done)
 *   models          {Object}               – { source, electrolyzer, compressor, storage, fuel_cell }
 *   selectedModels  {Object}               – currently active model per slot
 *   onSelectModel   {Function}             – (slotKey, model) callback
 *
 * nodeTypes MUST be defined at module scope to avoid infinite re-renders.
 */

import React, { useMemo, useState, useRef, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FiZap, FiCpu } from "react-icons/fi";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle badge colour helper
// ─────────────────────────────────────────────────────────────────────────────
function lifecycleDot(lifecycle) {
  if (lifecycle === "commercial")    return "bg-emerald-400";
  if (lifecycle === "projection")    return "bg-blue-400";
  if (lifecycle === "demonstration") return "bg-amber-400";
  return "bg-slate-300";
}

// ─────────────────────────────────────────────────────────────────────────────
// Rich model picker — expandable card list, stop propagation so node modal
// doesn't trigger when the user interacts with the picker.
// ─────────────────────────────────────────────────────────────────────────────
function ModelPicker({ slotKey, models, selected, onSelect, disabled }) {
  const [open, setOpen] = useState(false);

  if (!models?.length) return null;

  const stop = (e) => e.stopPropagation();

  const toggle = (e) => {
    stop(e);
    if (!disabled) setOpen((o) => !o);
  };

  const pick = (e, m) => {
    stop(e);
    onSelect(slotKey, m);
    setOpen(false);
  };

  const sourceLabel = selected?.source === "fallback" ? "built-in" : "api";

  return (
    <div className="mt-2 pt-2 border-t border-slate-100 relative" onClick={stop}>
      {/* Trigger button */}
      <button
        disabled={disabled}
        onClick={toggle}
        className={`nodrag w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left
          border transition-all text-[11px]
          ${ open
              ? "border-blue-400 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white hover:border-slate-300"
            }
          disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {selected ? (
          <>
            <span className={`shrink-0 w-2 h-2 rounded-full ${lifecycleDot(selected.lifecycle)}`} />
            <span className="flex-1 font-semibold truncate">{selected.name}</span>
            {selected.efficiency_pct != null && (
              <span className="shrink-0 text-[10px] text-slate-400">η {Number(selected.efficiency_pct).toFixed(0)}%</span>
            )}
            <span className="shrink-0 text-[9px] text-slate-300 font-normal">{sourceLabel}</span>
          </>
        ) : (
          <span className="text-slate-400">— choose model —</span>
        )}
        <svg className={`shrink-0 ml-auto w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute z-[9999] left-0 top-full mt-1 w-64 bg-white border border-slate-200
            rounded-xl shadow-xl overflow-hidden"
          onClick={stop}
        >
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              {models.length} variant{models.length !== 1 ? "s" : ""}
            </span>
            <button onClick={toggle} className="text-slate-400 hover:text-slate-600 text-xs leading-none">✕</button>
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
            {models.map((m) => {
              const isActive = selected?.id === m.id;
              return (
                <div
                  key={m.id}
                  onClick={(e) => pick(e, m)}
                  className={`px-3 py-2 cursor-pointer transition-colors
                    ${ isActive
                        ? "bg-blue-50 border-l-2 border-blue-400"
                        : "hover:bg-slate-50 border-l-2 border-transparent"
                      }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${lifecycleDot(m.lifecycle)}`} />
                    <span className="text-[11px] font-semibold text-slate-800 flex-1 truncate">{m.name}</span>
                    {m.efficiency_pct != null && (
                      <span className={`text-[10px] font-medium ${ isActive ? "text-blue-600" : "text-slate-400"}`}>
                        η {Number(m.efficiency_pct).toFixed(0)}%
                      </span>
                    )}
                    {isActive && <span className="text-[9px] text-blue-500">✓</span>}
                  </div>
                  {m.capacity_kw != null && (
                    <p className="text-[10px] text-slate-400 mt-0.5 ml-3.5">
                      {m.capacity_kw >= 1000
                        ? `${(m.capacity_kw / 1000).toFixed(1)} MW`
                        : `${m.capacity_kw} kW`}
                      {m.lifecycle ? ` · ${m.lifecycle}` : ""}
                    </p>
                  )}
                  {m.description && (
                    <p className="text-[10px] text-slate-400 mt-0.5 ml-3.5 line-clamp-2">{m.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV profile uploader — attach a custom hourly production curve
// Expected format:  time_h,value_kw   (header required)
// ─────────────────────────────────────────────────────────────────────────────
function CsvUploader({ customProfile, onSetCustomProfile, disabled }) {
  const fileRef = useRef(null);
  const stop    = (e) => e.stopPropagation();

  const handleChange = useCallback((e) => {
    stop(e);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.trim().split(/\r?\n/);
      // Detect separator
      const sep = lines[0].includes(";") ? ";" : ",";
      const header = lines[0].toLowerCase().split(sep).map((h) => h.trim());
      const tIdx = header.findIndex((h) => h.includes("time") || h === "t" || h.includes("date") || h.includes("timestamp"));
      const vIdx = header.findIndex((h) => h.includes("value") || h.includes("kw") || h.includes("power") || h.includes("prod") || h.includes("mw"));
      if (tIdx === -1 || vIdx === -1) {
        alert(`CSV must have a time/date column and a value/kw/power column.\nDetected headers: ${header.join(", ")}`);
        return;
      }

      // ── Parse all rows ───────────────────────────────────────────────────
      const rawRows = lines.slice(1).map((row) => {
        const cols = row.split(sep);
        const rawTime  = cols[tIdx]?.trim() ?? "";
        const rawValue = parseFloat(cols[vIdx]);
        return { rawTime, rawValue };
      }).filter((r) => r.rawTime && !isNaN(r.rawValue));

      if (!rawRows.length) {
        alert("No valid data rows found.");
        return;
      }

      // ── Detect and convert timestamp format ──────────────────────────────
      // Supports:  YYYY-MM-DD HH:mm:ss  or  YYYY-MM-DD  or  numeric (hours)
      const firstRaw = rawRows[0].rawTime;
      const isDatetime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(firstRaw);
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(firstRaw);

      let data;
      if (isDatetime || isDateOnly) {
        const t0 = new Date(rawRows[0].rawTime.replace(" ", "T")).getTime();
        data = rawRows.map((r) => {
          const ms   = new Date(r.rawTime.replace(" ", "T")).getTime();
          const t_h  = (ms - t0) / (1000 * 3600);
          // Scale MW → kW automatically
          const vKw  = header[vIdx].includes("mw") ? r.rawValue * 1000 : r.rawValue;
          return { time_h: +t_h.toFixed(4), value_kw: vKw, timestamp: r.rawTime };
        });
      } else {
        // Assume numeric hours
        data = rawRows.map((r) => ({
          time_h:    parseFloat(r.rawTime),
          value_kw:  header[vIdx].includes("mw") ? r.rawValue * 1000 : r.rawValue,
          timestamp: null,
        })).filter((r) => !isNaN(r.time_h));
      }

      onSetCustomProfile({ filename: file.name, rows: data.length, data });
    };
    reader.readAsText(file);
    // Reset so same file can be re-uploaded
    e.target.value = "";
  }, [onSetCustomProfile]);

  return (
    <div className="mt-2 pt-2 border-t border-dashed border-slate-200" onClick={stop}>
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide block mb-1.5">Production profile</span>
      <input
        ref={fileRef} type="file" accept=".csv,.tsv,.txt"
        className="hidden"
        onChange={handleChange}
      />
      {customProfile ? (
        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">
          <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#059669" strokeWidth="2.5">
            <path d="M3 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="flex-1 text-[10px] font-semibold text-emerald-700 truncate">
            {customProfile.filename}
          </span>
          <span className="shrink-0 text-[9px] text-emerald-500">{customProfile.rows} pts</span>
          <button
            onClick={(e) => { stop(e); onSetCustomProfile(null); }}
            className="shrink-0 text-[10px] text-red-400 hover:text-red-600 leading-none ml-1"
            title="Remove custom profile"
          >✕</button>
        </div>
      ) : (
        <button
          onClick={(e) => { stop(e); fileRef.current?.click(); }}
          disabled={disabled}
          className={`nodrag w-full flex items-center justify-center gap-1.5 px-2 py-1.5
            border border-dashed rounded-lg text-[10px] font-medium transition-all
            ${ disabled
                ? "border-slate-100 text-slate-300 cursor-not-allowed"
                : "border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50"
              }`}
        >
          <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10 3v10M5 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 17h14" strokeLinecap="round" />
          </svg>
          Upload CSV profile
        </button>
      )}
      {!customProfile && (
        <p className="text-[9px] text-slate-300 mt-1">YYYY-MM-DD HH:mm:ss , value_kw — overrides model defaults</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable compact field inside a node
// ─────────────────────────────────────────────────────────────────────────────
function NodeField({ label, unit, value, min, max, step = 1, onChange, disabled }) {
  return (
    <div
      className="flex items-center justify-between gap-1 mt-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[10px] text-slate-400 whitespace-nowrap leading-none">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          onClick={(e) => e.stopPropagation()}
          className="nodrag w-16 text-right text-[11px] font-semibold text-slate-700 bg-slate-50
            border border-slate-200 rounded-md px-1.5 py-0.5
            focus:outline-none focus:ring-1 focus:ring-blue-400
            disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontVariantNumeric: "tabular-nums" }}
        />
        <span className="text-[10px] text-slate-400 w-8 leading-none">{unit}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated status dot
// ─────────────────────────────────────────────────────────────────────────────
function StatusDot({ simState, color = "bg-slate-300" }) {
  if (simState === "running" || simState === "queued") {
    return <span className={`ml-auto w-2 h-2 rounded-full ${color} animate-pulse`} />;
  }
  if (simState === "done") {
    return <span className={`ml-auto w-2 h-2 rounded-full bg-emerald-400`} />;
  }
  return <span className={`ml-auto w-2 h-2 rounded-full bg-slate-200`} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE: Grid / Power Source
// ─────────────────────────────────────────────────────────────────────────────
function GridNode({ data, selected }) {
  const { simState, elz, setElz, models, selectedModels, onSelectModel,
          activeNodeId, customProfile, onSetCustomProfile } = data;
  const slotKey  = "source";
  const sel      = selectedModels?.[slotKey];
  const disabled = simState === "running" || simState === "queued";
  const isActive = activeNodeId === "grid";
  return (
    <div
      className={`bg-white rounded-xl border-2 shadow-md px-3 py-2.5 w-52 cursor-pointer transition-shadow
        ${ isActive
            ? "border-sky-500 shadow-sky-200 shadow-lg ring-2 ring-sky-300 ring-offset-1"
            : selected ? "border-amber-600 shadow-amber-100" : "border-amber-400 hover:border-amber-500 hover:shadow-amber-100 hover:shadow-lg"
          }
      `}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="p-1 rounded-lg bg-amber-50 text-amber-500"><FiZap size={12} /></span>
        <span className="text-xs font-bold text-slate-700 truncate max-w-[100px]">{sel?.name ?? "Power Source"}</span>
        <StatusDot simState={simState} color="bg-amber-400" />
      </div>
      {sel && !customProfile && (
        <p className="text-[10px] text-amber-600 font-semibold mb-1">
          {sel.efficiency_pct != null ? `η ${Number(sel.efficiency_pct).toFixed(0)}%` : "Generator"}
          {sel.capacity_kw != null ? ` · ${(sel.capacity_kw / 1000).toFixed(0)} MW` : ""}
        </p>
      )}
      {customProfile && (
        <p className="text-[10px] text-emerald-600 font-semibold mb-1">CSV profile active</p>
      )}
      {/* Read-only plant capacity from the selected model */}
      <div className="flex items-center justify-between mt-1 mb-0.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-[10px] text-slate-400 whitespace-nowrap leading-none">Plant Capacity</span>
        <span className="text-[11px] font-semibold text-amber-600">
          {sel?.capacity_kw != null
            ? sel.capacity_kw >= 1000
              ? `${(sel.capacity_kw / 1000).toFixed(1)} MW`
              : `${sel.capacity_kw} kW`
            : "— select model"}
        </span>
      </div>
      <ModelPicker
        slotKey={slotKey}
        models={models?.[slotKey]}
        selected={sel}
        onSelect={onSelectModel}
        disabled={disabled}
      />
      <CsvUploader
        customProfile={customProfile}
        onSetCustomProfile={onSetCustomProfile}
        disabled={disabled}
      />
      {/* Click-to-analyse affordance */}
      <div className={`mt-2 pt-1.5 border-t flex items-center justify-center gap-1 text-[10px] font-medium rounded-b transition-colors
        ${ isActive
            ? "border-sky-200 text-sky-600"
            : "border-slate-100 text-slate-400 hover:text-amber-500"
          }
      `}>
        <span>{isActive ? "▴ Close analysis" : "▾ Analyze generator"}</span>
      </div>
      <Handle type="source" position={Position.Right} id="elec-out"
        className="!bg-amber-400 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE: Electrolyzer
// ─────────────────────────────────────────────────────────────────────────────
function ElzNode({ data, selected }) {
  const { elz, setElz, simState, kpi, models, selectedModels, onSelectModel } = data;
  const slotKey  = "electrolyzer";
  const sel      = selectedModels?.[slotKey];
  const disabled = simState === "running" || simState === "queued";
  return (
    <div className={`bg-white rounded-xl border-2 shadow-md px-3 py-2.5 w-56
      ${selected ? "border-indigo-600 shadow-indigo-100" : "border-indigo-400"}
      ${simState === "running" ? "shadow-lg shadow-indigo-100" : ""}
    `}>
      <Handle type="target" position={Position.Left}   id="elec-in"
        className="!bg-amber-400 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="target" position={Position.Bottom} id="water-in"
        className="!bg-blue-400 !w-3 !h-3 !border-2 !border-white" style={{ left: "28%" }} />

      <div className="flex items-center gap-1.5 mb-1">
        <span className="p-1 rounded-lg bg-indigo-50 text-indigo-500"><FiZap size={12} /></span>
        <span className="text-xs font-bold text-slate-700 truncate max-w-[110px]">{sel?.name ?? "Electrolyzer"}</span>
        <StatusDot simState={simState} color="bg-indigo-400" />
      </div>
      {sel?.efficiency_pct != null && (
        <p className="text-[10px] text-indigo-600 font-semibold mb-1">η {Number(sel.efficiency_pct).toFixed(0)}%</p>
      )}

      <NodeField label="AC to ELZ"   unit="kW"    value={elz?.grid_power_kw ?? 300}     min={0}  max={5000} step={10} disabled={disabled} onChange={(v) => setElz?.((p) => ({ ...p, grid_power_kw: v }))} />
      <NodeField label="Water Flow"  unit="L/min" value={elz?.water_flow_rate_lpm ?? 90} min={0}  max={500}  step={5}  disabled={disabled} onChange={(v) => setElz?.((p) => ({ ...p, water_flow_rate_lpm: v }))} />
      <NodeField label="Temperature" unit="°C"    value={elz?.temperature_c ?? 70}       min={20} max={100}  step={1}  disabled={disabled} onChange={(v) => setElz?.((p) => ({ ...p, temperature_c: v }))} />

      {kpi?.avg_h2_production_nm3h != null && (
        <div className="mt-2 pt-1 border-t border-slate-100 animate-in fade-in duration-500">
          <p className="text-[10px] font-semibold text-emerald-600">
            Avg H₂: {Number(kpi.avg_h2_production_nm3h).toFixed(1)} Nm³/h
          </p>
        </div>
      )}
      <ModelPicker slotKey={slotKey} models={models?.[slotKey]} selected={sel} onSelect={onSelectModel} disabled={disabled} />
      <Handle type="source" position={Position.Right} id="h2-out"
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE: H₂ Compressor
// ─────────────────────────────────────────────────────────────────────────────
function CompressorNode({ data, selected }) {
  const { sto, setSto, simState, models, selectedModels, onSelectModel } = data;
  const slotKey  = "compressor";
  const sel      = selectedModels?.[slotKey];
  const disabled = simState === "running" || simState === "queued";
  return (
    <div className={`bg-white rounded-xl border-2 shadow-md px-3 py-2.5 w-48
      ${selected ? "border-amber-600 shadow-amber-100" : "border-amber-500"}
    `}>
      <Handle type="target" position={Position.Left}  id="h2-in"
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white" />

      <div className="flex items-center gap-1.5 mb-1">
        <span className="p-1 rounded-lg bg-amber-50 text-amber-500">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        </span>
        <span className="text-xs font-bold text-slate-700 truncate max-w-[90px]">{sel?.name ?? "Compressor"}</span>
        <StatusDot simState={simState} color="bg-amber-400" />
      </div>
      {sel?.efficiency_pct != null && (
        <p className="text-[10px] text-amber-600 font-semibold mb-1">η {Number(sel.efficiency_pct).toFixed(0)}%</p>
      )}

      <NodeField label="Efficiency" unit="[-]" value={sto?.compressor_efficiency ?? 0.78} min={0.3} max={1.0} step={0.01} disabled={disabled} onChange={(v) => setSto?.((p) => ({ ...p, compressor_efficiency: v }))} />

      <ModelPicker slotKey={slotKey} models={models?.[slotKey]} selected={sel} onSelect={onSelectModel} disabled={disabled} />

      <Handle type="source" position={Position.Right} id="h2-out"
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE: H₂ Storage Tank
// ─────────────────────────────────────────────────────────────────────────────
function TankNode({ data, selected }) {
  const { sto, setSto, simState, kpi, models, selectedModels, onSelectModel } = data;
  const slotKey  = "storage";
  const sel      = selectedModels?.[slotKey];
  const disabled = simState === "running" || simState === "queued";
  const peakP    = kpi?.peak_tank_pressure_bar;
  const maxP     = sto?.max_tank_pressure_bar ?? 350;
  const fillPct  = peakP ? Math.min(100, (peakP / maxP) * 100) : 0;

  return (
    <div className={`bg-white rounded-xl border-2 shadow-md px-3 py-2.5 w-52
      ${selected ? "border-amber-700 shadow-amber-100" : "border-amber-600"}
      ${simState === "running" ? "shadow-lg shadow-amber-100" : ""}
    `}>
      <Handle type="target" position={Position.Left}  id="h2-in"
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white" />

      <div className="flex items-center gap-1.5 mb-1">
        <span className="p-1 rounded-lg bg-amber-50 text-amber-600">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="4" y="6" width="16" height="12" rx="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
          </svg>
        </span>
        <span className="text-xs font-bold text-slate-700 truncate max-w-[100px]">{sel?.name ?? "H₂ Storage"}</span>
        <StatusDot simState={simState} color="bg-amber-500" />
      </div>

      <NodeField label="Max Pressure" unit="bar" value={maxP} min={50} max={700} step={10} disabled={disabled} onChange={(v) => setSto?.((p) => ({ ...p, max_tank_pressure_bar: v }))} />

      {peakP && (
        <div className="mt-2 pt-1 border-t border-slate-100 animate-in fade-in duration-500">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-slate-400">Peak pressure</span>
            <span className="font-semibold text-amber-600">{Number(peakP).toFixed(1)} bar</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-1000"
              style={{ width: `${fillPct}%` }} />
          </div>
        </div>
      )}

      <ModelPicker slotKey={slotKey} models={models?.[slotKey]} selected={sel} onSelect={onSelectModel} disabled={disabled} />
      <Handle type="source" position={Position.Right} id="h2-out"
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE: Fuel Cell Stack
// ─────────────────────────────────────────────────────────────────────────────
function FuelCellNode({ data, selected }) {
  const { fc, setFc, simState, kpi, models, selectedModels, onSelectModel } = data;
  const slotKey  = "fuel_cell";
  const sel      = selectedModels?.[slotKey];
  const disabled = simState === "running" || simState === "queued";
  return (
    <div className={`bg-white rounded-xl border-2 shadow-md px-3 py-2.5 w-56
      ${selected ? "border-violet-600 shadow-violet-100" : "border-violet-500"}
      ${simState === "running" ? "shadow-lg shadow-violet-100" : ""}
    `}>
      <Handle type="target" position={Position.Left}  id="h2-in"
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white" />

      <div className="flex items-center gap-1.5 mb-1">
        <span className="p-1 rounded-lg bg-violet-50 text-violet-500"><FiCpu size={12} /></span>
        <span className="text-xs font-bold text-slate-700 truncate max-w-[110px]">{sel?.name ?? "Fuel Cell"}</span>
        <StatusDot simState={simState} color="bg-violet-500" />
      </div>
      {sel?.efficiency_pct != null && (
        <p className="text-[10px] text-violet-600 font-semibold mb-1">η {Number(sel.efficiency_pct).toFixed(0)}%</p>
      )}

      <NodeField label="H₂ Flow"      unit="Nm³/h" value={fc?.h2_flow_rate_nm3h ?? 40}    min={0} max={200} step={1}   disabled={disabled} onChange={(v) => setFc?.((p) => ({ ...p, h2_flow_rate_nm3h: v }))} />
      <NodeField label="Ox. Pressure" unit="bar"   value={fc?.oxidant_pressure_bar ?? 2.5}  min={1} max={10}  step={0.1} disabled={disabled} onChange={(v) => setFc?.((p) => ({ ...p, oxidant_pressure_bar: v }))} />
      <NodeField label="Cooling"      unit="kW"    value={fc?.cooling_capacity_kw ?? 35}   min={0} max={200} step={1}   disabled={disabled} onChange={(v) => setFc?.((p) => ({ ...p, cooling_capacity_kw: v }))} />

      {kpi && (
        <div className="mt-2 pt-1 border-t border-slate-100 animate-in fade-in duration-500 space-y-0.5">
          <p className="text-[10px] font-semibold text-violet-600">
            Avg output: {Number(kpi.avg_fc_power_kw).toFixed(1)} kW
          </p>
          <p className="text-[10px] text-slate-400">
            η sys <span className="font-medium text-emerald-600">{Number(kpi.system_efficiency_pct).toFixed(1)} %</span>
          </p>
        </div>
      )}

      <ModelPicker slotKey={slotKey} models={models?.[slotKey]} selected={sel} onSelect={onSelectModel} disabled={disabled} />
      <Handle type="source" position={Position.Right} id="elec-out"
        className="!bg-amber-400 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE: AC Load / Grid Output
// ─────────────────────────────────────────────────────────────────────────────
function LoadNode({ data, selected }) {
  const { simState, kpi } = data;
  return (
    <div className={`bg-white rounded-xl border-2 shadow-md px-3 py-2.5 w-36
      ${selected ? "border-emerald-600 shadow-emerald-100" : "border-emerald-500"}
    `}>
      <Handle type="target" position={Position.Left} id="elec-in" className="!bg-amber-400 !w-3 !h-3 !border-2 !border-white" />

      <div className="flex items-center gap-1.5 mb-1">
        <span className="p-1 rounded-lg bg-emerald-50 text-emerald-500"><FiZap size={12} /></span>
        <span className="text-xs font-bold text-slate-700">AC Output</span>
        <StatusDot simState={simState} color="bg-emerald-400" />
      </div>
      <p className="text-[10px] text-slate-400 mb-1">Power to grid</p>
      {kpi ? (
        <p className="text-lg font-bold text-emerald-600 leading-none animate-in fade-in duration-500">
          {Number(kpi.avg_fc_power_kw).toFixed(1)}
          <span className="text-xs font-normal text-slate-400 ml-1">kW</span>
        </p>
      ) : (
        <p className="text-sm font-medium text-slate-300 leading-none">— kW</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE: Water Supply
// ─────────────────────────────────────────────────────────────────────────────
function WaterNode({ data, selected }) {
  return (
    <div className={`bg-white rounded-xl border-2 shadow-sm px-3 py-2 w-32
      ${selected ? "border-blue-500" : "border-blue-300"}
    `}>
      <div className="flex items-center gap-1.5">
        <span className="text-blue-400">
          {/* Droplet SVG */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2C12 2 5 10 5 15a7 7 0 0014 0C19 10 12 2 12 2z" />
          </svg>
        </span>
        <span className="text-xs font-bold text-slate-600">H₂O Supply</span>
      </div>
      <p className="text-[10px] text-slate-400">Deionised water</p>
      <Handle type="source" position={Position.Top} id="water-out" className="!bg-blue-400 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// nodeTypes MUST be at module scope — not inside the component
// ─────────────────────────────────────────────────────────────────────────────
const nodeTypes = {
  grid:         GridNode,
  electrolyzer: ElzNode,
  compressor:   CompressorNode,
  tank:         TankNode,
  fuelcell:     FuelCellNode,
  load:         LoadNode,
  water:        WaterNode,
};

// ─────────────────────────────────────────────────────────────────────────────
// Fixed node positions (users can still drag to customise)
// ─────────────────────────────────────────────────────────────────────────────
const INITIAL_POSITIONS = {
  grid:         { x: 20,   y: 195 },
  electrolyzer: { x: 215,  y: 100 },
  compressor:   { x: 530,  y: 155 },
  tank:         { x: 740,  y: 110 },
  fuelcell:     { x: 960,  y: 100 },
  load:         { x: 1190, y: 195 },
  water:        { x: 225,  y: 420 },
};

// Edge style helpers
const elecEdge  = (id, src, tgt, srcH, tgtH, lbl) => ({
  id, source: src, target: tgt, sourceHandle: srcH, targetHandle: tgtH,
  type: "smoothstep", animated: true,
  style: { stroke: "#f59e0b", strokeWidth: 2.5 },
  label: lbl, labelStyle: { fontSize: 10, fill: "#92400e", fontWeight: 600 },
  labelBgStyle: { fill: "#fef3c7", fillOpacity: 0.9 }, labelBgPadding: [4, 3], labelBgBorderRadius: 4,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b", width: 16, height: 16 },
});

const h2Edge = (id, src, tgt, srcH, tgtH, lbl) => ({
  id, source: src, target: tgt, sourceHandle: srcH, targetHandle: tgtH,
  type: "smoothstep", animated: true,
  style: { stroke: "#10b981", strokeWidth: 2.5, strokeDasharray: "6 3" },
  label: lbl, labelStyle: { fontSize: 10, fill: "#065f46", fontWeight: 600 },
  labelBgStyle: { fill: "#d1fae5", fillOpacity: 0.9 }, labelBgPadding: [4, 3], labelBgBorderRadius: 4,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981", width: 16, height: 16 },
});

const waterEdge = (id, src, tgt, srcH, tgtH, lbl) => ({
  id, source: src, target: tgt, sourceHandle: srcH, targetHandle: tgtH,
  type: "smoothstep", animated: true,
  style: { stroke: "#60a5fa", strokeWidth: 2, strokeDasharray: "4 3" },
  label: lbl, labelStyle: { fontSize: 10, fill: "#1d4ed8", fontWeight: 600 },
  labelBgStyle: { fill: "#dbeafe", fillOpacity: 0.9 }, labelBgPadding: [4, 3], labelBgBorderRadius: 4,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#60a5fa", width: 14, height: 14 },
});

const INITIAL_EDGES = [
  elecEdge  ("e-grid-elz",  "grid",         "electrolyzer", "elec-out", "elec-in",  "AC Power"),
  waterEdge ("e-water-elz", "water",         "electrolyzer", "water-out","water-in", "H₂O"),
  h2Edge    ("e-elz-comp",  "electrolyzer",  "compressor",   "h2-out",   "h2-in",    "H₂ gas"),
  h2Edge    ("e-comp-tank", "compressor",    "tank",         "h2-out",   "h2-in",    "Compressed H₂"),
  h2Edge    ("e-tank-fc",   "tank",          "fuelcell",     "h2-out",   "h2-in",    "H₂ stored"),
  elecEdge  ("e-fc-load",   "fuelcell",      "load",         "elec-out", "elec-in",  "AC Power"),
];

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export default function H2PlantFlowDiagram({
  elz, setElz, sto, setSto, fc, setFc,
  simState, kpi,
  models, selectedModels, onSelectModel,
  activeNodeId, onNodeClick,
  customProfile, onSetCustomProfile,
}) {
  const [nodes, , onNodesChange] = useNodesState(
    Object.entries(INITIAL_POSITIONS).map(([id, position]) => ({
      id,
      type: id,
      position,
      data: {},
    }))
  );
  const [edges, , onEdgesChange] = useEdgesState(INITIAL_EDGES);

  const liveNodes = useMemo(
    () =>
    nodes.map((n) => ({
        ...n,
        data: { elz, setElz, sto, setSto, fc, setFc, simState, kpi, models, selectedModels, onSelectModel,
                activeNodeId, customProfile, onSetCustomProfile },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, elz, sto, fc, simState, kpi, selectedModels, models, activeNodeId, customProfile]
  );

  const liveEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        animated: simState !== "idle",
        style: {
          ...e.style,
          opacity: simState === "idle" ? 0.55 : 1,
          animationDuration:
            simState === "running" ? "0.4s" :
            simState === "queued"  ? "1.0s" : "2s",
        },
      })),
    [edges, simState]
  );

  return (
    <div className="w-full rounded-2xl overflow-hidden border border-slate-700 shadow-xl" style={{ height: 560 }}>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-slate-900 border-b border-slate-700 text-[11px]">
        <span className="font-semibold text-slate-300 mr-1">Legend:</span>
        <span className="flex items-center gap-1.5 text-amber-300">
          <span className="inline-block w-5 h-0.5 bg-amber-400 rounded" />
          Electrical
        </span>
        <span className="flex items-center gap-1.5 text-emerald-300">
          <span className="inline-block w-5 h-0.5 border-t-2 border-emerald-400" style={{ borderStyle: "dashed" }} />
          H₂ gas
        </span>
        <span className="flex items-center gap-1.5 text-blue-300">
          <span className="inline-block w-5 h-0.5 border-t-2 border-blue-400" style={{ borderStyle: "dashed" }} />
          Water
        </span>
        <span className="flex items-center gap-2 text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />Commercial</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />Demo</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />Projection</span>
        </span>
        <span className="ml-auto text-slate-500 italic">Drag · zoom · <span className="text-amber-400">click a node</span> to open analysis</span>
      </div>

      <ReactFlow
        nodes={liveNodes}
        edges={liveEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        onNodeClick={onNodeClick}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        style={{ background: "#0f172a" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.5}
          color="#1e293b"
        />
        <Controls
          position="bottom-right"
          style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        />
        <MiniMap
          nodeColor={(n) =>
            ({ grid: "#f59e0b", electrolyzer: "#6366f1", compressor: "#f59e0b",
               tank: "#d97706", fuelcell: "#8b5cf6", load: "#10b981", water: "#60a5fa" }[n.type] ?? "#64748b")
          }
          maskColor="rgba(2,6,23,0.65)"
          position="bottom-left"
          style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "8px",
          }}
        />
      </ReactFlow>
    </div>
  );
}

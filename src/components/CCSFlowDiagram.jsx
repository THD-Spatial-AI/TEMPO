/**
 * CCSFlowDiagram.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive CCS Process Flow Diagram matching H₂ plant architecture.
 * Built with @xyflow/react (React Flow v12) - draggable nodes with connections.
 *
 * Props:
 *   result            {Object}    – simulation results with component data arrays
 *   isRunning         {boolean}   – whether simulation is currently running
 *   onNodeClick       {Function}  – (nodeId) callback when component is clicked
 *   ccsModels         {Object}    – models from OpenTech-DB for each CCS component
 *   selectedCcsModels {Object}    – currently selected models
 *   onSelectCcsModel  {Function}  – (slotKey, model) callback for tech selection
 *   simState          {string}    – simulation state
 */

import React, { useMemo, useState } from "react";
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
import { FiZap, FiDroplet, FiWind, FiBox, FiDatabase } from "react-icons/fi";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Lifecycle badge color
// ─────────────────────────────────────────────────────────────────────────────
function lifecycleDot(lifecycle) {
  if (lifecycle === "commercial") return "bg-emerald-400";
  if (lifecycle === "projection") return "bg-blue-400";
  if (lifecycle === "demonstration") return "bg-amber-400";
  return "bg-slate-300";
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Status indicator dot
// ─────────────────────────────────────────────────────────────────────────────
function StatusDot({ simState, color }) {
  if (simState !== "running" && simState !== "queued") return null;
  return (
    <span className={`ml-auto shrink-0 w-2 h-2 rounded-full ${color} animate-pulse`} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Model picker component - Memoized for performance
// ─────────────────────────────────────────────────────────────────────────────
function ModelPicker({ slotKey, models, selected, onSelect, disabled }) {
  const [open,    setOpen]    = useState(false);
  const [staged,  setStaged]  = useState(null);

  if (!models?.length) return null;

  const stop   = (e) => e.stopPropagation();
  const toggle = (e) => { stop(e); if (!disabled) setOpen((o) => !o); };
  const stage = (e, m) => { stop(e); setStaged(m); };

  const apply = (e, m) => {
    stop(e);
    const toApply = m ?? staged;
    if (!toApply) return;
    onSelect(slotKey, toApply);
    setStaged(null);
    setOpen(false);
  };

  const hasPending  = staged && staged.id !== selected?.id;
  const displayModel = hasPending ? staged : selected;

  return (
    <div className="mt-2 pt-2 border-t border-slate-100 relative" onClick={stop}>
      <div className="flex items-center gap-1">
        <button
          disabled={disabled}
          onClick={toggle}
          className={`nodrag flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left
            border transition-all text-[11px]
            ${ hasPending
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : open
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : selected
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white hover:border-slate-300"
              }
            disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {displayModel ? (
            <>
              <span className={`shrink-0 w-2 h-2 rounded-full ${lifecycleDot(displayModel.lifecycle)}`} />
              <span className="flex-1 font-semibold truncate">{displayModel.name}</span>
              {displayModel.efficiency_pct != null && (
                <span className="shrink-0 text-[10px] opacity-70">η {Number(displayModel.efficiency_pct).toFixed(0)}%</span>
              )}
              <span className={`shrink-0 text-[9px] font-bold ${hasPending ? "text-amber-500" : "text-emerald-500"}`}>
                {hasPending ? "●" : "✓"}
              </span>
            </>
          ) : (
            <span className="text-slate-400">— choose model —</span>
          )}
          <svg className={`shrink-0 w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        <button
          disabled={disabled || !hasPending}
          onClick={(e) => apply(e)}
          title={hasPending ? `Apply "${staged.name}"` : "No pending change"}
          className={`nodrag shrink-0 flex items-center justify-center w-7 h-7 rounded-lg border text-[11px] font-bold
            transition-all
            ${ hasPending
                ? "border-emerald-400 bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
                : "border-slate-200 bg-slate-100 text-slate-300 cursor-not-allowed"
              }`}
        >
          ✓
        </button>
      </div>

      {hasPending && (
        <p className="text-[9px] text-amber-600 font-medium mt-0.5 ml-0.5">
          Staged — click ✓ to apply
        </p>
      )}

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
              const isApplied = selected?.id === m.id;
              const isStaged  = staged?.id === m.id;
              return (
                <div
                  key={m.id}
                  onClick={(e) => { stage(e, m); }}
                  className={`px-3 py-2 cursor-pointer transition-colors
                    ${ isStaged
                        ? "bg-amber-50 border-l-2 border-amber-400"
                        : isApplied
                          ? "bg-emerald-50 border-l-2 border-emerald-400"
                          : "hover:bg-slate-50 border-l-2 border-transparent"
                      }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${lifecycleDot(m.lifecycle)}`} />
                    <span className="text-[11px] font-semibold text-slate-800 flex-1 truncate">{m.name}</span>
                    {m.efficiency_pct != null && (
                      <span className={`text-[10px] font-medium ${isStaged ? "text-amber-600" : isApplied ? "text-emerald-600" : "text-slate-400"}`}>
                        η {Number(m.efficiency_pct).toFixed(0)}%
                      </span>
                    )}
                    {isApplied && !isStaged && <span className="text-[9px] text-emerald-500 font-bold">✓ active</span>}
                  </div>
                  {m.description && (
                    <p className="text-[9px] text-slate-400 mt-0.5 ml-3.5 line-clamp-2">{m.description}</p>
                  )}
                  {isStaged && (
                    <button
                      onClick={(e) => apply(e, m)}
                      className="nodrag mt-1.5 ml-3.5 px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600 transition-colors"
                    >
                      Apply this model
                    </button>
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
// NODE: Flue Gas Source
// ─────────────────────────────────────────────────────────────────────────────
function SourceNode({ data, selected }) {
  const { simState, models, selectedModels, onSelectModel, result } = data;
  const slotKey = "source";
  const sel = selectedModels?.[slotKey];
  const disabled = simState === "running" || simState === "queued";

  const latest = result?.source ? {
    power: result.source.power_output_kw?.[result.source.power_output_kw.length - 1] ?? 0,
    co2: result.source.co2_concentration_pct?.[result.source.co2_concentration_pct.length - 1] ?? 0,
  } : null;

  return (
    <div className={`bg-white rounded-xl border-2 shadow-md px-3 py-2.5 w-64 cursor-pointer
      ${selected ? "border-orange-600 shadow-orange-100" : "border-orange-400"}
      ${simState === "running" ? "shadow-lg shadow-orange-100" : ""}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="p-1 rounded-lg bg-orange-50 text-orange-500"><FiZap size={12} /></span>
        <span className="text-xs font-bold text-slate-700 truncate max-w-[160px]">{sel?.name ?? "Flue Gas Source"}</span>
        <StatusDot simState={simState} color="bg-orange-400" />
      </div>
      {sel && (
        <p className="text-[10px] text-orange-600 font-semibold mb-1">
          {sel.capacity_kw ? `${(sel.capacity_kw / 1000).toFixed(0)} MW` : ""}
          {sel.co2_emission_kg_kwh ? ` · ${sel.co2_emission_kg_kwh.toFixed(2)} kg CO₂/kWh` : ""}
        </p>
      )}
      {latest && (
        <div className="mt-1 mb-1 p-1.5 bg-orange-50 rounded">
          <p className="text-[10px] font-semibold text-orange-700">{Math.round(latest.power)} kW</p>
          <p className="text-[9px] text-orange-600">{latest.co2.toFixed(1)}% CO₂</p>
        </div>
      )}
      <ModelPicker slotKey={slotKey} models={models?.[slotKey]} selected={sel} onSelect={onSelectModel} disabled={disabled} />
      <Handle type="source" position={Position.Right} id="flue-out" className="!bg-orange-400 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE: CO₂ Absorber
// ─────────────────────────────────────────────────────────────────────────────
function AbsorberNode({ data, selected }) {
  const { simState, models, selectedModels, onSelectModel, result } = data;
  const slotKey = "absorber";
  const sel = selectedModels?.[slotKey];
  const disabled = simState === "running" || simState === "queued";

  const latest = result?.absorber ? {
    capture: result.absorber.capture_efficiency_pct?.[result.absorber.capture_efficiency_pct.length - 1] ?? 0,
  } : null;

  return (
    <div className={`bg-white rounded-xl border-2 shadow-md px-3 py-2.5 w-64 cursor-pointer
      ${selected ? "border-blue-600 shadow-blue-100" : "border-blue-400"}
      ${simState === "running" ? "shadow-lg shadow-blue-100" : ""}`}
    >
      <Handle type="target" position={Position.Left} id="flue-in" className="!bg-orange-400 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-1.5 mb-1">
        <span className="p-1 rounded-lg bg-blue-50 text-blue-500"><FiDroplet size={12} /></span>
        <span className="text-xs font-bold text-slate-700 truncate max-w-[110px]">{sel?.name ?? "CO₂ Absorber"}</span>
        <StatusDot simState={simState} color="bg-blue-400" />
      </div>
      {sel?.efficiency_pct && (
        <p className="text-[10px] text-blue-600 font-semibold mb-1">η {Number(sel.efficiency_pct).toFixed(0)}%</p>
      )}
      {latest && (
        <div className="mt-1 mb-1 p-1.5 bg-blue-50 rounded">
          <p className="text-[10px] font-semibold text-blue-700">{latest.capture.toFixed(0)}% capture</p>
        </div>
      )}
      <ModelPicker slotKey={slotKey} models={models?.[slotKey]} selected={sel} onSelect={onSelectModel} disabled={disabled} />
      <Handle type="source" position={Position.Right} id="rich-out" className="!bg-blue-600 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE: Stripper/Regenerator
// ─────────────────────────────────────────────────────────────────────────────
function StripperNode({ data, selected }) {
  const { simState, models, selectedModels, onSelectModel, result } = data;
  const slotKey = "stripper";
  const sel = selectedModels?.[slotKey];
  const disabled = simState === "running" || simState === "queued";

  const latest = result?.stripper ? {
    thermal: result.stripper.thermal_input_kw?.[result.stripper.thermal_input_kw.length - 1] ?? 0,
  } : null;

  return (
    <div className={`bg-white rounded-xl border-2 shadow-md px-3 py-2.5 w-64 cursor-pointer
      ${selected ? "border-red-600 shadow-red-100" : "border-red-400"}
      ${simState === "running" ? "shadow-lg shadow-red-100" : ""}`}
    >
      <Handle type="target" position={Position.Left} id="rich-in" className="!bg-blue-600 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-1.5 mb-1">
        <span className="p-1 rounded-lg bg-red-50 text-red-500"><FiWind size={12} /></span>
        <span className="text-xs font-bold text-slate-700 truncate max-w-[110px]">{sel?.name ?? "Stripper"}</span>
        <StatusDot simState={simState} color="bg-red-400" />
      </div>
      {sel?.efficiency_pct && (
        <p className="text-[10px] text-red-600 font-semibold mb-1">η {Number(sel.efficiency_pct).toFixed(0)}%</p>
      )}
      {latest && (
        <div className="mt-1 mb-1 p-1.5 bg-red-50 rounded">
          <p className="text-[10px] font-semibold text-red-700">{Math.round(latest.thermal)} kW heat</p>
        </div>
      )}
      <ModelPicker slotKey={slotKey} models={models?.[slotKey]} selected={sel} onSelect={onSelectModel} disabled={disabled} />
      <Handle type="source" position={Position.Right} id="co2-out" className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE: CO₂ Compressor
// ─────────────────────────────────────────────────────────────────────────────
function CompressorNode({ data, selected }) {
  const { simState, models, selectedModels, onSelectModel, result } = data;
  const slotKey = "compressor";
  const sel = selectedModels?.[slotKey];
  const disabled = simState === "running" || simState === "queued";

  const latest = result?.compressor ? {
    power: result.compressor.power_consumed_kw?.[result.compressor.power_consumed_kw.length - 1] ?? 0,
    pressure: result.compressor.outlet_pressure_bar?.[result.compressor.outlet_pressure_bar.length - 1] ?? 0,
  } : null;

  return (
    <div className={`bg-white rounded-xl border-2 shadow-md px-3 py-2.5 w-64 cursor-pointer
      ${selected ? "border-amber-600 shadow-amber-100" : "border-amber-500"}
      ${simState === "running" ? "shadow-lg shadow-amber-100" : ""}`}
    >
      <Handle type="target" position={Position.Left} id="co2-in" className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-1.5 mb-1">
        <span className="p-1 rounded-lg bg-amber-50 text-amber-500"><FiBox size={12} /></span>
        <span className="text-xs font-bold text-slate-700 truncate max-w-[110px]">{sel?.name ?? "Compressor"}</span>
        <StatusDot simState={simState} color="bg-amber-400" />
      </div>
      {sel?.efficiency_pct && (
        <p className="text-[10px] text-amber-600 font-semibold mb-1">η {Number(sel.efficiency_pct).toFixed(0)}%</p>
      )}
      {latest && (
        <div className="mt-1 mb-1 p-1.5 bg-amber-50 rounded">
          <p className="text-[10px] font-semibold text-amber-700">{Math.round(latest.power)} kW</p>
          <p className="text-[9px] text-amber-600">{Math.round(latest.pressure)} bar</p>
        </div>
      )}
      <ModelPicker slotKey={slotKey} models={models?.[slotKey]} selected={sel} onSelect={onSelectModel} disabled={disabled} />
      <Handle type="source" position={Position.Right} id="hp-out" className="!bg-amber-600 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE: CO₂ Storage
// ─────────────────────────────────────────────────────────────────────────────
function StorageNode({ data, selected }) {
  const { simState, models, selectedModels, onSelectModel, result } = data;
  const slotKey = "storage";
  const sel = selectedModels?.[slotKey];
  const disabled = simState === "running" || simState === "queued";

  const latest = result?.storage ? {
    rate: result.storage.injection_rate_kg_h?.[result.storage.injection_rate_kg_h.length - 1] ?? 0,
    total: result.storage.cumulative_stored_tco2?.[result.storage.cumulative_stored_tco2.length - 1] ?? 0,
  } : null;

  return (
    <div className={`bg-white rounded-xl border-2 shadow-md px-3 py-2.5 w-64 cursor-pointer
      ${selected ? "border-emerald-600 shadow-emerald-100" : "border-emerald-500"}
      ${simState === "running" ? "shadow-lg shadow-emerald-100" : ""}`}
    >
      <Handle type="target" position={Position.Left} id="hp-in" className="!bg-amber-600 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-1.5 mb-1">
        <span className="p-1 rounded-lg bg-emerald-50 text-emerald-500"><FiDatabase size={12} /></span>
        <span className="text-xs font-bold text-slate-700 truncate max-w-[110px]">{sel?.name ?? "CO₂ Storage"}</span>
        <StatusDot simState={simState} color="bg-emerald-400" />
      </div>
      {sel && (
        <p className="text-[10px] text-emerald-600 font-semibold mb-1">
          {sel.capacity_tco2_yr ? `${(sel.capacity_tco2_yr / 1000000).toFixed(1)} Mt/yr` : "Geological"}
        </p>
      )}
      {latest && (
        <div className="mt-1 mb-1 p-1.5 bg-emerald-50 rounded">
          <p className="text-[10px] font-semibold text-emerald-700">{Math.round(latest.rate)} kg/h</p>
          <p className="text-[9px] text-emerald-600">{latest.total.toFixed(1)} t stored</p>
        </div>
      )}
      <ModelPicker slotKey={slotKey} models={models?.[slotKey]} selected={sel} onSelect={onSelectModel} disabled={disabled} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// nodeTypes MUST be at module scope
// ─────────────────────────────────────────────────────────────────────────────
const nodeTypes = {
  source:     SourceNode,
  absorber:   AbsorberNode,
  stripper:   StripperNode,
  compressor: CompressorNode,
  storage:    StorageNode,
};

// ─────────────────────────────────────────────────────────────────────────────
// Fixed node positions (users can drag to customize)
// ─────────────────────────────────────────────────────────────────────────────
const INITIAL_POSITIONS = {
  source:     { x: 20,   y: 150 },
  absorber:   { x: 280,  y: 150 },
  stripper:   { x: 540,  y: 150 },
  compressor: { x: 800,  y: 150 },
  storage:    { x: 1060, y: 150 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Edge styles for different flow types
// ─────────────────────────────────────────────────────────────────────────────
const flueGasEdge = (id, src, tgt, srcH, tgtH, lbl) => ({
  id, source: src, target: tgt, sourceHandle: srcH, targetHandle: tgtH,
  type: "smoothstep", animated: true,
  style: { stroke: "#f97316", strokeWidth: 2.5, strokeDasharray: "4 3" },
  label: lbl, labelStyle: { fontSize: 10, fill: "#9a3412", fontWeight: 600 },
  labelBgStyle: { fill: "#fed7aa", fillOpacity: 0.9 }, labelBgPadding: [4, 3], labelBgBorderRadius: 4,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#f97316", width: 16, height: 16 },
});

const richSolventEdge = (id, src, tgt, srcH, tgtH, lbl) => ({
  id, source: src, target: tgt, sourceHandle: srcH, targetHandle: tgtH,
  type: "smoothstep", animated: true,
  style: { stroke: "#3b82f6", strokeWidth: 2.5, strokeDasharray: "6 3" },
  label: lbl, labelStyle: { fontSize: 10, fill: "#1e3a8a", fontWeight: 600 },
  labelBgStyle: { fill: "#bfdbfe", fillOpacity: 0.9 }, labelBgPadding: [4, 3], labelBgBorderRadius: 4,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6", width: 16, height: 16 },
});

const pureCO2Edge = (id, src, tgt, srcH, tgtH, lbl) => ({
  id, source: src, target: tgt, sourceHandle: srcH, targetHandle: tgtH,
  type: "smoothstep", animated: true,
  style: { stroke: "#10b981", strokeWidth: 2.5, strokeDasharray: "5 3" },
  label: lbl, labelStyle: { fontSize: 10, fill: "#065f46", fontWeight: 600 },
  labelBgStyle: { fill: "#d1fae5", fillOpacity: 0.9 }, labelBgPadding: [4, 3], labelBgBorderRadius: 4,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981", width: 16, height: 16 },
});

const compressedCO2Edge = (id, src, tgt, srcH, tgtH, lbl) => ({
  id, source: src, target: tgt, sourceHandle: srcH, targetHandle: tgtH,
  type: "smoothstep", animated: true,
  style: { stroke: "#f59e0b", strokeWidth: 3, strokeDasharray: "8 4" },
  label: lbl, labelStyle: { fontSize: 10, fill: "#78350f", fontWeight: 600 },
  labelBgStyle: { fill: "#fde68a", fillOpacity: 0.9 }, labelBgPadding: [4, 3], labelBgBorderRadius: 4,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b", width: 18, height: 18 },
});

const INITIAL_EDGES = [
  flueGasEdge      ("e-source-absorber",  "source",     "absorber",   "flue-out", "flue-in",  "Flue Gas"),
  richSolventEdge  ("e-absorber-stripper","absorber",   "stripper",   "rich-out", "rich-in",  "Rich Solvent"),
  pureCO2Edge      ("e-stripper-comp",    "stripper",   "compressor", "co2-out",  "co2-in",   "Pure CO₂"),
  compressedCO2Edge("e-comp-storage",     "compressor", "storage",    "hp-out",   "hp-in",    "HP CO₂"),
];

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export default function CCSFlowDiagram({ 
  result, 
  isRunning, 
  onNodeClick, 
  ccsModels, 
  selectedCcsModels, 
  onSelectCcsModel,
  simState 
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

  // Stable data object to prevent re-renders during drag
  const nodeData = useMemo(
    () => ({ simState, result, models: ccsModels, selectedModels: selectedCcsModels, onSelectModel: onSelectCcsModel }),
    [simState, result, ccsModels, selectedCcsModels, onSelectCcsModel]
  );

  const liveNodes = useMemo(
    () => nodes.map((n) => ({ ...n, data: nodeData })),
    [nodes, nodeData]
  );

  const liveEdges = useMemo(
    () => edges.map((e) => {
        const isActive = simState === "running" || simState === "queued";
        return {
          ...e,
          animated: isActive,
          style: {
            ...e.style,
            opacity: simState === "idle" ? 0.6 : 1,
          },
        };
      }),
    [edges, simState]
  );

  return (
    <div className="w-full rounded-2xl overflow-hidden border border-slate-700 shadow-xl" style={{ height: 560 }}>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-slate-900 border-b border-slate-700 text-[11px]">
        <span className="font-semibold text-slate-300 mr-1">CCS Process Flow:</span>
        <span className="flex items-center gap-1.5 text-orange-300">
          <span className="inline-block w-5 h-0.5 border-t-2 border-orange-400" style={{ borderStyle: "dashed" }} />
          Flue Gas
        </span>
        <span className="flex items-center gap-1.5 text-blue-300">
          <span className="inline-block w-5 h-0.5 border-t-2 border-blue-400" style={{ borderStyle: "dashed" }} />
          Rich Solvent
        </span>
        <span className="flex items-center gap-1.5 text-emerald-300">
          <span className="inline-block w-5 h-0.5 border-t-2 border-emerald-400" style={{ borderStyle: "dashed" }} />
          Pure CO₂
        </span>
        <span className="flex items-center gap-1.5 text-amber-300">
          <span className="inline-block w-5 h-0.5 bg-amber-400 rounded" />
          Compressed CO₂
        </span>
        <span className="flex items-center gap-2 text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />Commercial</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />Demo</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />Projection</span>
        </span>
        <span className="ml-auto text-slate-500 italic">Drag · zoom · <span className="text-amber-400">click a node</span> to configure</span>
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
        preventScrolling={false}
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
          nodeColor={(n) => {
            if (n.type === "source") return "#f97316";
            if (n.type === "absorber") return "#3b82f6";
            if (n.type === "stripper") return "#ef4444";
            if (n.type === "compressor") return "#f59e0b";
            if (n.type === "storage") return "#10b981";
            return "#64748b";
          }}
          style={{
            background: "#1e293b",
            border: "1px solid #334155",
          }}
          maskColor="rgba(15, 23, 42, 0.85)"
        />
      </ReactFlow>
    </div>
  );
}

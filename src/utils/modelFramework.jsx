import React from 'react';

export const FRAMEWORKS = {
  calliope06: { label: 'Calliope 0.6', badge: 'C0.6', color: 'bg-blue-50 text-blue-700' },
  calliope07: { label: 'Calliope 0.7', badge: 'C0.7', color: 'bg-purple-50 text-purple-700' },
  pypsa:      { label: 'PyPSA',        badge: 'PyPSA', color: 'bg-green-50 text-green-700' },
  osemosys:   { label: 'OSeMOSYS',     badge: 'OSeMOSYS', color: 'bg-orange-50 text-orange-700' },
  adoptnet:   { label: 'AdoptNET',     badge: 'AdoptNET', color: 'bg-rose-50 text-rose-700' },
  unknown:    { label: 'Unknown',      badge: '?', color: 'bg-gray-100 text-gray-600' },
};

export function getModelFramework(model) {
  if (!model) return 'unknown';
  const ver = String(model.metadata?.modelConfig?.calliopeVersion ?? '');
  if (ver.startsWith('0.7')) return 'calliope07';
  // All other models default to calliope06 (primary engine, no version = 0.6.8)
  return 'calliope06';
}

export function FrameworkBadge({ framework, className = '' }) {
  const meta = FRAMEWORKS[framework] ?? FRAMEWORKS.unknown;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.color} ${className}`}>
      {meta.badge}
    </span>
  );
}

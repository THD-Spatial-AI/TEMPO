/**
 * Per-engine capability flags for ScenarioStudio TransformOps.
 * Drives the capability warning banner in the Preview panel.
 *
 * Levels:
 *   true      — fully supported
 *   'partial' — supported with caveats (see warning text)
 *   'warn'    — mapped but may produce unexpected results
 *   false     — not supported; op will be ignored
 */

export const ENGINE_CAPABILITIES = {
  calliope06: {
    scaleParam:       true,
    setParam:         true,
    disableTech:      true,
    systemConstraint: { co2_cap: true, renewable_min: true, reserve_margin: true },
  },
  calliope07: {
    scaleParam:       true,
    setParam:         true,
    disableTech:      true,
    systemConstraint: { co2_cap: true, renewable_min: true, reserve_margin: 'warn' },
  },
  pypsa: {
    scaleParam:       true,
    setParam:         true,
    disableTech:      true,
    systemConstraint: { co2_cap: 'partial', renewable_min: false, reserve_margin: false },
  },
  osemosys: {
    scaleParam:       'partial',
    setParam:         'partial',
    disableTech:      true,
    systemConstraint: { co2_cap: 'partial', renewable_min: false, reserve_margin: false },
  },
  adoptnet0: {
    scaleParam:       true,
    setParam:         true,
    disableTech:      true,
    systemConstraint: { co2_cap: false, renewable_min: false, reserve_margin: false },
  },
};

export const ENGINE_LABELS = {
  calliope06: 'Calliope 0.6',
  calliope07: 'Calliope 0.7',
  pypsa:      'PyPSA',
  osemosys:   'OSeMOSYS',
  adoptnet0:  'AdOpT-NET0',
};

export const ENGINE_FRAMEWORK = {
  calliope06: 'calliope',
  calliope07: 'calliope07',
  pypsa:      'pypsa',
  osemosys:   'osemosys',
  adoptnet0:  'adoptnet0',
};

const SYSTEM_CONSTRAINT_LABELS = {
  co2_cap:        'CO₂ cap',
  renewable_min:  'Renewable min share',
  reserve_margin: 'Reserve margin',
};

/**
 * Get warning strings for ops not fully supported by an engine.
 * @param {string} engine  Key in ENGINE_CAPABILITIES
 * @param {TransformOp[]} ops
 * @returns {string[]}
 */
export function getCapabilityWarnings(engine, ops) {
  const caps = ENGINE_CAPABILITIES[engine];
  if (!caps) return [];
  const label = ENGINE_LABELS[engine] || engine;
  const warns = new Set();

  for (const op of ops || []) {
    if (op.op === 'scaleParam' && caps.scaleParam !== true) {
      if (caps.scaleParam === false)
        warns.add(`${label}: scaleParam is not supported — parameter values will not be scaled.`);
      else
        warns.add(`${label}: scaleParam may not apply to all parameter paths.`);
    }
    if (op.op === 'setParam' && caps.setParam !== true) {
      if (caps.setParam === false)
        warns.add(`${label}: setParam is not supported.`);
      else
        warns.add(`${label}: setParam works for technology-level parameters but may skip cost entries.`);
    }
    if (op.op === 'systemConstraint') {
      const kindCap = caps.systemConstraint?.[op.kind];
      const kindLabel = SYSTEM_CONSTRAINT_LABELS[op.kind] || op.kind;
      if (kindCap === false)
        warns.add(`${label}: "${kindLabel}" is not supported by this engine and will be ignored.`);
      else if (kindCap === 'partial')
        warns.add(`${label}: "${kindLabel}" is partially supported — verify results carefully.`);
      else if (kindCap === 'warn')
        warns.add(`${label}: "${kindLabel}" may produce unexpected results in this engine version.`);
    }
  }
  return [...warns];
}

/**
 * Infer an engine key from a model's configuration.
 * Used to pre-set the engine selector when a model is selected.
 */
export function engineKeyFromModel(model) {
  const v = String(model?.modelConfig?.calliopeVersion || '');
  if (v.startsWith('0.7')) return 'calliope07';
  const e = model?.modelConfig?.engine || '';
  if (e === 'pypsa') return 'pypsa';
  if (e === 'osemosys') return 'osemosys';
  if (e === 'adoptnet0') return 'adoptnet0';
  return 'calliope06';
}

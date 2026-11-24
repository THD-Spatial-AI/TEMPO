import { describe, it, expect } from 'vitest';
import serviceLayer from '../serviceLayer.cjs';
const { ensureServiceLayer, ensurePinnedPackages, exactPins, createRepairGate, SERVICE_LAYER_CHECK } = serviceLayer;

describe('createRepairGate', () => {
  it('allows attempts until a failure is recorded', () => {
    const gate = createRepairGate();
    expect(gate.canAttempt()).toBe(true);
    gate.recordFailure('offline');
    expect(gate.canAttempt()).toBe(false);
    expect(gate.lastError()).toBe('offline');
  });

  it('lets a forced attempt through and clears on success', () => {
    const gate = createRepairGate();
    gate.recordFailure('offline');
    expect(gate.canAttempt({ force: true })).toBe(true);
    gate.clear();
    expect(gate.canAttempt()).toBe(true);
    expect(gate.lastError()).toBe(null);
  });
});

const runner = (results) => {
  const calls = [];
  const run = async (cmd, args) => { calls.push(args); const r = results.shift(); if (r instanceof Error) throw r; return r; };
  return { run, calls };
};

describe('ensureServiceLayer', () => {
  it('does nothing when fastapi and uvicorn import', async () => {
    const { run, calls } = runner(['ok']);
    const res = await ensureServiceLayer({ python: 'py', requirementsPath: 'req.txt', run, log: () => {} });
    expect(res).toEqual({ ok: true, repaired: false });
    expect(calls).toEqual([['-c', SERVICE_LAYER_CHECK]]);
  });

  it('pip-installs requirements.service.txt when the import fails, then re-checks', async () => {
    const { run, calls } = runner([new Error('No module named fastapi'), 'installed', 'ok']);
    const logs = [];
    const res = await ensureServiceLayer({ python: 'py', requirementsPath: 'req.txt', run, log: l => logs.push(l) });
    expect(res).toEqual({ ok: true, repaired: true });
    expect(calls[1]).toEqual(['-m', 'pip', 'install', '--prefer-binary', '--no-warn-script-location', '-r', 'req.txt']);
    expect(logs.join('\n')).toMatch(/FastAPI/);
  });

  it('reports failure when repair does not help', async () => {
    const { run } = runner([new Error('x'), new Error('pip failed')]);
    const res = await ensureServiceLayer({ python: 'py', requirementsPath: 'req.txt', run, log: () => {} });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/pip failed/);
  });
});

describe('exactPins', () => {
  it('reads name==version lines only, ignoring comments, ranges and markers', () => {
    const text = '# x\npypsa==0.35.2\r\npandas==2.3.1  # why\nhighspy>=1.7\nfoo==1; python_version<"3.11"\n';
    expect(exactPins(text)).toEqual({ pypsa: '0.35.2', pandas: '2.3.1' });
  });
});

describe('ensurePinnedPackages', () => {
  const base = { python: 'py', requirementsPath: 'req.txt', readFile: () => 'pandas==2.3.1\n', log: () => {} };

  it('does nothing when the venv matches the pins', async () => {
    const { run, calls } = runner(['{}']);
    expect(await ensurePinnedPackages({ ...base, run })).toEqual({ ok: true, repaired: false });
    expect(calls).toHaveLength(1);
  });

  it('reinstalls the requirements when a pin drifted', async () => {
    const { run, calls } = runner(['{"pandas": "3.1.1"}', '']);
    expect(await ensurePinnedPackages({ ...base, run })).toEqual({ ok: true, repaired: true });
    expect(calls[1]).toEqual(['-m', 'pip', 'install', '--prefer-binary', '--no-warn-script-location', '-r', 'req.txt']);
  });

  it('reports a failed reinstall', async () => {
    const { run } = runner(['{"pandas": "3.1.1"}', new Error('offline')]);
    expect(await ensurePinnedPackages({ ...base, run })).toEqual({ ok: false, repaired: false, error: 'offline' });
  });

  it('skips files without exact pins', async () => {
    const { run, calls } = runner([]);
    expect(await ensurePinnedPackages({ ...base, readFile: () => 'highspy>=1.7\n', run })).toEqual({ ok: true, repaired: false });
    expect(calls).toHaveLength(0);
  });
});

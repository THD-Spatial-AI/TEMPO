import { describe, it, expect } from 'vitest';
import serviceLayer from '../serviceLayer.cjs';
const { ensureServiceLayer, SERVICE_LAYER_CHECK } = serviceLayer;

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

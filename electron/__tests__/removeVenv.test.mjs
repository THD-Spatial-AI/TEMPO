import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import removeVenv from '../removeVenv.cjs';
const { removeVenvDir } = removeVenv;

let root;
let venv;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tempo-removevenv-'));
  venv = path.join(root, 'some-venv');
  fs.mkdirSync(path.join(venv, 'Lib', 'site-packages'), { recursive: true });
  fs.writeFileSync(path.join(venv, 'pyvenv.cfg'), 'home = x');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('removeVenvDir', () => {
  it('succeeds when there is nothing to remove', async () => {
    let calls = 0;
    const res = await removeVenvDir(path.join(root, 'missing'), { remove: async () => { calls++; } });
    expect(res).toEqual({ success: true });
    expect(calls).toBe(0);
  });

  it('removes a real directory with the default remover', async () => {
    expect(await removeVenvDir(venv)).toEqual({ success: true });
    expect(fs.existsSync(venv)).toBe(false);
  });

  it('keeps retrying while files stay locked, then succeeds', async () => {
    let calls = 0;
    const remove = async (dir) => { if (++calls === 3) fs.rmSync(dir, { recursive: true, force: true }); };
    const res = await removeVenvDir(venv, { remove, attempts: 5, intervalMs: 1 });
    expect(res).toEqual({ success: true });
    expect(calls).toBe(3);
  });

  it('reports failure once the attempts run out', async () => {
    let calls = 0;
    const res = await removeVenvDir(venv, { remove: async () => { calls++; }, attempts: 3, intervalMs: 1 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/in use/);
    expect(calls).toBe(3);
    expect(fs.existsSync(venv)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import store from '../templateStore.cjs';
const { createTemplateStore } = store;

const remotes = [{ prefix: 'remote/model', repo: 'o/r', ref: 'abc', skip: [/^big\.csv$/] }];
const tree = { truncated: false, tree: [
  { type: 'blob', path: 'model.yaml', size: 21 }, { type: 'blob', path: 'data/a.csv', size: 16 },
  { type: 'blob', path: 'big.csv' }, { type: 'tree', path: 'data' },
] };
const mkFetch = (calls, fail = false) => async (url) => {
  calls.push(url);
  if (fail) return { ok: false, status: 500 };
  if (url.includes('api.github.com')) return { ok: true, json: async () => tree };
  return { ok: true, body: new Response('content of ' + url.split('/').pop()).body };
};
const dirs = () => ({
  bundledDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tb-')),
  cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tc-')),
});

describe('templateStore', () => {
  it('downloads once, skips filtered files, then serves from cache', async () => {
    const calls = []; const d = dirs();
    const s = createTemplateStore({ ...d, remotes, fetchImpl: mkFetch(calls) });
    const p = await s.resolve('remote/model/model.yaml');
    expect(fs.readFileSync(p, 'utf-8')).toBe('content of model.yaml');
    expect(fs.existsSync(path.join(d.cacheDir, 'remote/model/data/a.csv'))).toBe(true);
    expect(fs.existsSync(path.join(d.cacheDir, 'remote/model/big.csv'))).toBe(false);
    const n = calls.length;
    await s.resolve('remote/model/data/a.csv');
    expect(calls.length).toBe(n);
  });
  it('reports byte progress ending at the total', async () => {
    const d = dirs(); const seen = [];
    const s = createTemplateStore({ ...d, remotes, fetchImpl: mkFetch([]), onProgress: (p) => seen.push(p) });
    await s.resolve('remote/model/model.yaml');
    const last = seen[seen.length - 1];
    expect(last).toEqual({ prefix: 'remote/model', done: 37, total: 37 });
  });
  it('shares one download across concurrent calls', async () => {
    const calls = []; const d = dirs();
    const s = createTemplateStore({ ...d, remotes, fetchImpl: mkFetch(calls) });
    await Promise.all([s.resolve('remote/model/model.yaml'), s.resolve('remote/model/data/a.csv')]);
    expect(calls.filter((u) => u.includes('api.github.com')).length).toBe(1);
  });
  it('prefers bundled files and never downloads for them', async () => {
    const calls = []; const d = dirs();
    fs.mkdirSync(path.join(d.bundledDir, 'remote/model'), { recursive: true });
    fs.writeFileSync(path.join(d.bundledDir, 'remote/model/model.yaml'), 'x');
    const s = createTemplateStore({ ...d, remotes, fetchImpl: mkFetch(calls) });
    expect(await s.resolve('remote/model/model.yaml')).toContain(d.bundledDir);
    expect(calls.length).toBe(0);
  });
  it('returns null for unknown paths and traversal; available() never downloads', async () => {
    const calls = []; const d = dirs();
    const s = createTemplateStore({ ...d, remotes, fetchImpl: mkFetch(calls) });
    expect(await s.resolve('nope/x.yaml')).toBeNull();
    expect(await s.resolve('../../etc/passwd')).toBeNull();
    expect(s.available('remote/model/model.yaml')).toBe(true);
    expect(s.available('nope/x')).toBe(false);
    expect(calls.length).toBe(0);
  });
  it('leaves no partial cache when the download fails', async () => {
    const d = dirs();
    const s = createTemplateStore({ ...d, remotes, fetchImpl: mkFetch([], true) });
    await expect(s.resolve('remote/model/model.yaml')).rejects.toThrow();
    expect(fs.readdirSync(d.cacheDir)).toEqual([]);
  });
});

describe('templateStore path mapping', () => {
  it('maps a differently laid-out repo onto the local template layout', async () => {
    const d = dirs();
    const mapTree = { truncated: false, tree: [
      { type: 'blob', path: 'sub/Model/model.yaml', size: 1 },
      { type: 'blob', path: 'sub/Model/__pycache__/x.pyc', size: 1 },
      { type: 'blob', path: 'extra/w_1989.csv', size: 1 },
      { type: 'blob', path: 'README.md', size: 1 },
    ] };
    const fetchImpl = async (url) => url.includes('api.github.com')
      ? { ok: true, json: async () => mapTree }
      : { ok: true, body: new Response('x').body };
    const remotes2 = [{ prefix: 'It', repo: 'o/r', ref: 'abc', skip: [/__pycache__\//],
      map: (p) => p.startsWith('sub/Model/') ? p.slice(10) : (p === 'extra/w_1989.csv' ? 'timeseries_data/w_1989.csv' : null) }];
    const s = createTemplateStore({ ...d, remotes: remotes2, fetchImpl });
    await s.resolve('It/model.yaml');
    const got = [];
    const walk = (p) => fs.readdirSync(p, { withFileTypes: true }).forEach((e) => e.isDirectory() ? walk(path.join(p, e.name)) : got.push(path.relative(d.cacheDir, path.join(p, e.name)).split(path.sep).join('/')));
    walk(d.cacheDir);
    expect(got.sort()).toEqual(['It/.tempo-complete', 'It/model.yaml', 'It/timeseries_data/w_1989.csv']);
  });
});

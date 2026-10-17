// Resolves template files for the "Import template" flow.
//
// Small templates ship with the app (resources/templates). Large third-party ones
// (UK-Calliope, Cambridge-Calliope) are downloaded from GitHub on first use, pinned
// to a commit, and cached under userData/templates so later use is offline.
// No electron dependency — unit-testable.
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

// `prefix` is the folder the template occupies under the templates root; the
// remote repo root maps onto it. `skip` filters repo-relative paths. Optional
// `map(remotePath)` returns the path relative to `prefix` (null to drop the file)
// for repos whose layout differs from the local one.
const ITALY_MODEL = 'italy_20_regions_v.0.2/Model/';
const ITALY_WEATHER = /^paper_scenarios\/full_list_of_weather_years\/((?:pv|wind|windoff)_(?:1989|2010)\.csv)$/;
const REMOTE_TEMPLATES = [
  {
    prefix: 'Italian_model',
    repo: 'FLomb/Calliope-Italy',
    ref: 'a811645631d4c593a60ff2bf81136ac4130514d5',
    skip: [/__pycache__\//],
    // Model folder as-is, plus the worst/best weather-year series used by the sensitivity cases
    map: (p) => {
      if (p.startsWith(ITALY_MODEL)) return p.slice(ITALY_MODEL.length);
      const w = ITALY_WEATHER.exec(p);
      return w ? 'timeseries_data/' + w[1] : null;
    },
  },
  {
    prefix: 'uk-calliope-master/uk-calliope-master',
    repo: 'calliope-project/uk-calliope',
    ref: '28069f7bd704d1b4abf1364ea0b67a4db796a46c',
    skip: [/^data\/demand_2014\.csv$/],
  },
  {
    prefix: 'cambridge-calliope-master',
    repo: 'brynpickering/cambridge-calliope',
    ref: 'ac10db72a8b6b72223ef3fdad6a7c6f5d23807f7',
    skip: [/^model\/timeseries_data\/DMUU\/scenarios\//],
  },
];

const MARKER = '.tempo-complete';
const CONCURRENCY = 6;
const RETRIES = 2;

const toPosix = (p) => String(p).replace(/\\/g, '/').replace(/^\/+/, '');

function findRemote(rel, remotes = REMOTE_TEMPLATES) {
  return remotes.find((r) => rel === r.prefix || rel.startsWith(r.prefix + '/'));
}

function safeJoin(root, rel) {
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  return full === base || full.startsWith(base + path.sep) ? full : null;
}

async function fetchOk(fetchImpl, url) {
  let lastErr;
  for (let i = 0; i <= RETRIES; i++) {
    try {
      const res = await fetchImpl(url);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/** One-sentence, plain-language reason a download failed. */
function explain(entry, err) {
  const msg = String((err && err.message) || err);
  let why = msg;
  if (/HTTP 403|rate limit/i.test(msg)) why = 'GitHub rate limit reached, try again in a few minutes';
  else if (/HTTP 404/.test(msg)) why = 'a file was not found on GitHub (the template may have moved)';
  else if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|network|terminated/i.test(msg)) {
    why = 'no connection to GitHub, check your internet connection';
  }
  return new Error(`Could not download the ${entry.repo} template: ${why}.`);
}

const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`;

async function download(entry, destDir, fetchImpl, onProgress, onStatus) {
  const started = Date.now();
  onStatus({ prefix: entry.prefix, phase: 'connecting', message: `Connecting to GitHub to download ${entry.repo}…` });
  const tree = await (await fetchOk(
    fetchImpl, `https://api.github.com/repos/${entry.repo}/git/trees/${entry.ref}?recursive=1`,
  )).json();
  if (tree.truncated) throw new Error(`File list for ${entry.repo} was truncated`);
  const files = tree.tree
    .filter((n) => n.type === 'blob' && !entry.skip.some((re) => re.test(n.path)))
    .map((n) => ({ ...n, local: entry.map ? entry.map(n.path) : n.path }))
    .filter((n) => n.local);

  const total = files.reduce((sum, n) => sum + (n.size || 0), 0);
  onStatus({ prefix: entry.prefix, phase: 'downloading',
             message: `Downloading ${files.length} files (${mb(total)}) from github.com/${entry.repo}. This only happens the first time; it is cached afterwards.` });
  let done = 0;
  let lastEmit = 0;
  const emit = (force) => {
    const now = Date.now();
    if (!force && now - lastEmit < 100) return;
    lastEmit = now;
    onProgress({ prefix: entry.prefix, done, total });
  };
  const count = async function* (src) {
    for await (const chunk of src) { done += chunk.length; emit(false); yield chunk; }
  };

  const staging = destDir + '.partial';
  fs.rmSync(staging, { recursive: true, force: true });
  try {
    const queue = files.slice();
    const worker = async () => {
      for (let n = queue.shift(); n; n = queue.shift()) {
        const target = safeJoin(staging, n.local);
        if (!target) throw new Error(`Unsafe path in ${entry.repo}: ${n.local}`);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const res = await fetchOk(
          fetchImpl, `https://raw.githubusercontent.com/${entry.repo}/${entry.ref}/${n.path.split('/').map(encodeURIComponent).join('/')}`,
        );
        await pipeline(Readable.fromWeb(res.body), count, fs.createWriteStream(target));
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    emit(true);
    fs.writeFileSync(path.join(staging, MARKER), entry.ref);
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.renameSync(staging, destDir);
    onStatus({ prefix: entry.prefix, phase: 'done',
               message: `Downloaded ${files.length} files (${mb(total)}) in ${((Date.now() - started) / 1000).toFixed(0)} s and cached them for next time.` });
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
}

function createTemplateStore({ bundledDir, cacheDir, fetchImpl = globalThis.fetch, remotes = REMOTE_TEMPLATES,
                               onProgress = () => {}, onStatus = () => {} }) {
  const inflight = new Map();
  const announcedCached = new Set();

  const isCached = (entry) => {
    try {
      return fs.readFileSync(path.join(cacheDir, entry.prefix, MARKER), 'utf-8') === entry.ref;
    } catch { return false; }
  };

  const ensure = (entry) => {
    if (!inflight.has(entry.prefix)) {
      const p = download(entry, path.join(cacheDir, entry.prefix), fetchImpl, onProgress, onStatus)
        .catch((err) => {
          const friendly = explain(entry, err);
          onStatus({ prefix: entry.prefix, phase: 'error', message: friendly.message });
          throw friendly;
        })
        .finally(() => inflight.delete(entry.prefix));
      inflight.set(entry.prefix, p);
    }
    return inflight.get(entry.prefix);
  };

  const bundled = (rel) => {
    const full = safeJoin(bundledDir, rel);
    return full && fs.existsSync(full) ? full : null;
  };

  return {
    /** Whether the file is bundled or downloadable. Never downloads. */
    available(filename) {
      const rel = toPosix(filename);
      return !!(bundled(rel) || findRemote(rel, remotes));
    },
    /** Absolute path of the template file, downloading its template first if needed; null if unknown. */
    async resolve(filename) {
      const rel = toPosix(filename);
      const local = bundled(rel);
      if (local) return local;
      const entry = findRemote(rel, remotes);
      if (!entry) return null;
      if (!isCached(entry)) {
        await ensure(entry);
      } else if (!announcedCached.has(entry.prefix)) {
        announcedCached.add(entry.prefix);
        onStatus({ prefix: entry.prefix, phase: 'cached', message: `Using the copy of ${entry.repo} already downloaded to this computer.` });
      }
      const full = safeJoin(cacheDir, rel);
      return full && fs.existsSync(full) ? full : null;
    },
  };
}

module.exports = { createTemplateStore, REMOTE_TEMPLATES };

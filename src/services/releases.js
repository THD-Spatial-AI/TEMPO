import { useEffect, useState } from 'react';

export const RELEASES_URL = 'https://github.com/THD-Spatial-AI/TEMPO/releases';
const API_URL = 'https://api.github.com/repos/THD-Spatial-AI/TEMPO/releases';
const CACHE_KEY = 'tempo:githubReleases';
const CACHE_TTL = 60 * 60 * 1000; // GitHub allows 60 unauthenticated requests/hour

// Splits a GitHub release body into a summary and "## Heading" sections of bullets.
export function parseReleaseBody(body = '') {
  const sections = [];
  let summary = '';
  let section = null;
  let item = null;
  const flush = () => { if (item && section) section.items.push(item.trim()); item = null; };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#\s/.test(line)) continue;
    const heading = line.match(/^#{2,4}\s+(.+)/);
    if (heading) {
      flush();
      section = { title: heading[1].trim(), items: [] };
      sections.push(section);
    } else if (/^[-*]\s+/.test(line)) {
      flush();
      if (!section) { section = { title: 'Notes', items: [] }; sections.push(section); }
      item = line.replace(/^[-*]\s+/, '');
    } else if (!line) {
      flush();
    } else if (item) {
      item += ` ${line}`;
    } else if (!section) {
      summary += `${summary ? ' ' : ''}${line}`;
    }
  }
  flush();
  return { summary, sections: sections.filter((s) => s.items.length > 0) };
}

function normalize(list) {
  return list
    .filter((r) => !r.draft)
    .map((r) => {
      const match = `${r.name || ''} ${r.tag_name || ''}`.match(/v?(\d+\.\d+\.\d+)/i);
      return {
        version: match ? match[1] : (r.tag_name || r.name),
        name: r.name || r.tag_name,
        date: r.published_at ? r.published_at.slice(0, 10) : null,
        url: r.html_url,
        prerelease: r.prerelease,
        ...parseReleaseBody(r.body || ''),
      };
    });
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

export async function fetchReleases() {
  const cached = readCache();
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.releases;
  try {
    const res = await fetch(API_URL, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
    const releases = normalize(await res.json());
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), releases })); } catch { /* storage full or blocked */ }
    return releases;
  } catch (err) {
    if (cached) return cached.releases;
    throw err;
  }
}

export function useReleases() {
  const [state, setState] = useState(() => ({ releases: readCache()?.releases || [], loading: true, error: null }));
  useEffect(() => {
    let alive = true;
    fetchReleases()
      .then((releases) => alive && setState({ releases, loading: false, error: null }))
      .catch((err) => alive && setState((s) => ({ ...s, loading: false, error: err.message })));
    return () => { alive = false; };
  }, []);
  const latest = state.releases.find((r) => !r.prerelease) || state.releases[0] || null;
  return { ...state, latest };
}

// aiAdvisorCache.js
// -------------------------------------------------------------------------
// In-memory cache for a run's Model Advisor report + chat thread, keyed by
// job id. AIAnalysisTab is unmounted whenever the user navigates to another
// top-level app section (App.jsx's view switch only renders the active
// view) or switches Results tabs before "visiting" AI once, so its own
// useState can't survive that. This module-level cache lives outside React's
// tree, so content set here outlives the component and is restored on
// remount. Cleared only on app restart — that's fine, it's meant to mirror
// "part of the results" for the current session, not persisted to disk.

const cache = new Map();

export function getAdvisorCache(jobId) {
  return jobId ? cache.get(jobId) || null : null;
}

export function setAdvisorCache(jobId, data) {
  if (!jobId) return;
  cache.set(jobId, data);
}

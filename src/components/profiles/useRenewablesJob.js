// Renewables-service plumbing shared by the weather-based profile dialogs (W10):
// service status (check / install / start) and one tracked job at a time
// (progress, abort on unmount, no state updates after unmount).
import { useEffect, useRef, useState } from 'react';
import {
  checkRenewables, installRenewables, onRenewablesInstallProgress, startRenewables,
} from '../../services/renewablesClient';

const svcState = (s) => (s.running ? 'running' : s.installed ? 'stopped' : 'missing');

/**
 * @returns {{
 *   svc: 'checking'|'web'|'missing'|'stopped'|'running', busy: null|'install'|'start', svcMsg: string,
 *   install: () => Promise<void>, start: () => Promise<void>,
 *   job: null|{message, done, total}, jobError: string|null, setJobError: Function,
 *   track: (run: Function, payload: object) => Promise<object|null>,
 * }}
 */
export default function useRenewablesJob() {
  const [svc, setSvc] = useState(() => (window.electronAPI?.checkRenewables ? 'checking' : 'web'));
  const [busy, setBusy] = useState(null); // install | start
  const [svcMsg, setSvcMsg] = useState('');
  const [job, setJob] = useState(null); // { message, done, total } while a job runs
  const [jobError, setJobError] = useState(null); // full message, set by the caller
  const alive = useRef(true);
  const jobAbort = useRef(null); // AbortController of the running job
  const installOff = useRef(null); // unsubscribe of the install-progress listener
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      jobAbort.current?.abort();
      installOff.current?.();
    };
  }, []);

  const recheck = async () => {
    const s = await checkRenewables();
    if (alive.current) setSvc(svcState(s));
  };
  useEffect(() => {
    if (!window.electronAPI?.checkRenewables) return undefined;
    let cancelled = false;
    checkRenewables().then(s => { if (!cancelled) setSvc(svcState(s)); });
    return () => { cancelled = true; };
  }, []);

  const install = async () => {
    setBusy('install'); setSvcMsg('Starting…');
    let failed = false;
    installOff.current = onRenewablesInstallProgress(d => {
      if (!alive.current) return;
      if (d?.type === 'stage' || d?.type === 'log') setSvcMsg(d.label || d.line || '');
      if (d?.type === 'error') { failed = true; setSvcMsg(`Failed: ${d.error}`); }
    });
    const res = await installRenewables();
    installOff.current?.();
    installOff.current = null;
    if (!alive.current) return;
    setBusy(null);
    if (res?.success) { setSvcMsg('Installed ✓'); await recheck(); } else if (!failed) setSvcMsg(`Failed: ${res?.error || 'unknown error'}`);
  };

  const start = async () => {
    setBusy('start'); setSvcMsg('');
    const res = await startRenewables();
    if (!alive.current) return;
    setBusy(null);
    if (!res?.running) setSvcMsg(`Could not start the service${res?.error ? `: ${res.error}` : ''}.`);
    await recheck();
  };

  // One service job at a time: progress into `job`, aborted on unmount. Resolves
  // null when cancelled or unmounted (the caller then does nothing).
  const track = async (run, payload) => {
    setJobError(null);
    setJob({ message: 'Starting…', done: 0, total: 0 });
    const ac = new AbortController();
    jobAbort.current = ac;
    const res = await run(payload, st => { if (alive.current) setJob({ message: st.message, done: st.done, total: st.total }); }, { signal: ac.signal });
    if (jobAbort.current === ac) jobAbort.current = null;
    if (!alive.current || res.error === 'cancelled') return null;
    setJob(null);
    return res;
  };

  return { svc, busy, svcMsg, install, start, job, jobError, setJobError, track };
}

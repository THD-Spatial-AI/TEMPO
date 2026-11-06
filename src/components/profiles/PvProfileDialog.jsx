// Solar PV profile dialog (Increment 2): computes an hourly capacity-factor
// profile per location point from Open-Meteo ERA5 weather with pvlib (local
// renewables service) and applies it as one CSV column per point. The recipe
// lives only in the applied entry's profileSource (R1); only points whose
// key changed are recalculated (R8).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../context/DataContext';
import {
  PROFILE_KIND_LABEL,
  applyProfileToLocations,
  buildProfileTimeSeries,
  canApplyProfile,
  defaultPvOrientation,
  modelCalendar,
  pointColumnIds,
  profileFileName,
  restampToModelCalendar,
} from '../../services/techProfiles';
import {
  checkRenewables, computePv, installRenewables, onRenewablesInstallProgress, startRenewables,
} from '../../services/renewablesClient';
import ProfileDialogFrame from './ProfileDialogFrame';
import ProfileChart from './ProfileChart';
import PointsMap from './PointsMap';
import PvPointsTable, { NumberField } from './PvPointsTable';

const PROVIDER = 'open-meteo+pvlib';
const LAST_FULL_YEAR = new Date().getFullYear() - 1;
const YEARS = Array.from({ length: LAST_FULL_YEAR - 2000 + 1 }, (_, i) => LAST_FULL_YEAR - i);
const BTN = 'px-3 py-1.5 text-xs font-medium bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed';
const SELECT_CLS = 'border border-slate-300 bg-white px-1.5 py-0.5 text-xs disabled:bg-slate-100 disabled:text-slate-400';

const defaultSettings = (techName) => ({
  weatherYear: LAST_FULL_YEAR,
  tracking: /track/i.test(techName) ? 'single_axis' : 'fixed',
  losses: 0.10,
  dcAc: 1.2,
  tempCoeff: -0.004,
});

const coord = (v) => (v === '' || v == null ? NaN : Number(v));
const svcState = (s) => (s.running ? 'running' : s.installed ? 'stopped' : 'missing');
const pct = (x) => Number((x * 100).toFixed(4));

export default function PvProfileDialog({ onClose, techName, parent, focusLocation, onApplied }) {
  const { locations, timeSeries, setLocations, setTimeSeries, currentModelId, getCurrentModel, showNotification } = useData();
  const entry = useMemo(
    () => (timeSeries || []).find(t => t.fileName === profileFileName(techName)) || null,
    [timeSeries, techName],
  );
  const stored = entry?.profileSource?.provider === PROVIDER ? entry.profileSource : null;

  const [settings, setSettings] = useState(() => ({ ...defaultSettings(techName), ...(stored?.settings || {}) }));
  const [orient, setOrient] = useState({}); // user edits only; else stored, else default
  const [results, setResults] = useState({}); // name → { key, cf, mean_cf, annual_kwh_per_kwp }
  const [selected, setSelected] = useState(focusLocation || null);
  const [svc, setSvc] = useState(() => (window.electronAPI?.checkRenewables ? 'checking' : 'web')); // checking | web | missing | stopped | running
  const [busy, setBusy] = useState(null); // install | start
  const [svcMsg, setSvcMsg] = useState('');
  const [job, setJob] = useState(null); // { message, done, total } while a calculation runs
  const [jobError, setJobError] = useState(null);
  const [applyError, setApplyError] = useState(null);
  const alive = useRef(true);
  const jobAbort = useRef(null); // AbortController of the running calculation
  const installOff = useRef(null); // unsubscribe of the install-progress listener
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      jobAbort.current?.abort();
      installOff.current?.();
    };
  }, []);

  // Points = locations hosting the tech, plus the location being edited in
  // LocationEditDialog when the tech was only just added there (as ProfileDialog).
  const { points, noCoords } = useMemo(() => {
    const locs = locations || [];
    const names = locs.filter(l => l.techs?.[techName]).map(l => l.name);
    if (onApplied && focusLocation && !names.includes(focusLocation) && locs.some(l => l.name === focusLocation)) {
      names.push(focusLocation);
    }
    const pts = [];
    const bad = [];
    names.forEach(n => {
      const l = locs.find(x => x.name === n);
      const lat = coord(l.latitude);
      const lon = coord(l.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push({ name: n, lat, lon });
      else bad.push(n);
    });
    return { points: pts, noCoords: bad };
  }, [locations, techName, onApplied, focusLocation]);

  const orientOf = (p) => {
    const sp = stored?.points?.[p.name];
    return orient[p.name]
      || (sp?.tilt != null && sp?.azimuth != null ? { tilt: sp.tilt, azimuth: sp.azimuth } : defaultPvOrientation(p.lat));
  };
  const pointKey = (p) => {
    const o = orientOf(p);
    return JSON.stringify([settings, p.lat, p.lon, o.tilt, o.azimuth]);
  };
  const isCurrent = (p) => results[p.name]?.key === pointKey(p);
  const changed = points.filter(p => !isCurrent(p));
  const sel = points.some(p => p.name === selected) ? selected : points[0]?.name || null;
  const selPoint = points.find(p => p.name === sel);
  const selCf = selPoint && isCurrent(selPoint) ? results[sel].cf : null;

  const calendar = modelCalendar(getCurrentModel());
  const applicable = canApplyProfile(parent);
  const canApply = !!calendar && applicable && points.length > 0 && noCoords.length === 0 && changed.length === 0 && !job;

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

  const handleInstall = async () => {
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

  const handleStart = async () => {
    setBusy('start'); setSvcMsg('');
    const res = await startRenewables();
    if (!alive.current) return;
    setBusy(null);
    if (!res?.running) setSvcMsg(`Could not start the service${res?.error ? `: ${res.error}` : ''}.`);
    await recheck();
  };

  const handleCalculate = async () => {
    const todo = changed.map(p => ({ p, o: orientOf(p), key: pointKey(p) }));
    setJobError(null);
    setJob({ message: 'Starting…', done: 0, total: 0 });
    const ac = new AbortController();
    jobAbort.current = ac;
    const res = await computePv({
      points: todo.map(({ p, o }) => ({ id: p.name, lat: p.lat, lon: p.lon, tilt: o.tilt, azimuth: o.azimuth })),
      year: settings.weatherYear,
      tracking: settings.tracking,
      losses: settings.losses,
      dc_ac: settings.dcAc,
      temp_coeff: settings.tempCoeff,
    }, st => { if (alive.current) setJob({ message: st.message, done: st.done, total: st.total }); }, { signal: ac.signal });
    if (jobAbort.current === ac) jobAbort.current = null;
    if (!alive.current || res.error === 'cancelled') return;
    setJob(null);
    if (!res.ok) { setJobError(res.error); return; }
    setResults(prev => {
      const next = { ...prev };
      todo.forEach(({ p, key }) => {
        const r = res.result?.[p.name];
        if (r) next[p.name] = { key, cf: r.cf, mean_cf: r.mean_cf, annual_kwh_per_kwp: r.annual_kwh_per_kwp };
      });
      return next;
    });
  };

  const handleApply = () => {
    setApplyError(null);
    try {
      const cols = pointColumnIds(points.map(p => p.name));
      const columns = {};
      points.forEach(p => {
        columns[cols[p.name]] = restampToModelCalendar(results[p.name].cf, settings.weatherYear, calendar).values;
      });
      const { datetimes } = restampToModelCalendar(results[points[0].name].cf, settings.weatherYear, calendar);
      const profileSource = {
        provider: PROVIDER,
        role: 'pv',
        weatherYear: settings.weatherYear,
        sourceYear: settings.weatherYear,
        settings: { ...settings },
        calendar: { ...calendar },
        attribution: 'Open-Meteo.com (ERA5), CC BY 4.0',
        points: Object.fromEntries(points.map(p => [p.name, {
          column: cols[p.name], lat: p.lat, lon: p.lon, tilt: orientOf(p).tilt, azimuth: orientOf(p).azimuth,
          meanCf: results[p.name].mean_cf, annualKwhPerKwp: results[p.name].annual_kwh_per_kwp,
        }])),
      };
      const newEntry = buildProfileTimeSeries({ modelId: currentModelId, techName, datetimes, columns, profileSource });
      setTimeSeries(prev => [...(prev || []).filter(t => t.fileName !== newEntry.fileName), newEntry]);
      setLocations(prev => applyProfileToLocations(prev, { techName, fileName: newEntry.fileName, colByLocation: cols, kind: 'pv' }));
      if (onApplied && focusLocation && cols[focusLocation]) {
        const probe = applyProfileToLocations([{ name: '_', techs: { [techName]: {} } }],
          { techName, fileName: newEntry.fileName, colByLocation: { _: cols[focusLocation] }, kind: 'pv' });
        onApplied(probe[0].techs[techName].constraints);
      }
      showNotification(
        `Profile ${newEntry.fileName} applied to ${points.length} location${points.length === 1 ? '' : 's'} and saved to the model`,
        'success',
      );
      onClose();
    } catch (err) {
      setApplyError(err?.message || String(err));
    }
  };

  const notice = (text, tone = 'slate') => (
    <div className={`border px-3 py-2 text-xs ${tone === 'amber' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
      {text}
    </div>
  );

  const statsOf = (p) => {
    if (isCurrent(p)) return { status: 'current', stats: { meanCf: results[p.name].mean_cf, annualKwhPerKwp: results[p.name].annual_kwh_per_kwp } };
    const sp = stored?.points?.[p.name];
    if (sp?.meanCf != null || sp?.annualKwhPerKwp != null) return { status: 'stored', stats: { meanCf: sp.meanCf, annualKwhPerKwp: sp.annualKwhPerKwp } };
    return { status: null, stats: null };
  };
  const rows = points.map(p => ({ name: p.name, ...orientOf(p), ...statsOf(p) }));
  const selStats = selPoint ? statsOf(selPoint) : null;
  const running = !!job;
  const setSetting = (patch) => setSettings(s => ({ ...s, ...patch }));
  const field = (label, control) => (
    <label className="flex flex-col gap-1 text-[11px] text-slate-500">{label}{control}</label>
  );

  return (
    <ProfileDialogFrame title={PROFILE_KIND_LABEL.pv} subtitle={techName} onClose={onClose} onApply={handleApply} canApply={canApply}>
      {/* Map + points + Calculate */}
      <div className="w-[440px] flex-shrink-0 border-r border-black/15 overflow-y-auto p-4 space-y-3">
        <p className="text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">Points ({points.length})</p>
        {points.length === 0 && noCoords.length === 0 && (
          <p className="text-xs text-slate-500">No location in this model uses this technology yet.</p>
        )}
        <PointsMap points={points} selected={sel} onSelect={setSelected} />
        {points.length > 0 && (
          <PvPointsTable rows={rows} selected={sel} onSelect={setSelected} orientDisabled={running || settings.tracking === 'single_axis'}
            onOrient={(name, patch) => setOrient(o => ({ ...o, [name]: { ...orientOf(points.find(p => p.name === name)), ...patch } }))} />
        )}
        {noCoords.length > 0 && notice(
          `No coordinates: ${noCoords.join(', ')}. Apply is blocked until ${noCoords.length === 1 ? 'this location has' : 'these locations have'} coordinates.`,
          'amber',
        )}

        {svc === 'web' && notice('Solar profiles need the TEMPO desktop app.')}
        {svc === 'missing' && (
          <div className="border border-amber-300 bg-amber-50 px-3 py-2 space-y-2">
            <p className="text-xs text-amber-800">The renewables component (pvlib) is not installed.</p>
            <button type="button" disabled={!!busy} onClick={handleInstall} className={BTN}>
              {busy === 'install' ? 'Installing…' : 'Install renewables component'}
            </button>
          </div>
        )}
        {svc === 'stopped' && (
          <div className="flex items-center gap-3">
            {notice('The renewables service is not running.')}
            <button type="button" disabled={!!busy} onClick={handleStart} className={BTN}>
              {busy === 'start' ? 'Starting…' : 'Start service'}
            </button>
          </div>
        )}
        {svcMsg && <p className="text-[11px] text-slate-500 truncate" title={svcMsg}>{svcMsg}</p>}

        {points.length > 0 && (
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleCalculate} disabled={running || svc !== 'running' || changed.length === 0} className={BTN}>
              {changed.length === 0 ? 'All points current'
                : changed.length === points.length ? 'Calculate' : `Recalculate ${changed.length} changed`}
            </button>
            {job && (
              <span className="text-[11px] text-slate-500">
                {job.message || 'Working…'}{job.total ? ` (${job.done}/${job.total})` : ''}
              </span>
            )}
          </div>
        )}
        {jobError && notice(`PV calculation failed: ${jobError}`, 'amber')}
      </div>

      {/* Settings + summary + chart */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-4">
        <div className="flex flex-wrap gap-4">
          {field('Weather year', (
            <select value={settings.weatherYear} disabled={running} className={SELECT_CLS}
              onChange={e => setSetting({ weatherYear: Number(e.target.value) })}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          ))}
          {field('Tracking', (
            <select value={settings.tracking} disabled={running} className={SELECT_CLS}
              onChange={e => setSetting({ tracking: e.target.value })}>
              <option value="fixed">Fixed</option>
              <option value="single_axis">Single-axis</option>
            </select>
          ))}
          {field('System losses % (excl. inverter)', (
            <NumberField value={pct(settings.losses)} min={0} max={50} step={0.5} disabled={running}
              onChange={v => setSetting({ losses: v / 100 })} />
          ))}
          {field('DC/AC ratio', (
            <NumberField value={settings.dcAc} min={0.5} max={2} step={0.05} disabled={running}
              onChange={v => setSetting({ dcAc: v })} />
          ))}
          {field('Temp. coefficient %/K', (
            <NumberField value={pct(settings.tempCoeff)} min={-1} max={0} step={0.01} disabled={running}
              onChange={v => setSetting({ tempCoeff: v / 100 })} />
          ))}
        </div>

        {!applicable && notice(
          `Profiles can only be applied to supply / supply_plus technologies (this one: ${parent || 'unknown'}). Shown for reference.`,
          'amber',
        )}
        {!calendar && notice(
          'Set the model time range (subset_time in Parameters, or the model dates in Creation) before applying a profile.',
          'amber',
        )}
        {calendar && (() => {
          const y0 = calendar.startDate.slice(0, 4);
          const y1 = calendar.endDate.slice(0, 4);
          return notice(`Profile covers ${y0}${y1 !== y0 ? `–${y1}` : ''} (full year, so any run window inside it works).`);
        })()}

        {selPoint && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div><span className="text-slate-500">Point</span> <span className="text-slate-800">{selPoint.name}</span></div>
            <div><span className="text-slate-500">Lat / lon</span> <span className="font-mono text-slate-800">{selPoint.lat.toFixed(4)}, {selPoint.lon.toFixed(4)}</span></div>
            <div><span className="text-slate-500">Mean CF</span> <span className="text-slate-800">{selStats.stats?.meanCf != null ? selStats.stats.meanCf.toFixed(3) : '—'}</span></div>
            <div>
              <span className="text-slate-500">kWh/kWp</span>{' '}
              <span className="text-slate-800">{selStats.stats?.annualKwhPerKwp != null ? Math.round(selStats.stats.annualKwhPerKwp) : '—'}</span>
              {selStats.status === 'stored' && <span className="ml-2 text-slate-500">(stored)</span>}
            </div>
          </div>
        )}
        {selPoint && !selCf && (
          <p className="text-xs text-slate-500">Calculate to preview this point&apos;s hourly profile.</p>
        )}
        <ProfileChart values={selCf} />
        <p className="text-[11px] text-slate-500">Weather data: Open-Meteo.com (ERA5), CC BY 4.0.</p>

        {applyError && notice(`Could not apply profile: ${applyError}`, 'amber')}
      </div>
    </ProfileDialogFrame>
  );
}

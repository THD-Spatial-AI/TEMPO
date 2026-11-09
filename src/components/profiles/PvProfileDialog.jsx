// Solar PV profile dialog (Increment 2): computes an hourly capacity-factor
// profile per location point from Open-Meteo ERA5 weather with pvlib (local
// renewables service) and applies it as one CSV column per point. The recipe
// lives only in the applied entry's profileSource (R1); only points whose
// key changed are recalculated (R8). Optimise only sets tilt/azimuth (O5).
import React, { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import {
  PROFILE_KIND_LABEL, applyProfileToLocations, buildProfileTimeSeries, canApplyProfile, defaultPvOrientation,
  modelCalendar, pointColumnIds, profileFileName, pvPointKey, restampToModelCalendar,
} from '../../services/techProfiles';
import { computePv, optimiseOrientation } from '../../services/renewablesClient';
import useRenewablesJob from './useRenewablesJob';
import ServiceStatus from './ServiceStatus';
import ProfileDialogFrame from './ProfileDialogFrame';
import ProfileChart from './ProfileChart';
import PointsMap from './PointsMap';
import PvPointsTable from './PvPointsTable';
import PvSettingsRow, { LAST_FULL_YEAR } from './PvSettingsRow';
import OptimisePanel from './OptimisePanel';

const PROVIDER = 'open-meteo+pvlib';
const PV_OVERLAYS = { layer: 'pvout', sun: true };
const BTN = 'px-3 py-1.5 text-xs font-medium bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed';

const defaultSettings = (techName) => ({
  weatherYear: LAST_FULL_YEAR,
  tracking: /track/i.test(techName) ? 'single_axis' : 'fixed',
  losses: 0.10,
  dcAc: 1.2,
  tempCoeff: -0.004,
});

const coord = (v) => (v === '' || v == null ? NaN : Number(v));
const periodLabel = (period, months) => ({ year: 'the whole year', summer: 'summer', winter: 'winter' }[period]
  || `months ${months.join(', ')}`);

export default function PvProfileDialog({ onClose, techName, parent, focusLocation, onApplied }) {
  const { locations, timeSeries, setLocations, setTimeSeries, currentModelId, getCurrentModel, showNotification } = useData();
  const entry = useMemo(
    () => (timeSeries || []).find(t => t.fileName === profileFileName(techName)) || null,
    [timeSeries, techName],
  );
  const stored = entry?.profileSource?.provider === PROVIDER ? entry.profileSource : null;

  // The stored recipe's settings, merged exactly as the initial dialog settings are.
  const storedSettings = useMemo(() => ({ ...defaultSettings(techName), ...(stored?.settings || {}) }), [techName, stored]);
  const [settings, setSettings] = useState(storedSettings);
  const [orient, setOrient] = useState({}); // user edits only; else stored, else default
  const [results, setResults] = useState({}); // name → { key, cf, mean_cf, annual_kwh_per_kwp }
  const [selected, setSelected] = useState(focusLocation || null);
  const { svc, busy, svcMsg, install, start, job, jobError, setJobError, track } = useRenewablesJob();
  const [optInfo, setOptInfo] = useState(null); // last optimisation summary, cleared on Calculate
  const [applyError, setApplyError] = useState(null);

  // Points = locations hosting the tech, plus the location being edited in
  // LocationEditDialog when the tech was only just added there (as ProfileDialog).
  const { points, noCoords, dupNames } = useMemo(() => {
    const locs = locations || [];
    const names = [...new Set(locs.filter(l => l.techs?.[techName]).map(l => l.name))];
    if (onApplied && focusLocation && !names.includes(focusLocation) && locs.some(l => l.name === focusLocation)) {
      names.push(focusLocation);
    }
    // Profile columns and resource refs are keyed by location name, so a name
    // shared by two locations cannot get its own profile.
    const dups = names.filter(n => locs.filter(x => x.name === n).length > 1);
    const pts = [];
    const bad = [];
    names.filter(n => !dups.includes(n)).forEach(n => {
      const l = locs.find(x => x.name === n);
      const lat = coord(l.latitude);
      const lon = coord(l.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push({ name: n, lat, lon });
      else bad.push(n);
    });
    return { points: pts, noCoords: bad, dupNames: dups };
  }, [locations, techName, onApplied, focusLocation]);

  const orientOf = (p) => {
    const sp = stored?.points?.[p.name];
    return orient[p.name]
      || (sp?.tilt != null && sp?.azimuth != null ? { tilt: sp.tilt, azimuth: sp.azimuth } : defaultPvOrientation(p.lat));
  };
  const pointKey = (p) => {
    const o = orientOf(p);
    return pvPointKey(settings, p.lat, p.lon, o.tilt, o.azimuth);
  };
  const isCurrent = (p) => results[p.name]?.key === pointKey(p);
  const changed = points.filter(p => !isCurrent(p));
  const sel = points.some(p => p.name === selected) ? selected : points[0]?.name || null;
  const selPoint = points.find(p => p.name === sel);
  const selCf = selPoint && isCurrent(selPoint) ? results[sel].cf : null;

  const calendar = modelCalendar(getCurrentModel());
  const applicable = canApplyProfile(parent);
  const canApply = !!calendar && applicable && points.length > 0 && noCoords.length === 0 && dupNames.length === 0
    && changed.length === 0 && !job;

  const handleCalculate = async () => {
    const todo = changed.map(p => ({ p, o: orientOf(p), key: pointKey(p) }));
    setOptInfo(null);
    const res = await track(computePv, {
      points: todo.map(({ p, o }) => ({ id: p.name, lat: p.lat, lon: p.lon, tilt: o.tilt, azimuth: o.azimuth })),
      year: settings.weatherYear,
      tracking: settings.tracking,
      losses: settings.losses,
      dc_ac: settings.dcAc,
      temp_coeff: settings.tempCoeff,
    });
    if (!res) return;
    if (!res.ok) { setJobError(`PV calculation failed: ${res.error}`); return; }
    setResults(prev => {
      const next = { ...prev };
      todo.forEach(({ p, key }) => {
        const r = res.result?.[p.name];
        if (r) next[p.name] = { key, cf: r.cf, mean_cf: r.mean_cf, annual_kwh_per_kwp: r.annual_kwh_per_kwp };
      });
      return next;
    });
  };

  const handleOptimise = async (period, months) => {
    setOptInfo(null);
    const names = new Set(points.map(p => p.name));
    const res = await track(optimiseOrientation, {
      points: points.map(p => ({ id: p.name, lat: p.lat, lon: p.lon, ...orientOf(p) })),
      year: settings.weatherYear,
      period,
      months,
    });
    if (!res) return;
    if (!res.ok) { setJobError(`Orientation optimisation failed: ${res.error}`); return; }
    const found = Object.entries(res.result || {})
      .filter(([n, r]) => names.has(n) && Number.isFinite(r?.tilt) && Number.isFinite(r?.azimuth));
    setOrient(prev => ({ ...prev, ...Object.fromEntries(found.map(([n, r]) => [n, { tilt: r.tilt, azimuth: r.azimuth }])) }));
    const gain = found.length ? found.reduce((a, [, r]) => a + (Number(r.gain_pct) || 0), 0) / found.length : 0;
    setOptInfo(`Optimised ${found.length} point${found.length === 1 ? '' : 's'} for ${periodLabel(period, months)} · mean gain `
      + `${gain >= 0 ? '+' : ''}${gain.toFixed(1)}% (plane-of-array). Recalculate to update the profiles.`);
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
    // Stored stats only while they belong to the current recipe (O5).
    if ((sp?.meanCf != null || sp?.annualKwhPerKwp != null)
      && pvPointKey(storedSettings, sp.lat, sp.lon, sp.tilt, sp.azimuth) === pointKey(p)) return { status: 'stored', stats: { meanCf: sp.meanCf, annualKwhPerKwp: sp.annualKwhPerKwp } };
    return { status: null, stats: null };
  };
  const rows = points.map(p => ({ name: p.name, ...orientOf(p), ...statsOf(p) }));
  const selStats = selPoint ? statsOf(selPoint) : null;
  const running = !!job;
  const optimiseBlock = settings.tracking === 'single_axis' ? 'Single-axis trackers follow the sun; orientation is not optimised'
    : running ? 'A calculation is running'
      : svc !== 'running' ? 'Start the renewables service first'
        : points.length === 0 ? 'No point has coordinates' : null;

  return (
    <ProfileDialogFrame title={PROFILE_KIND_LABEL.pv} subtitle={techName} onClose={onClose} onApply={handleApply} canApply={canApply}>
      {/* Map + points + Calculate */}
      <div className="w-[440px] flex-shrink-0 border-r border-black/15 overflow-y-auto p-4 space-y-3">
        <p className="text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">Points ({points.length})</p>
        {points.length === 0 && noCoords.length === 0 && (
          <p className="text-xs text-slate-500">No location in this model uses this technology yet.</p>
        )}
        <PointsMap points={points} selected={sel} onSelect={setSelected} overlays={PV_OVERLAYS} />
        {points.length > 0 && (
          <PvPointsTable rows={rows} selected={sel} onSelect={setSelected} orientDisabled={running || settings.tracking === 'single_axis'}
            onOrient={(name, patch) => setOrient(o => ({ ...o, [name]: { ...orientOf(points.find(p => p.name === name)), ...patch } }))} />
        )}
        {noCoords.length > 0 && notice(
          `No coordinates: ${noCoords.join(', ')}. Apply is blocked until ${noCoords.length === 1 ? 'this location has' : 'these locations have'} coordinates.`,
          'amber',
        )}
        {dupNames.length > 0 && notice(
          `Several locations are named ${dupNames.join(', ')}. Each location needs a unique name for its own profile (and for Calliope). Rename them in Locations; Apply is blocked until then.`,
          'amber',
        )}

        <ServiceStatus svc={svc} busy={busy} svcMsg={svcMsg} install={install} start={start}
          webMessage="Solar profiles need the TEMPO desktop app." />

        {points.length > 0 && <OptimisePanel disabled={!!optimiseBlock} disabledReason={optimiseBlock} onOptimise={handleOptimise} />}
        {optInfo && notice(optInfo)}
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
        {jobError && notice(jobError, 'amber')}
      </div>

      {/* Settings + summary + chart */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-4">
        <PvSettingsRow settings={settings} onChange={patch => setSettings(st => ({ ...st, ...patch }))} disabled={running} />

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

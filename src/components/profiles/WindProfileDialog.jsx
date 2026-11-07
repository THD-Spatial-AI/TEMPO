// Wind profile dialog (Increment 4): hourly capacity factor per location point
// from Open-Meteo ERA5 wind (hub-height shear + density correction, W1/W2) and a
// turbine power curve (W4), applied as one CSV column per point. Each point has a
// weather site (W6), by default its location; "Suggest best point" may move it to
// the windiest nearby ERA5 cell (W7). Recipe only in profileSource (R1); only
// points whose key changed are recalculated (W8).
import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import {
  PROFILE_KIND_LABEL, applyProfileToLocations, buildProfileTimeSeries, canApplyProfile, defaultWindSettings,
  modelCalendar, pointColumnIds, profileFileName, restampToModelCalendar, windPointKey,
} from '../../services/techProfiles';
import { bestWindPoint, computeWind, listTurbines } from '../../services/renewablesClient';
import useRenewablesJob from './useRenewablesJob';
import ServiceStatus from './ServiceStatus';
import ProfileDialogFrame from './ProfileDialogFrame';
import ProfileChart from './ProfileChart';
import PointsMap from './PointsMap';
import WindPointsTable from './WindPointsTable';
import WindSettingsRow from './WindSettingsRow';
import BestPointPanel from './BestPointPanel';
import { LAST_FULL_YEAR } from './PvSettingsRow';

const PROVIDER = 'open-meteo+windpowerlib';
const BTN = 'px-3 py-1.5 text-xs font-medium bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed';

const coord = (v) => (v === '' || v == null ? NaN : Number(v));
const validSite = (s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lon)
  && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180;

export default function WindProfileDialog({ onClose, techName, parent, focusLocation, onApplied }) {
  const { locations, timeSeries, setLocations, setTimeSeries, currentModelId, getCurrentModel, showNotification } = useData();
  const entry = useMemo(
    () => (timeSeries || []).find(t => t.fileName === profileFileName(techName)) || null,
    [timeSeries, techName],
  );
  const stored = entry?.profileSource?.provider === PROVIDER ? entry.profileSource : null;

  // The stored recipe's settings, merged exactly as the initial dialog settings are.
  const storedSettings = useMemo(
    () => ({ ...defaultWindSettings(techName, LAST_FULL_YEAR), ...(stored?.settings || {}) }), [techName, stored]);
  const [settings, setSettings] = useState(storedSettings);
  const [sites, setSites] = useState({}); // user / best-point overrides only: name → { lat, lon }
  const [results, setResults] = useState({}); // name → { key, cf, mean_cf, mean_speed_hub, full_load_hours }
  const [selected, setSelected] = useState(focusLocation || null);
  const { svc, busy, svcMsg, install, start, job, jobError, setJobError, track } = useRenewablesJob();
  const [turbines, setTurbines] = useState(null); // listTurbines() result once the service runs
  const [bestInfo, setBestInfo] = useState(null); // last best-point summary, cleared on Calculate
  const [applyError, setApplyError] = useState(null);

  useEffect(() => {
    if (svc !== 'running') return undefined;
    let cancelled = false;
    listTurbines().then(r => { if (!cancelled) setTurbines(r); });
    return () => { cancelled = true; };
  }, [svc]);

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

  // Effective weather site per point: override, else the stored pin, else the location.
  const siteMap = useMemo(() => Object.fromEntries(points.map(p => {
    const sp = stored?.points?.[p.name];
    const s = sites[p.name]
      || (sp?.pinned && Number.isFinite(sp.siteLat) && Number.isFinite(sp.siteLon) ? { lat: sp.siteLat, lon: sp.siteLon } : { lat: p.lat, lon: p.lon });
    return [p.name, { ...s, pinned: s.lat !== p.lat || s.lon !== p.lon }];
  })), [points, sites, stored]);
  const pins = useMemo(
    () => Object.fromEntries(Object.entries(siteMap).filter(([, s]) => s.pinned).map(([n, s]) => [n, { lat: s.lat, lon: s.lon }])),
    [siteMap],
  );
  const badSites = points.filter(p => !validSite(siteMap[p.name])).map(p => p.name);

  const pointKey = (p) => windPointKey(settings, siteMap[p.name].lat, siteMap[p.name].lon);
  const isCurrent = (p) => results[p.name]?.key === pointKey(p);
  const changed = points.filter(p => !isCurrent(p));
  const sel = points.some(p => p.name === selected) ? selected : points[0]?.name || null;
  const selPoint = points.find(p => p.name === sel);
  const selCf = selPoint && isCurrent(selPoint) ? results[sel].cf : null;

  const calendar = modelCalendar(getCurrentModel());
  const applicable = canApplyProfile(parent);
  const canApply = !!calendar && applicable && points.length > 0 && noCoords.length === 0 && badSites.length === 0
    && changed.length === 0 && !job;
  const windBody = () => ({ year: settings.weatherYear, turbine: settings.turbine, hub_height: settings.hubHeight, loss: settings.loss });

  const handleCalculate = async () => {
    const todo = changed.filter(p => validSite(siteMap[p.name])).map(p => ({ p, site: siteMap[p.name], key: pointKey(p) }));
    if (!todo.length) return;
    setBestInfo(null);
    const res = await track(computeWind, {
      points: todo.map(({ p, site }) => ({ id: p.name, lat: site.lat, lon: site.lon })), ...windBody(),
    });
    if (!res) return;
    if (!res.ok) { setJobError(`Wind calculation failed: ${res.error}`); return; }
    setResults(prev => {
      const next = { ...prev };
      todo.forEach(({ p, key }) => {
        const r = res.result?.[p.name];
        if (r) next[p.name] = { key, cf: r.cf, mean_cf: r.mean_cf, mean_speed_hub: r.mean_speed_hub, full_load_hours: r.full_load_hours };
      });
      return next;
    });
  };

  // W7: search around the *location*; moved → pin the winning cell, else back to the location.
  const handleSuggest = async (radius) => {
    setBestInfo(null);
    const byName = Object.fromEntries(points.map(p => [p.name, p]));
    const res = await track(bestWindPoint, {
      points: points.map(p => ({ id: p.name, lat: p.lat, lon: p.lon })), ...windBody(), radius_km: radius,
    });
    if (!res) return;
    if (!res.ok) { setJobError(`Best-point search failed: ${res.error}`); return; }
    const found = Object.entries(res.result || {})
      .filter(([n, r]) => byName[n] && Number.isFinite(r?.lat) && Number.isFinite(r?.lon));
    const moved = found.filter(([, r]) => r.moved);
    setSites(prev => ({ ...prev, ...Object.fromEntries(found.map(([n, r]) => [n, r.moved
      ? { lat: r.lat, lon: r.lon } : { lat: byName[n].lat, lon: byName[n].lon }])) }));
    // gain_pct is null when the own cell had CF 0; such points are left out of the mean.
    const gains = moved.map(([, r]) => r.gain_pct).filter(g => g != null && Number.isFinite(Number(g))).map(Number);
    const gain = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : null;
    const gainText = gain == null ? '' : ` (mean gain ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}% CF)`;
    setBestInfo(`Moved ${moved.length} of ${found.length} pins${gainText}. Recalculate to update the profiles.`);
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
        role: 'wind',
        weatherYear: settings.weatherYear,
        sourceYear: settings.weatherYear,
        settings: { ...settings },
        calendar: { ...calendar },
        attribution: 'Open-Meteo.com (ERA5), CC BY 4.0',
        points: Object.fromEntries(points.map(p => [p.name, {
          column: cols[p.name], lat: p.lat, lon: p.lon,
          siteLat: siteMap[p.name].lat, siteLon: siteMap[p.name].lon, pinned: siteMap[p.name].pinned,
          meanCf: results[p.name].mean_cf, meanSpeedHub: results[p.name].mean_speed_hub,
        }])),
      };
      const newEntry = buildProfileTimeSeries({ modelId: currentModelId, techName, datetimes, columns, profileSource });
      setTimeSeries(prev => [...(prev || []).filter(t => t.fileName !== newEntry.fileName), newEntry]);
      setLocations(prev => applyProfileToLocations(prev, { techName, fileName: newEntry.fileName, colByLocation: cols, kind: 'wind' }));
      if (onApplied && focusLocation && cols[focusLocation]) {
        const probe = applyProfileToLocations([{ name: '_', techs: { [techName]: {} } }],
          { techName, fileName: newEntry.fileName, colByLocation: { _: cols[focusLocation] }, kind: 'wind' });
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
    if (isCurrent(p)) return { status: 'current', stats: { meanCf: results[p.name].mean_cf, meanSpeedHub: results[p.name].mean_speed_hub } };
    const sp = stored?.points?.[p.name];
    // Stored stats only while they belong to the current recipe (as PV O5).
    if ((sp?.meanCf != null || sp?.meanSpeedHub != null)
      && windPointKey(storedSettings, sp.siteLat ?? sp.lat, sp.siteLon ?? sp.lon) === pointKey(p)) {
      return { status: 'stored', stats: { meanCf: sp.meanCf, meanSpeedHub: sp.meanSpeedHub } };
    }
    return { status: null, stats: null };
  };
  const rows = points.map(p => ({
    name: p.name, siteLat: siteMap[p.name].lat, siteLon: siteMap[p.name].lon, pinned: siteMap[p.name].pinned, ...statsOf(p),
  }));
  const selStats = selPoint ? statsOf(selPoint) : null;
  const selSite = selPoint ? siteMap[sel] : null;
  const running = !!job;
  const suggestBlock = running ? 'A calculation is running'
    : svc !== 'running' ? 'Start the renewables service first'
      : points.length === 0 ? 'No point has coordinates' : null;
  const setSite = (name, patch) => setSites(prev => ({ ...prev, [name]: { lat: siteMap[name].lat, lon: siteMap[name].lon, ...patch } }));
  const resetSite = (name) => {
    const p = points.find(x => x.name === name);
    setSites(prev => ({ ...prev, [name]: { lat: p.lat, lon: p.lon } }));
  };
  const plural = (list, one, many) => (list.length === 1 ? one : many);

  return (
    <ProfileDialogFrame title={PROFILE_KIND_LABEL.wind} subtitle={techName} onClose={onClose} onApply={handleApply} canApply={canApply}>
      {/* Map + points + Calculate */}
      <div className="w-[440px] flex-shrink-0 border-r border-black/15 overflow-y-auto p-4 space-y-3">
        <p className="text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">Points ({points.length})</p>
        {points.length === 0 && noCoords.length === 0 && (
          <p className="text-xs text-slate-500">No location in this model uses this technology yet.</p>
        )}
        <PointsMap points={points} selected={sel} onSelect={setSelected} pins={pins} />
        {points.length > 0 && (
          <WindPointsTable rows={rows} selected={sel} onSelect={setSelected} onSite={setSite} onReset={resetSite} disabled={running} />
        )}
        {noCoords.length > 0 && notice(
          `No coordinates: ${noCoords.join(', ')}. Apply is blocked until ${plural(noCoords, 'this location has', 'these locations have')} coordinates.`,
          'amber',
        )}
        {badSites.length > 0 && notice(
          `Invalid weather site: ${badSites.join(', ')}. Apply is blocked until ${plural(badSites, 'it is', 'they are')} fixed or reset.`,
          'amber',
        )}

        <ServiceStatus svc={svc} busy={busy} svcMsg={svcMsg} install={install} start={start}
          webMessage="Wind profiles need the TEMPO desktop app." />

        {points.length > 0 && <BestPointPanel disabled={!!suggestBlock} disabledReason={suggestBlock} onSuggest={handleSuggest} />}
        {bestInfo && notice(bestInfo)}
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
        <WindSettingsRow settings={settings} onChange={patch => setSettings(st => ({ ...st, ...patch }))} disabled={running}
          turbines={turbines?.ok ? turbines.turbines : null} turbinesError={turbines && !turbines.ok ? turbines.error : null} />

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
            <div><span className="text-slate-500">Location</span> <span className="font-mono text-slate-800">{selPoint.lat.toFixed(4)}, {selPoint.lon.toFixed(4)}</span></div>
            <div><span className="text-slate-500">Mean CF</span> <span className="text-slate-800">{selStats.stats?.meanCf != null ? selStats.stats.meanCf.toFixed(3) : '—'}</span></div>
            <div>
              <span className="text-slate-500">Weather site</span>{' '}
              <span className="font-mono text-slate-800">{selSite.pinned ? `${selSite.lat.toFixed(4)}, ${selSite.lon.toFixed(4)}` : 'location'}</span>
            </div>
            <div>
              <span className="text-slate-500">Hub speed</span>{' '}
              <span className="text-slate-800">{selStats.stats?.meanSpeedHub != null ? `${selStats.stats.meanSpeedHub.toFixed(2)} m/s` : '—'}</span>
              {selStats.status === 'stored' && <span className="ml-2 text-slate-500">(stored)</span>}
            </div>
            <div>
              <span className="text-slate-500">Full-load hours</span>{' '}
              <span className="text-slate-800">{isCurrent(selPoint) ? Math.round(results[sel].full_load_hours) : '—'}</span>
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

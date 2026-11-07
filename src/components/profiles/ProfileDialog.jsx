// Resource-profile dialog (Increment 1): shows the opentech-db availability /
// capacity-factor profile for a technology and applies it to every location
// hosting the tech as one shared CSV column (D8). PV and wind use their own
// weather-based dialogs (PvProfileDialog, WindProfileDialog).
import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { fetchTechProfiles, fetchTechProfileValues } from '../../services/techDatabaseApi';
import {
  PROFILE_KIND_LABEL,
  applyProfileToLocations,
  buildProfileTimeSeries,
  canApplyProfile,
  modelCalendar,
  pickProfile,
  profileColumnId,
  restampToModelCalendar,
} from '../../services/techProfiles';
import ProfileDialogFrame from './ProfileDialogFrame';
import ProfileChart from './ProfileChart';

const METHOD_CLS = {
  measured: 'bg-emerald-100 text-emerald-800',
  parameterised_from_statistics: 'bg-blue-100 text-blue-800',
  synthetic: 'bg-amber-100 text-amber-800',
};

const NONE = { status: 'none', profile: null, values: null, error: null };

export default function ProfileDialog({ onClose, techName, techUuid, parent, kind, focusLocation, onApplied }) {
  const { locations, setLocations, setTimeSeries, currentModelId, getCurrentModel, showNotification } = useData();
  // status: loading | ready | offline | none | unlinked
  const [state, setState] = useState(() => ({
    status: techUuid ? 'loading' : 'unlinked',
    profile: null,
    values: null,
    error: null,
  }));
  const [reloadKey, setReloadKey] = useState(0);
  const [applyError, setApplyError] = useState(null);

  useEffect(() => {
    if (!techUuid) return undefined;
    let cancelled = false;
    fetchTechProfiles(techUuid)
      .then(async (resp) => {
        const profile = pickProfile(resp, kind);
        if (!profile) return NONE;
        const values = await fetchTechProfileValues(techUuid, profile.profile_id);
        if (!Array.isArray(values) || values.length !== Number(profile.n_values)
          || !values.every(v => typeof v === 'number' && Number.isFinite(v))) {
          return NONE;
        }
        return { status: 'ready', profile, values, error: null };
      })
      .catch(err => ({ status: 'offline', profile: null, values: null, error: err?.message || String(err) }))
      .then(next => { if (!cancelled) setState(next); });
    return () => { cancelled = true; };
  }, [techUuid, kind, reloadKey]);

  // Points = model locations hosting the tech, plus the location being edited in
  // LocationEditDialog when the tech was only just added there (its resource ref
  // arrives through onApplied).
  const hosting = useMemo(() => {
    const names = (locations || []).filter(l => l.techs?.[techName]).map(l => l.name);
    if (onApplied && focusLocation && !names.includes(focusLocation)) names.push(focusLocation);
    return names;
  }, [locations, techName, onApplied, focusLocation]);
  const calendar = modelCalendar(getCurrentModel());
  const { profile, values } = state;
  const mean = values ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const applicable = canApplyProfile(parent);
  const canApply = state.status === 'ready' && !!values && applicable
    && hosting.length > 0 && !!calendar;

  const retry = () => {
    setState(s => ({ ...s, status: 'loading', error: null }));
    setReloadKey(k => k + 1);
  };

  const handleApply = () => {
    setApplyError(null);
    try {
      const { datetimes, values: stamped } = restampToModelCalendar(values, Number(profile.year), calendar);
      const column = profileColumnId(techName);
      const profileSource = {
        provider: 'opentech-db',
        profileId: profile.profile_id,
        role: kind,
        method: profile.method || null,
        sourceYear: Number(profile.year),
        citations: profile.citations || [],
        calendar: { ...calendar },
        points: Object.fromEntries(hosting.map(n => [n, { column }])),
      };
      const entry = buildProfileTimeSeries({
        modelId: currentModelId, techName, datetimes, columns: { [column]: stamped }, profileSource,
      });
      const col = entry.dataColumns[0];
      const ref = { techName, fileName: entry.fileName, kind };
      setTimeSeries(prev => [...(prev || []).filter(t => t.fileName !== entry.fileName), entry]);
      setLocations(prev => applyProfileToLocations(prev, {
        ...ref, colByLocation: Object.fromEntries(hosting.map(n => [n, col])),
      }));
      // Let an open editor holding its own copy of this tech's constraints
      // (LocationEditDialog) pick up the same resource ref.
      if (onApplied) {
        const probe = applyProfileToLocations([{ name: '_', techs: { [techName]: {} } }], { ...ref, colByLocation: { _: col } });
        onApplied(probe[0].techs[techName].constraints);
      }
      showNotification(
        `Profile ${entry.fileName} applied to ${hosting.length} location${hosting.length === 1 ? '' : 's'} and saved to the model`,
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

  return (
    <ProfileDialogFrame
      title={PROFILE_KIND_LABEL[kind] || 'Resource profile'}
      subtitle={techName}
      onClose={onClose}
      onApply={handleApply}
      canApply={canApply}
    >
          {/* Points */}
          <div className="w-64 flex-shrink-0 border-r border-black/15 overflow-y-auto p-4">
            <p className="text-[0.6875rem] font-bold text-black/60 mb-2 uppercase tracking-widest">
              Points ({hosting.length})
            </p>
            {hosting.length === 0 ? (
              <p className="text-xs text-slate-500">No location in this model uses this technology yet.</p>
            ) : (
              <>
                <ul className="space-y-1">
                  {hosting.map(n => (
                    <li
                      key={n}
                      className={`px-2 py-1 text-xs border ${n === focusLocation ? 'border-black bg-slate-100 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'}`}
                    >
                      {n}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-500 mt-3">All points share one profile column.</p>
              </>
            )}
          </div>

          {/* Metadata + chart */}
          <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-4">
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
            {state.status === 'unlinked' && notice('This technology is not linked to opentech-db, so no profile is available.')}
            {state.status === 'loading' && <p className="text-sm text-slate-500">Loading profile from opentech-db…</p>}
            {state.status === 'offline' && (
              <div className="flex items-center gap-3">
                {notice(`Could not reach opentech-db${state.error ? `: ${state.error}` : ''}.`, 'amber')}
                <button type="button" onClick={retry} className="px-3 py-1.5 text-xs font-medium bg-black text-white hover:bg-gray-800">
                  Retry
                </button>
              </div>
            )}
            {state.status === 'none' && notice('opentech-db has no full-year profile for this technology yet.')}

            {profile && values && (
              <>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <div><span className="text-slate-500">Profile</span> <span className="font-mono text-slate-800">{profile.profile_id}</span></div>
                  <div>
                    <span className="text-slate-500">Method</span>{' '}
                    {profile.method
                      ? <span className={`px-1.5 py-0.5 text-[11px] font-medium ${METHOD_CLS[profile.method] || 'bg-slate-100 text-slate-700'}`}>{profile.method}</span>
                      : <span className="text-slate-400">unknown</span>}
                  </div>
                  <div><span className="text-slate-500">Year</span> <span className="text-slate-800">{profile.year}</span></div>
                  <div><span className="text-slate-500">Mean</span> <span className="text-slate-800">{mean.toFixed(3)}</span></div>
                  {profile.source && (
                    <div className="col-span-2"><span className="text-slate-500">Source</span> <span className="text-slate-800">{profile.source}</span></div>
                  )}
                </div>

                <ProfileChart values={values} />

                {profile.citations?.length > 0 && (
                  <div>
                    <p className="text-[0.6875rem] font-bold text-black/60 mb-1 uppercase tracking-widest">Citations</p>
                    <ul className="space-y-1 text-xs">
                      {profile.citations.map((c, i) => (
                        <li key={i}>
                          {c.url
                            ? <a href={c.url} target="_blank" rel="noreferrer" className="underline text-slate-800 hover:text-black">{c.title || c.url}</a>
                            : <span className="text-slate-800">{c.title}</span>}
                          {c.parameter && <span className="text-slate-500"> · {c.parameter}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {applyError && notice(`Could not apply profile: ${applyError}`, 'amber')}
          </div>
    </ProfileDialogFrame>
  );
}

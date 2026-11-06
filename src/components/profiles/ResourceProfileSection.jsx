// Compact "Resource profile" status block for a technology: kind badge, whether
// a profile is applied / stale, and a button that opens the ProfileDialog.
import React, { Suspense, lazy, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import {
  PROFILE_KIND_LABEL, classifyProfileKind, modelCalendar, profileFileName, profileStaleness,
} from '../../services/techProfiles';

const ProfileDialog = lazy(() => import('./ProfileDialog'));

export default function ResourceProfileSection({ techName, techUuid, parent, focusLocation, onProfileApplied }) {
  const { timeSeries, locations, getCurrentModel } = useData();
  const [open, setOpen] = useState(false);
  const kind = classifyProfileKind({ id: techName, name: techName, parent });
  const fileName = profileFileName(techName);
  const entry = useMemo(
    () => (timeSeries || []).find(ts => ts.fileName === fileName) || null,
    [timeSeries, fileName],
  );
  const model = getCurrentModel();
  const { stale } = useMemo(
    () => profileStaleness(entry, { modelConfig: modelCalendar(model) || {}, locations, techName }),
    [entry, model, locations, techName],
  );
  if (!kind) return null;
  const status = !entry ? 'Not set' : stale ? 'Out of date' : 'Applied';
  const statusCls = !entry ? 'text-slate-500' : stale ? 'text-amber-600' : 'text-emerald-700';

  return (
    <div className="border border-slate-200 p-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold text-slate-700">{PROFILE_KIND_LABEL[kind]}</p>
        <p className={`text-[11px] ${statusCls}`}>
          {status}
          {entry?.profileSource?.method && <span className="ml-2 text-slate-500">· {entry.profileSource.method}</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs font-medium bg-black text-white hover:bg-gray-800"
      >
        {entry ? 'Edit profile' : 'Calculate profile'}
      </button>
      {open && (
        <Suspense fallback={null}>
          <ProfileDialog
            onClose={() => setOpen(false)}
            techName={techName}
            techUuid={techUuid}
            parent={parent}
            kind={kind}
            focusLocation={focusLocation}
            onApplied={onProfileApplied}
          />
        </Suspense>
      )}
    </div>
  );
}

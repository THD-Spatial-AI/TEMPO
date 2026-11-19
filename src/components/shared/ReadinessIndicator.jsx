// Sidebar readiness counter and the drawer it opens. Shows the unsaved Creation draft
// while in Creation, otherwise the loaded model; a new model gets a to-do checklist.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../context/DataContext';
import useModelReadiness from '../../hooks/useModelReadiness';
import { useDraftReadiness } from '../../services/draftReadiness';
import { forDraft, readinessChecklist } from '../../services/modelReadiness';
import { requestFix } from '../../services/fixIntent';
import ReadinessPanel from './ReadinessPanel';
import { FiArrowRight, FiCheckCircle, FiCircle, FiX, LuShieldCheck } from '../ui/icons';

// Views where the model is built or run.
const SHOWN_ON = new Set(['Creation', 'Map View', 'Locations', 'Links', 'Technologies', 'Tech Database', 'TimeSeries', 'Scenarios', 'Run']);

function Checklist({ items, draft, onGo }) {
  // A draft is built on the Creation map; a saved model adds locations and techs on Locations.
  const view = draft ? 'Creation' : 'Locations';
  return (
    <div>
      <p className="text-sm text-slate-600">Start with the basics. Each one makes the model runnable:</p>
      <ul className="mt-3 space-y-1">
        {items.map((i) => (
          <li key={i.key}>
            <button
              disabled={i.done}
              onClick={() => onGo({ view })}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 disabled:hover:bg-transparent"
            >
              {i.done ? <FiCheckCircle size={16} className="text-black" /> : <FiCircle size={16} className="text-slate-400" />}
              <span className={`flex-1 ${i.done ? 'text-slate-400 line-through' : 'font-medium text-slate-800'}`}>{i.label}</span>
              {!i.done && <FiArrowRight size={13} className="text-slate-500" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ReadinessIndicator({ open, selected, setSelected }) {
  const { currentModelId, getCurrentModel, setModelReadinessIgnored } = useData();
  const model = useModelReadiness();
  const draftRaw = useDraftReadiness();
  const [drawer, setDrawer] = useState(false);

  const draft = selected === 'Creation';
  const readiness = draft ? (draftRaw && forDraft(draftRaw)) : model;
  if (!SHOWN_ON.has(selected) || !readiness) return null;

  const counts = [readiness.critical.length, readiness.errors.length, readiness.warnings.length];
  const total = counts[0] + counts[1] + counts[2];
  const checklist = readinessChecklist(readiness);

  const go = (view) => {
    setDrawer(false);
    setSelected(view);
  };
  const goTarget = (target) => {
    requestFix(target);
    go(target.view);
  };
  // Ignored warnings belong to the saved model; a draft has nowhere to keep them yet.
  const ignoredList = getCurrentModel()?.metadata?.modelConfig?.readinessIgnored || [];
  const setIgnored = (list) => setModelReadinessIgnored(currentModelId, list);
  const onIgnore = !draft && currentModelId ? (code, item) => setIgnored([...ignoredList, { code, item }]) : undefined;
  const onRestore = !draft && currentModelId
    ? (code, item) => setIgnored(ignoredList.filter((i) => !(i.code === code && (i.item ?? null) === (item ?? null))))
    : undefined;

  const summary = checklist ? 'Getting started'
    : total === 0 ? 'Ready to run'
    : [counts[0] && `${counts[0]} critical`, counts[1] && `${counts[1]} error${counts[1] === 1 ? '' : 's'}`, counts[2] && `${counts[2]} warning${counts[2] === 1 ? '' : 's'}`]
      .filter(Boolean).join(' · ');

  return (
    <>
      <button
        onClick={() => setDrawer(true)}
        aria-label={`Model check: ${summary}`}
        title={open ? undefined : `Model check: ${summary}`}
        className="mt-3 flex h-10 items-center rounded-xl pl-0.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <div className="relative grid h-full w-11 shrink-0 place-items-center">
          <LuShieldCheck size={18} />
          {total > 0 && (
            <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${counts[0] ? 'bg-black' : counts[1] ? 'bg-slate-500' : 'bg-slate-300'}`} />
          )}
        </div>
        {open && (
          <span className="flex min-w-0 flex-1 flex-col pr-2 text-left leading-tight">
            <span className="text-sm font-medium">Model check</span>
            <span className="truncate text-[11px] text-slate-500">{summary}</span>
          </span>
        )}
      </button>

      {drawer && createPortal(
        <div className="fixed inset-0 z-[9000] flex justify-end bg-black/20" onClick={() => setDrawer(false)}>
          <aside
            role="dialog"
            aria-label="Model check"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col border-l border-black/15 bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Model check</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {draft ? 'Unsaved model in Creation' : getCurrentModel()?.name}
                  {' — '}only critical problems stop a run.
                </p>
              </div>
              <button onClick={() => setDrawer(false)} aria-label="Close" className="text-slate-500 hover:text-black">
                <FiX size={18} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {checklist
                ? <Checklist items={checklist} draft={draft} onGo={goTarget} />
                : <ReadinessPanel readiness={readiness} onNavigate={go} onIgnore={onIgnore} onRestore={onRestore} emptyText="Nothing to fix. The model is ready to run." />}
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}

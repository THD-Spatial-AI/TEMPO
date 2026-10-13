/**
 * SaveBar — always-visible model save status strip.
 *
 * Shows at the top of every editing screen.  Displays:
 *   • A pulsing amber dot + "Unsaved changes" when the model is dirty
 *   • A green check + "Auto-saved" when clean
 *   • A "Save" button that persists immediately (bypasses the 1.5 s debounce)
 *
 * Usage:  <SaveBar label="Locations" />
 */
import React, { useState, useEffect } from 'react';
import { FiCheck, FiAlertCircle } from 'react-icons/fi';
import { LuSave, LuRefreshCw } from 'react-icons/lu';
import { useData } from '../../context/DataContext';

const SaveBar = ({ label = 'Model' }) => {
  const { isDirty, saveNow, getCurrentModel, showNotification } = useData();
  const [saving, setSaving]     = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Reset "just saved" feedback after 2 s
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);

  const currentModel = getCurrentModel();

  const handleSave = () => {
    setSaving(true);
    saveNow();
    showNotification(`${label} saved successfully.`, 'success');
    setTimeout(() => {
      setSaving(false);
      setJustSaved(true);
    }, 400);
  };

  /* ── colour theme ── */
  const dirty = isDirty && !saving;
  const bg    = dirty ? 'bg-gray-50 border-gray-200' : 'bg-slate-50 border-slate-200';
  const text  = dirty ? 'text-gray-800' : 'text-slate-500';

  return (
    <div className={`flex items-center gap-3 px-5 py-2 border-b shrink-0 ${bg}`}>

      {/* ── Status indicator ── */}
      {dirty ? (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-500" />
        </span>
      ) : (
        <FiCheck size={13} className={justSaved ? 'text-gray-700' : 'text-slate-400'} />
      )}

      {/* ── Label ── */}
      <span className={`text-xs font-medium flex-1 ${text}`}>
        {dirty
          ? `${label} — unsaved changes`
          : justSaved
            ? `${label} — saved`
            : currentModel
              ? `${label} — ${currentModel.name}`
              : label}
      </span>

      {/* ── Date hint ── */}
      {currentModel?.updatedAt && !dirty && (
        <span className="text-xs text-slate-400 hidden sm:block">
          Last saved {new Date(currentModel.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}

      {/* ── Save button ── */}
      <button
        onClick={handleSave}
        disabled={saving}
        title="Save model now (Ctrl+S)"
        className={`inline-flex h-9 items-center gap-2 px-4 rounded-lg text-[13px] font-semibold
                   transition-all disabled:opacity-60 shrink-0
                   ${dirty
                     ? 'bg-gray-700 hover:bg-gray-800 text-white shadow-sm'
                     : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                   }`}
      >
        {saving
          ? <LuRefreshCw size={15} className="animate-spin" />
          : <LuSave size={15} />}
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
};

export default SaveBar;

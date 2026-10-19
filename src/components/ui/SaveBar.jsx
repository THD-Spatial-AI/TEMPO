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
import { FiCheck, FiAlertCircle } from './icons';
import { LuSave, LuRefreshCw } from './icons';
import { useData } from '../../context/DataContext';
import { useT, locale } from '../../i18n';
import { tr } from '../../i18n';

const SaveBar = ({ label = tr("Model"), inline = false }) => {
  const t = useT();
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
    showNotification(t('save.savedNotice', { label }), 'success');
    setTimeout(() => {
      setSaving(false);
      setJustSaved(true);
    }, 400);
  };

  /* ── colour theme ── */
  const dirty = isDirty && !saving;
  const savedAt = currentModel?.updatedAt ? new Date(currentModel.updatedAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : null;

  // Compact variant for page headers: status + Save button, no full-width strip.
  if (inline) {
    return (
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {dirty ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
          ) : (
            <FiCheck size={13} className={justSaved ? 'text-emerald-600' : 'text-slate-400'} />
          )}
          <span className={dirty ? 'font-medium text-slate-800' : ''}>
            {dirty ? t('save.unsaved') : justSaved ? t('save.saved') : savedAt ? t('save.savedAt', { time: savedAt }) : t('save.allSaved')}
          </span>
        </span>
        <button
          onClick={handleSave}
          disabled={saving}
          title={t('save.tooltip')}
          className={`inline-flex h-9 shrink-0 items-center gap-2 px-4 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
            dirty ? 'bg-black text-white hover:bg-black/80' : 'border border-black/15 bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          {saving ? <LuRefreshCw size={15} className="animate-spin" /> : <LuSave size={15} />}
          {saving ? t('save.saving') : t('save.save')}
        </button>
      </div>
    );
  }
  const bg    = dirty ? 'bg-gray-50 border-black/15' : 'bg-slate-50 border-black/15';
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
          ? tr("{0} — unsaved changes", { 0: label })
          : justSaved
            ? tr("{0} — saved", { 0: label })
            : currentModel
              ? `${label} — ${currentModel.name}`
              : label}
      </span>

      {/* ── Date hint ── */}
      {currentModel?.updatedAt && !dirty && (
        <span className="text-xs text-slate-400 hidden sm:block">
          {tr("Last saved")} {new Date(currentModel.updatedAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}

      {/* ── Save button ── */}
      <button
        onClick={handleSave}
        disabled={saving}
        title={tr("Save model now (Ctrl+S)")}
        className={`inline-flex h-9 items-center gap-2 px-4 rounded-lg text-[13px] font-semibold
                   transition-all disabled:opacity-60 shrink-0
                   ${dirty
                     ? 'bg-black hover:bg-black/80 text-white '
                     : 'bg-white border border-black/15 text-slate-600 hover:bg-slate-100'
                   }`}
      >
        {saving
          ? <LuRefreshCw size={15} className="animate-spin" />
          : <LuSave size={15} />}
        {saving ? tr("Saving…") : tr("Save")}
      </button>
    </div>
  );
};

export default SaveBar;

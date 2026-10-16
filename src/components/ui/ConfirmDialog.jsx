// Shared confirmation dialog, mounted once at the app root. Open it with
// `confirmAction({...})` from ./confirm (resolves to true/false).
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuTrash2, LuInfo, LuX } from './icons';
import { subscribeConfirm, nextConfirm } from './confirm';

const TONES = {
  danger:  { icon: LuTrash2, badge: 'bg-red-50 text-red-600 ring-red-100',   button: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-300' },
  neutral: { icon: LuInfo,   badge: 'bg-slate-100 text-slate-700 ring-slate-200', button: 'bg-slate-900 hover:bg-slate-800 focus-visible:ring-slate-300' },
};

export function ConfirmHost() {
  const [request, setRequest] = useState(null);
  const currentRef = useRef(null);
  const confirmRef = useRef(null);

  const pump = useCallback(() => {
    if (currentRef.current) return;
    const next = nextConfirm();
    if (next) { currentRef.current = next; setRequest(next); }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeConfirm(pump);
    queueMicrotask(pump);
    return unsubscribe;
  }, [pump]);

  const close = (result) => {
    currentRef.current?.resolve(result);
    currentRef.current = null;
    setRequest(null);
    queueMicrotask(pump);
  };

  useEffect(() => {
    if (!request) return undefined;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(false); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  if (!request) return null;
  const {
    title = 'Are you sure?',
    message,
    details,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    tone = 'danger',
  } = request;
  const t = TONES[tone] || TONES.danger;
  const Icon = t.icon;

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4" onMouseDown={() => close(false)}>
      <div className="tempo-confirm-backdrop absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tempo-confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="tempo-confirm-panel relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10"
      >
        <button onClick={() => close(false)} aria-label="Close"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
          <LuX size={18} />
        </button>
        <div className="flex gap-4 px-6 pb-5 pt-6">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ring-8 ${t.badge}`}>
            <Icon size={20} />
          </span>
          <div className="min-w-0 pr-6">
            <h2 id="tempo-confirm-title" className="text-base font-semibold text-slate-900">{title}</h2>
            {message && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{message}</p>}
            {details && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-medium text-slate-800 break-words">
                {details}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
          <button onClick={() => close(false)}
            className="h-10 rounded-lg border border-black/15 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
            {cancelLabel}
          </button>
          <button ref={confirmRef} onClick={() => close(true)}
            className={`h-10 rounded-lg px-4 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-4 ${t.button}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

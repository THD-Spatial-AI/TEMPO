// Shared shell of the resource-profile dialogs: portal, Esc (capture phase, so a
// dialog underneath never sees it), header and a Cancel / Apply footer.
import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX } from '../ui/icons';

export default function ProfileDialogFrame({ title, subtitle, onClose, onApply, canApply, children }) {
  const closeRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => { closeRef.current?.focus(); }, []);

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-surface-container-lowest w-[min(1100px,95vw)] h-[min(760px,90vh)] flex flex-col border border-black/15 shadow-xl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/15 bg-white flex items-center justify-between">
          <div>
            <h3 id={titleId} className="text-xl font-bold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{subtitle}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="text-slate-400 hover:text-gray-700" aria-label="Close">
            <FiX size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">{children}</div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-black/15 bg-slate-50">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200">
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!canApply}
            className="px-4 py-2 text-sm font-medium bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Apply to model
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

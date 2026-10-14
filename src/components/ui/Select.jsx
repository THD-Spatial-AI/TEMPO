import { useEffect, useId, useRef, useState } from 'react';
import { LuCheck, LuChevronDown } from './icons';

// options: [{ value, label, description?, disabled? }]
export default function Select({ value, onChange, options, placeholder = 'Select…', className = '' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const openMenu = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const choose = (opt) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  const step = (dir) => {
    setActive((i) => {
      let next = i;
      for (let n = 0; n < options.length; n++) {
        next = (next + dir + options.length) % options.length;
        if (!options[next].disabled) return next;
      }
      return i;
    });
  };

  const onKeyDown = (e) => {
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={`flex h-10 w-full items-center gap-2 rounded-lg border bg-white px-3 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
          open ? 'border-slate-400' : 'border-black/15 hover:border-black/15'
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <LuChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-black/15 bg-white p-1 shadow-xl shadow-slate-900/10"
        >
          {options.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No options</li>}
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                title={opt.label}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(opt); }}
                className={`flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 ${
                  opt.disabled ? 'cursor-not-allowed opacity-40' : active === i ? 'bg-slate-100' : ''
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${isSelected ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{opt.label}</span>
                  {opt.description && <span className="block truncate text-xs text-slate-500">{opt.description}</span>}
                </span>
                {isSelected && <LuCheck size={15} className="mt-0.5 shrink-0 text-slate-900" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

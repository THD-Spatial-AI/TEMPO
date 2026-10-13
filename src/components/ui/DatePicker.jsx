import { useEffect, useRef, useState } from 'react';
import { LuCalendar, LuChevronLeft, LuChevronRight, LuChevronsLeft, LuChevronsRight } from 'react-icons/lu';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => {
  const [y, m, d] = (s || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

// Values are 'YYYY-MM-DD' strings.
export default function DatePicker({ value, onChange, min, rangeStart, rangeEnd, placeholder = 'Pick a date' }) {
  const selected = parseISO(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected || new Date());
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) setView(selected || new Date());
    setOpen((o) => !o);
  };
  const shift = (months) => setView((v) => new Date(v.getFullYear(), v.getMonth() + months, 1));
  const pick = (d) => { onChange(toISO(d)); setOpen(false); };

  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i - lead + 1));
  const minISO = min || '';
  const todayISO = toISO(new Date());

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex h-10 w-full items-center gap-2.5 rounded-lg border bg-white px-3 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
          open ? 'border-slate-400' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <LuCalendar size={15} className="shrink-0 text-slate-400" />
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? selected.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : placeholder}
        </span>
      </button>

      {open && (
        <div role="dialog" className="absolute left-0 z-30 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10">
          <div className="mb-2 flex items-center gap-0.5">
            <NavButton onClick={() => shift(-12)} label="Previous year"><LuChevronsLeft size={15} /></NavButton>
            <NavButton onClick={() => shift(-1)} label="Previous month"><LuChevronLeft size={15} /></NavButton>
            <span className="flex-1 text-center text-sm font-semibold text-slate-900">
              {view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <NavButton onClick={() => shift(1)} label="Next month"><LuChevronRight size={15} /></NavButton>
            <NavButton onClick={() => shift(12)} label="Next year"><LuChevronsRight size={15} /></NavButton>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400">
            {WEEKDAYS.map((d) => <span key={d} className="py-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((d) => {
              const iso = toISO(d);
              const inMonth = d.getMonth() === view.getMonth();
              const disabled = minISO && iso < minISO;
              const isSelected = iso === value;
              const inRange = rangeStart && rangeEnd && iso >= rangeStart && iso <= rangeEnd;
              const isEdge = iso === rangeStart || iso === rangeEnd;
              return (
                <div key={iso} className={inRange ? 'bg-slate-100' : ''}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(d)}
                    className={`grid h-8 w-full place-items-center rounded-lg text-xs transition-colors disabled:cursor-not-allowed disabled:text-slate-300 disabled:line-through disabled:hover:bg-transparent ${
                      isSelected ? 'bg-slate-900 font-semibold text-white'
                        : isEdge ? 'bg-slate-300 font-semibold text-slate-900'
                        : inMonth ? 'text-slate-700 hover:bg-slate-200' : 'text-slate-300 hover:bg-slate-100'
                    } ${iso === todayISO && !isSelected ? 'ring-1 ring-inset ring-slate-400' : ''}`}
                  >
                    {d.getDate()}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => setView(selected || new Date())}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              Go to selected
            </button>
            <button
              type="button"
              disabled={minISO && todayISO < minISO}
              onClick={() => pick(new Date())}
              className="rounded-md px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-30"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavButton({ onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </button>
  );
}

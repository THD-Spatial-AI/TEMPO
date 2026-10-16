// Drop-in replacement for a native <select>: same <option>/<optgroup> children and
// onChange(e) with e.target.value, rendered as a styled menu in a portal.
import { Children, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuCheck, LuChevronDown } from './icons';

const text = (node) => Children.toArray(node).map((c) => (typeof c === 'string' || typeof c === 'number' ? c : isValidElement(c) ? text(c.props.children) : '')).join('');

function collect(children, group = null, out = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === 'optgroup') collect(child.props.children, child.props.label, out);
    else if (child.type === 'option') {
      const label = text(child.props.children);
      out.push({ value: String(child.props.value ?? label), label, disabled: !!child.props.disabled, group });
    } else if (child.type?.toString?.() === 'Symbol(react.fragment)' || child.props?.children) collect(child.props.children, group, out);
  });
  return out;
}

export default function SelectField({ value, onChange, children, className = '', disabled = false, title, id, style }) {
  const options = collect(children);
  const current = options.find((o) => o.value === String(value ?? '')) || null;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const longest = Math.max(0, ...options.map((o) => o.label.length));
    const width = Math.min(380, Math.max(r.width, 180, longest * 7.5 + 56));
    const below = window.innerHeight - r.bottom;
    const height = Math.min(300, options.length * 32 + 12);
    const up = below < height + 12 && r.top > below;
    setPos({ left: Math.min(r.left, window.innerWidth - width - 8), width, top: up ? undefined : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : undefined });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false); };
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) menuRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openMenu = () => {
    place();
    setActive(Math.max(0, options.indexOf(current)));
    setOpen(true);
  };

  const choose = (opt) => {
    if (opt.disabled) return;
    setOpen(false);
    if (opt.value !== current?.value) onChange?.({ target: { value: opt.value }, currentTarget: { value: opt.value } });
    btnRef.current?.focus();
  };

  const step = (dir) => setActive((i) => {
    let next = i;
    for (let n = 0; n < options.length; n++) {
      next = (next + dir + options.length) % options.length;
      if (!options[next].disabled) return next;
    }
    return i;
  });

  const onKeyDown = (e) => {
    if (disabled) return;
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
    <div className={`relative inline-flex items-center ${disabled ? 'opacity-50' : ''} ${className}`} style={style} title={title}>
      <button
        ref={btnRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className="flex h-full w-full min-w-0 items-center gap-1.5 bg-transparent text-left outline-none disabled:cursor-not-allowed"
      >
        <span className={`min-w-0 flex-1 truncate ${current ? '' : 'text-slate-400'}`}>{current ? current.label : 'Select…'}</span>
        <LuChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && createPortal(
        <ul
          ref={menuRef}
          id={listId}
          role="listbox"
          className="fixed z-[10200] max-h-[300px] overflow-y-auto border border-black/15 bg-white p-1 text-[13px] shadow-xl shadow-slate-900/10"
          style={pos}
        >
          {options.map((opt, i) => (
            <li key={`${opt.group || ''}-${opt.value}-${i}`}>
              {opt.group && opt.group !== options[i - 1]?.group && (
                <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{opt.group}</div>
              )}
              <div
                role="option"
                data-index={i}
                aria-selected={opt.value === current?.value}
                aria-disabled={opt.disabled}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(opt)}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 ${opt.disabled ? 'cursor-not-allowed text-slate-300' : i === active ? 'bg-slate-100 text-slate-900' : 'text-slate-700'}`}
              >
                <span className="min-w-0 flex-1 truncate" title={opt.label}>{opt.label}</span>
                {opt.value === current?.value && <LuCheck size={14} className="shrink-0 text-slate-900" />}
              </div>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

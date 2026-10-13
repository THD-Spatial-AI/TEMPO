import { LuArrowDown, LuArrowUp, LuArrowUpDown } from 'react-icons/lu';

export default function SortHeader({ label, sortKey, sort, onSort, align = 'left', className = '' }) {
  const active = sort.key === sortKey;
  const Icon = !active ? LuArrowUpDown : sort.dir === 'asc' ? LuArrowUp : LuArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`group/sort inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
        active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
      } ${align === 'right' ? 'flex-row-reverse' : ''} ${className}`}
    >
      {label}
      <Icon size={12} className={active ? '' : 'opacity-0 group-hover/sort:opacity-100'} />
    </button>
  );
}

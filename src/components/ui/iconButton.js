// Shared style for icon-only edit / delete buttons so row actions match app-wide.
const BASE = 'inline-grid shrink-0 place-items-center rounded-md text-slate-500 transition-colors disabled:pointer-events-none disabled:opacity-40';
const SIZE = { md: 'h-8 w-8', sm: 'h-[26px] w-[26px]' };
const HOVER = { edit: 'hover:bg-slate-100 hover:text-slate-900', delete: 'hover:bg-red-50 hover:text-red-600' };

export const iconBtn = (kind = 'edit', size = 'md') => `${BASE} ${SIZE[size]} ${HOVER[kind] || HOVER.edit}`;
export const ICON_PX = { md: 17, sm: 14 };

// Delete/remove button that asks for confirmation before calling onConfirm.
import { LuTrash2 } from './icons';
import { confirmAction } from './confirm';
import { tr } from '../../i18n';

const SIZES = {
  sm: { box: 'h-8 px-2.5 text-xs gap-1.5', icon: 15, square: 'h-8 w-8' },
  md: { box: 'h-10 px-3 text-sm gap-2', icon: 18, square: 'h-10 w-10' },
};

export default function DeleteButton({
  onConfirm,
  label = tr("Remove"),
  title,
  message,
  details,
  confirmLabel,
  iconOnly = false,
  size = 'md',
  className = '',
  disabled = false,
}) {
  const s = SIZES[size] || SIZES.md;
  const handleClick = async (e) => {
    e.stopPropagation();
    const ok = await confirmAction({
      title: title || `${label}?`,
      message: message || tr("This action cannot be undone."),
      details,
      confirmLabel: confirmLabel || label,
    });
    if (ok) onConfirm?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={iconOnly ? label : undefined}
      aria-label={iconOnly ? label : undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40 ${
        iconOnly ? s.square : s.box
      } ${className}`}
    >
      <LuTrash2 size={s.icon} />
      {!iconOnly && label}
    </button>
  );
}

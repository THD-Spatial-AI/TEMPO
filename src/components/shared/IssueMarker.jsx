// Inline flag for an entity with readiness issues; hovering lists them.
import { FiAlertCircle, FiAlertTriangle } from '../ui/icons';

const COLOR = { critical: 'text-black', error: 'text-slate-600', warning: 'text-slate-400' };

export default function IssueMarker({ issues, size = 14 }) {
  if (!issues?.length) return null;
  const worst = issues[0].severity;
  const Icon = worst === 'warning' ? FiAlertTriangle : FiAlertCircle;
  const text = issues.map((i) => `• ${i.message}`).join('\n');
  return (
    <span title={text} aria-label={`${issues.length} readiness issue${issues.length === 1 ? '' : 's'}: ${text}`}
      className={`inline-flex shrink-0 cursor-help ${COLOR[worst]}`}>
      <Icon size={size} />
    </span>
  );
}

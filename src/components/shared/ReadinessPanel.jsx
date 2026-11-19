// Lists readiness issues from checkModel or an engine /assess, with a jump to the
// page that fixes each one.
import { requestProfileDialog } from '../../services/profileIntent';
import { FiAlertCircle, FiAlertTriangle, FiArrowRight, FiCheckCircle } from '../ui/icons';

function IssueRow({ issue, onNavigate }) {
  const isCritical = issue.severity === 'critical';
  const isError = isCritical || issue.severity === 'error';
  const Icon = isError ? FiAlertCircle : FiAlertTriangle;
  const more = (issue.count || 0) - (issue.items?.length || 0);
  return (
    <li className="flex gap-3 py-2.5">
      <Icon size={15} className={`mt-0.5 shrink-0 ${isCritical ? 'text-black' : isError ? 'text-slate-600' : 'text-slate-400'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800">
          {isCritical && <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-black">Blocks run</span>}
          {issue.message}
        </p>
        {issue.items?.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-slate-500" title={issue.items.join(', ')}>
            {issue.items.join(', ')}{more > 0 ? ` and ${more} more` : ''}
          </p>
        )}
      </div>
      {issue.view && onNavigate && (
        <button
          onClick={() => {
            if (issue.profileTech) requestProfileDialog(issue.profileTech);
            onNavigate(issue.view);
          }}
          className="flex shrink-0 items-center gap-1 self-start text-xs font-semibold text-black hover:underline"
        >
          Fix <FiArrowRight size={12} />
        </button>
      )}
    </li>
  );
}

export default function ReadinessPanel({ readiness, onNavigate, emptyText = 'No problems found.' }) {
  if (!readiness) return null;
  // Engine /assess from an older service has no critical list.
  const issues = [...(readiness.critical || []), ...readiness.errors, ...readiness.warnings];
  if (!issues.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <FiCheckCircle size={15} /> {emptyText}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-black/10">
      {issues.map((issue, i) => <IssueRow key={`${issue.code}-${i}`} issue={issue} onNavigate={onNavigate} />)}
    </ul>
  );
}

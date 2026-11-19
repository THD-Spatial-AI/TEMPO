// Lists readiness issues from checkModel or an engine /assess, with a jump to the
// page (or, per item, the exact entity) that fixes each one.
import { requestFix } from '../../services/fixIntent';
import { FiAlertCircle, FiAlertTriangle, FiArrowRight, FiCheckCircle } from '../ui/icons';

function IssueRow({ issue, onNavigate }) {
  const isCritical = issue.severity === 'critical';
  const isError = isCritical || issue.severity === 'error';
  const Icon = isError ? FiAlertCircle : FiAlertTriangle;
  const more = (issue.count || 0) - (issue.items?.length || 0);
  const itemLinks = Boolean(issue.targets && onNavigate);
  const go = (target) => {
    requestFix(target);
    onNavigate(target.view);
  };
  return (
    <li className="flex gap-3 py-2.5">
      <Icon size={15} className={`mt-0.5 shrink-0 ${isCritical ? 'text-black' : isError ? 'text-slate-600' : 'text-slate-400'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800">
          {isCritical && <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-black">Blocks run</span>}
          {issue.message}
        </p>
        {issue.items?.length > 0 && !itemLinks && (
          <p className="mt-0.5 truncate text-xs text-slate-500" title={issue.items.join(', ')}>
            {issue.items.join(', ')}{more > 0 ? ` and ${more} more` : ''}
          </p>
        )}
        {issue.items?.length > 0 && itemLinks && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {issue.items.map((item, n) => (issue.targets[n] ? (
              <button
                key={n}
                onClick={() => go(issue.targets[n])}
                className="flex max-w-full items-center gap-1 font-medium text-slate-700 hover:text-black hover:underline"
                title={`Go to ${item}`}
              >
                <span className="truncate">{item}</span> <FiArrowRight size={11} className="shrink-0" />
              </button>
            ) : <span key={n} className="text-slate-500">{item}</span>))}
            {more > 0 && <span className="text-slate-500">and {more} more</span>}
          </div>
        )}
      </div>
      {issue.view && onNavigate && !itemLinks && (
        <button
          onClick={() => go(issue.profileTech
            ? { view: issue.view, kind: 'tech', id: issue.profileTech, profile: true }
            : { view: issue.view })}
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

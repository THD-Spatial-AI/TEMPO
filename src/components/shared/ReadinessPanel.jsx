// Lists readiness issues from checkModel or an engine /assess, with a jump to the
// page (or, per item, the exact entity) that fixes each one.
import { requestFix } from '../../services/fixIntent';
import { FiAlertCircle, FiAlertTriangle, FiArrowRight, FiCheckCircle, FiEyeOff } from '../ui/icons';

function IgnoreButton({ onClick, label }) {
  return (
    <button onClick={onClick} title={`Ignore ${label} for this model`} aria-label={`Ignore ${label}`}
      className="shrink-0 text-slate-300 hover:text-slate-700">
      <FiEyeOff size={12} />
    </button>
  );
}

function IssueRow({ issue, onNavigate, onIgnore }) {
  const isCritical = issue.severity === 'critical';
  const isError = isCritical || issue.severity === 'error';
  const Icon = isError ? FiAlertCircle : FiAlertTriangle;
  const more = (issue.count || 0) - (issue.items?.length || 0);
  const itemLinks = Boolean(issue.targets && onNavigate);
  // Only warnings can be set aside; errors and critical issues always show.
  const canIgnore = Boolean(onIgnore) && issue.severity === 'warning';
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
          {issue.setBy && <span className="ml-1.5 text-xs text-slate-500">Set by {issue.setBy}.</span>}
        </p>
        {issue.items?.length > 0 && !itemLinks && !canIgnore && (
          <p className="mt-0.5 truncate text-xs text-slate-500" title={issue.items.join(', ')}>
            {issue.items.join(', ')}{more > 0 ? ` and ${more} more` : ''}
          </p>
        )}
        {issue.items?.length > 0 && (itemLinks || canIgnore) && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {issue.items.map((item, n) => (
              <span key={n} className="flex max-w-full items-center gap-1">
                {itemLinks && issue.targets[n] ? (
                  <button
                    onClick={() => go(issue.targets[n])}
                    className="flex min-w-0 items-center gap-1 font-medium text-slate-700 hover:text-black hover:underline"
                    title={`Go to ${item}`}
                  >
                    <span className="truncate">{item}</span> <FiArrowRight size={11} className="shrink-0" />
                  </button>
                ) : <span className="truncate text-slate-500">{item}</span>}
                {canIgnore && <IgnoreButton onClick={() => onIgnore(issue.code, item)} label={item} />}
              </span>
            ))}
            {more > 0 && <span className="text-slate-500">and {more} more</span>}
          </div>
        )}
      </div>
      {canIgnore && !issue.items?.length && (
        <span className="self-start pt-0.5"><IgnoreButton onClick={() => onIgnore(issue.code, null)} label="this warning" /></span>
      )}
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

function IgnoredList({ ignored, onRestore }) {
  return (
    <details className="mt-2 border-t border-black/10 pt-2 text-xs text-slate-500">
      <summary className="cursor-pointer select-none font-medium">Ignored ({ignored.length})</summary>
      <ul className="mt-1.5 space-y-1">
        {ignored.map((i) => (
          <li key={`${i.code}-${i.item}`} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate" title={i.message}>{i.item || i.message}</span>
            {onRestore && (
              <button onClick={() => onRestore(i.code, i.item)} className="shrink-0 font-semibold text-black hover:underline">Restore</button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function ReadinessPanel({ readiness, onNavigate, onIgnore, onRestore, emptyText = 'No problems found.' }) {
  if (!readiness) return null;
  // Engine /assess from an older service has no critical list.
  const issues = [...(readiness.critical || []), ...readiness.errors, ...readiness.warnings];
  const ignored = readiness.ignored || [];
  return (
    <>
      {issues.length ? (
        <ul className="divide-y divide-black/10">
          {issues.map((issue, i) => <IssueRow key={`${issue.code}-${i}`} issue={issue} onNavigate={onNavigate} onIgnore={onIgnore} />)}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <FiCheckCircle size={15} /> {emptyText}
        </p>
      )}
      {ignored.length > 0 && <IgnoredList ignored={ignored} onRestore={onRestore} />}
    </>
  );
}

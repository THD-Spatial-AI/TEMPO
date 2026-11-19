// Fix links under a run log line: the entities of an [issue:<code>] line (from the loaded
// model's check) or the locations/techs an engine error or warning quotes. For a run of another model,
// one link loads that model first.
import { useData } from '../../context/DataContext';
import { useReadiness } from '../../hooks/useReadiness';
import { requestFix } from '../../services/fixIntent';
import { issueCodeOf, isProblemLine } from '../../services/logFixLinks';
import { FIX_VIEW } from '../../services/modelReadiness';
import { FiArrowRight } from '../ui/icons';

const MAX_LINKS = 6;

export default function LogLineFixes({ line, model, matcher, onNavigate, dark = false }) {
  const { currentModelId, loadModel } = useData();
  const { readiness } = useReadiness();
  if (!onNavigate || !model) return null;

  const code = issueCodeOf(line);
  const loaded = model.id === currentModelId;
  let links = [];
  if (code && loaded && readiness) {
    const issue = [...readiness.critical, ...readiness.errors, ...readiness.warnings].find((i) => i.code === code);
    links = (issue?.targets || []).map((t, n) => (t ? { label: issue.items[n] ?? t.id, target: t } : null)).filter(Boolean);
    // A problem a scenario brings in is not in the loaded model's check: link its page.
    const view = issue?.view || FIX_VIEW[code];
    if (!links.length && view) links = [{ label: 'Fix', target: { view } }];
  } else if (!code && isProblemLine(line)) {
    links = matcher(line);
  }

  const go = (target) => {
    requestFix(target);
    onNavigate(target.view);
  };
  const tone = dark ? 'text-sky-300 hover:text-white' : 'text-slate-700 hover:text-black';

  if (!loaded && (code || links.length)) {
    const target = links[0]?.target || { view: FIX_VIEW[code] || 'Dashboard' };
    return (
      <button onClick={() => { loadModel(model.id); go(target); }} className={`ml-2 inline-flex items-center gap-1 font-sans text-[11px] font-semibold hover:underline ${tone}`}>
        Load {model.name} and fix <FiArrowRight size={10} />
      </button>
    );
  }
  if (!links.length) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-x-2 font-sans text-[11px]">
      {links.slice(0, MAX_LINKS).map(({ label, target }, i) => (
        <button key={i} onClick={() => go(target)} className={`inline-flex items-center gap-0.5 font-semibold hover:underline ${tone}`} title={`Go to ${label}`}>
          {label} <FiArrowRight size={10} />
        </button>
      ))}
      {links.length > MAX_LINKS && <span className="opacity-60">+{links.length - MAX_LINKS} more</span>}
    </span>
  );
}

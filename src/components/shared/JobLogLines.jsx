// A finished run's log lines, each with its Fix links (see LogLineFixes).
import { useMemo } from 'react';
import LogLineFixes from './LogLineFixes';
import useRunModel from '../../hooks/useRunModel';
import { makeEntityMatcher } from '../../services/logFixLinks';

export default function JobLogLines({ job, onNavigate, className }) {
  const model = useRunModel(job);
  const matcher = useMemo(() => makeEntityMatcher(model), [model]);
  return (job.logs || []).map((l, i) => (
    <div key={i} className={className}>{l}<LogLineFixes line={l} model={model} matcher={matcher} onNavigate={onNavigate} dark /></div>
  ));
}

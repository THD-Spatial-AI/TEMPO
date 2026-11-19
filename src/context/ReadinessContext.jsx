import { useMemo } from 'react';
import useModelReadiness from '../hooks/useModelReadiness';
import { ReadinessContext } from '../hooks/useReadiness';
import { issuesByEntity } from '../services/modelReadiness';

// Checks the loaded model once and indexes its issues by entity (see hooks/useReadiness.js).
export function ReadinessProvider({ children }) {
  const readiness = useModelReadiness();
  const value = useMemo(() => ({ readiness, index: readiness ? issuesByEntity(readiness) : new Map() }), [readiness]);
  return <ReadinessContext.Provider value={value}>{children}</ReadinessContext.Provider>;
}

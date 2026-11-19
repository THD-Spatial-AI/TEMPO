// Readiness of the loaded model, shared through ReadinessProvider (computed once for the
// app shell) by the sidebar indicator and the inline markers on rows, cards and map markers.
import { createContext, useContext } from 'react';
import { entityKey } from '../services/modelReadiness';

export const ReadinessContext = createContext({ readiness: null, index: new Map() });

export const useReadiness = () => useContext(ReadinessContext);

// Issues on one entity of the loaded model, worst first (empty when none).
export function useEntityIssues(kind, ...parts) {
  return useContext(ReadinessContext).index.get(entityKey(kind, ...parts)) || [];
}

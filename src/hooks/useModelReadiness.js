import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { checkModel } from '../services/modelReadiness';

// Readiness of the model loaded in DataContext, or null when no model is loaded.
export default function useModelReadiness() {
  const { locations, links, technologies, timeSeries, currentModelId, getCurrentModel } = useData();
  const modelConfig = getCurrentModel()?.metadata?.modelConfig;

  return useMemo(() => {
    if (!currentModelId) return null;
    return checkModel({
      locations,
      links,
      technologies,
      timeSeries: (timeSeries || []).filter((ts) => !ts.modelId || ts.modelId === currentModelId),
      modelConfig: modelConfig || {},
    });
  }, [locations, links, technologies, timeSeries, currentModelId, modelConfig]);
}

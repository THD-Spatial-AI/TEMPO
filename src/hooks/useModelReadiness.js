import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { checkModel } from '../services/modelReadiness';

// Readiness of the model loaded in DataContext, or null when no model is loaded.
export default function useModelReadiness() {
  const { locations, links, technologies, timeSeries, currentModelId, getCurrentModel } = useData();
  const model = getCurrentModel();
  const modelConfig = model?.metadata?.modelConfig;
  const parameters = model?.parameters;
  const subsetTime = model?.metadata?.subsetTime;

  return useMemo(() => {
    if (!currentModelId) return null;
    return checkModel({
      locations,
      links,
      technologies,
      timeSeries: (timeSeries || []).filter((ts) => !ts.modelId || ts.modelId === currentModelId),
      modelConfig: modelConfig || {},
      parameters: parameters || [],
      subsetTime,
    });
  }, [locations, links, technologies, timeSeries, currentModelId, modelConfig, parameters, subsetTime]);
}

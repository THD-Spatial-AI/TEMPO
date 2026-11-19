import { useData } from '../context/DataContext';

// The model a run used: by id when the run recorded it, else by its display name
// ("Model (version 2)", "Model — scenario").
export default function useRunModel(job) {
  const { models } = useData();
  const base = String(job?.modelName || '').replace(/ \(version \d+\)$/, '').split(' — ')[0];
  return (job?.modelId && models.find((m) => m.id === job.modelId)) || models.find((m) => m.name === base) || null;
}

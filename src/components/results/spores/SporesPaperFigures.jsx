// The one-ensemble figures of Lombardi et al. (2020): Figs 1, 3, 4 and 5 (S1 / S2 at 5 % and 20 %),
// for any SPORES result (configuration from services/sporesAutoMetrics.js).
import { useMemo } from 'react';
import { sporeMetrics } from '../../../services/sporesAnalysis';
import { figureMetrics } from '../../../services/sporesAutoMetrics';
import Fig1Potentials from './Fig1Potentials';
import Fig3Correlation from './Fig3Correlation';
import Fig4Configurations from './Fig4Configurations';
import Fig5Problematic from './Fig5Problematic';

export default function SporesPaperFigures({ result, modelLocations }) {
  const meta = useMemo(() => result.spores_meta || {}, [result]);
  const spores = result.spores_data;
  const metrics = useMemo(() => figureMetrics(result, { locations: modelLocations }), [result, modelLocations]);
  const rows = useMemo(() => spores.map(s => sporeMetrics(s, meta, metrics, spores[0])), [spores, meta, metrics]);
  const slackFrac = meta.plan?.slack ?? spores.find(s => s.slack != null)?.slack;
  const slack = slackFrac != null ? Math.round(slackFrac * 100) : null;
  const props = { spores, meta, metrics, rows, slack };
  return (
    <div className="space-y-4">
      <Fig1Potentials spore={spores[0]} meta={meta} metrics={metrics} />
      {metrics.fig3Groups?.length > 0 && <Fig3Correlation {...props} />}
      <Fig4Configurations {...props} />
      <Fig5Problematic {...props} />
    </div>
  );
}

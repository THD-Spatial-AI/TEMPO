// ShadowTab — extracted from Results.jsx (was an inline IIFE tab).
// Owns its result-derived computation and renders the tab.
import ReactECharts from 'echarts-for-react';

export default function ShadowTab({
  result,
  setShadowPriceKey,
  shadowPriceKey,
}) {
              const sp = result.shadow_prices;
              const keys = Object.keys(sp).sort();
              const timestamps = result.timestamps || [];
              const spKey = (shadowPriceKey && keys.includes(shadowPriceKey)) ? shadowPriceKey : keys[0];
              const series = sp[spKey] || [];

              const chartOption = {
                backgroundColor: 'transparent',
                tooltip: { trigger: 'axis', formatter: (p) => `${p[0].axisValue}<br/>${p[0].seriesName}: ${p[0].value?.toFixed(4) ?? '—'}` },
                grid: { top: 16, right: 20, bottom: 60, left: 70 },
                xAxis: { type: 'category', data: timestamps, axisLabel: { fontSize: 9, rotate: 30, formatter: v => String(v).slice(5, 16) } },
                yAxis: { type: 'value', name: 'Shadow price (€/MWh)', nameTextStyle: { fontSize: 10 } },
                series: [{
                  name: spKey,
                  type: 'line',
                  data: series,
                  lineStyle: { width: 1.5, color: '#6366f1' },
                  areaStyle: { color: 'rgba(99,102,241,0.08)' },
                  showSymbol: false,
                }],
              };

              // Summary stats
              const vals = series.filter(v => v != null);
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
              const mn = vals.length ? Math.min(...vals) : null;
              const mx = vals.length ? Math.max(...vals) : null;

              return (
                <div className="space-y-4">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-700">
                    Shadow prices are the dual variables of the system energy balance constraints — they represent the marginal cost of supplying one additional unit of energy at each node and timestep. Only available for Calliope 0.7 (HiGHS solver).
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                      <span className="text-sm font-semibold text-slate-700">Carrier : Node</span>
                      <select value={spKey} onChange={e => setShadowPriceKey(e.target.value)}
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                        {keys.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                      {avg != null && (
                        <div className="ml-auto flex gap-4 text-xs text-slate-500">
                          <span>Avg: <strong className="text-slate-800">{avg.toFixed(4)}</strong></span>
                          <span>Min: <strong className="text-slate-800">{mn?.toFixed(4)}</strong></span>
                          <span>Max: <strong className="text-slate-800">{mx?.toFixed(4)}</strong></span>
                        </div>
                      )}
                    </div>
                    <ReactECharts option={chartOption} style={{ height: 300 }} notMerge />
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-x-auto">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Summary — all carrier:node pairs</h3>
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-2 pr-4 text-slate-500 font-medium">Carrier : Node</th>
                          <th className="py-2 px-3 text-right text-slate-500 font-medium">Mean (€/MWh)</th>
                          <th className="py-2 px-3 text-right text-slate-500 font-medium">Min</th>
                          <th className="py-2 px-3 text-right text-slate-500 font-medium">Max</th>
                          <th className="py-2 pl-3 text-right text-slate-500 font-medium">Non-zero %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keys.map((k, i) => {
                          const v = (sp[k] || []).filter(x => x != null);
                          const mean = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
                          const min_ = v.length ? Math.min(...v) : null;
                          const max_ = v.length ? Math.max(...v) : null;
                          const nzPct = v.length ? (v.filter(x => Math.abs(x) > 1e-6).length / v.length * 100) : 0;
                          return (
                            <tr key={k} className={i % 2 === 0 ? 'border-b border-slate-50' : 'border-b border-slate-50 bg-slate-50/60'}>
                              <td className="py-2 pr-4 font-medium text-indigo-700 font-mono">{k}</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-600">{mean?.toFixed(4) ?? '—'}</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-600">{min_?.toFixed(4) ?? '—'}</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-600">{max_?.toFixed(4) ?? '—'}</td>
                              <td className="py-2 pl-3 text-right font-mono text-slate-500">{nzPct.toFixed(0)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
}

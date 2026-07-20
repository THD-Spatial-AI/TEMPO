// DataTablePanel — preview table + config editor for a data_table time series.
// Extracted from TimeSeries.jsx (was an inner component recreated each render).
export default function DataTablePanel({ ts, updateDataTableConfig, addDim }) {
    const cfg = ts.dataTableConfig || { rows: ts.columns?.[0] || '', columns: '', add_dims: {} };
    const previewRows = (ts.data || []).slice(0, 8);
    const cols = ts.columns || [];
    const dimEntries = Object.entries(cfg.add_dims || {});

    return (
      <div className="h-full flex flex-col overflow-auto p-4 gap-4">
        {/* Config editor */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-indigo-800 mb-3">Calliope 0.7 data_tables configuration</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-indigo-700 mb-1">rows (row index dimension)</label>
              <input type="text" value={cfg.rows || ''} placeholder="e.g. nodes or timesteps"
                onChange={e => updateDataTableConfig(ts.id, { rows: e.target.value })}
                className="w-full px-2 py-1.5 text-xs border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-indigo-700 mb-1">columns (column header dimension)</label>
              <input type="text" value={cfg.columns || ''} placeholder="e.g. techs (leave blank if none)"
                onChange={e => updateDataTableConfig(ts.id, { columns: e.target.value })}
                className="w-full px-2 py-1.5 text-xs border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs font-medium text-indigo-700">add_dims (fixed dimension values to inject)</label>
              <button type="button" onClick={() => addDim(ts.id)}
                className="px-2 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 rounded-full hover:bg-indigo-200">+ add</button>
            </div>
            {dimEntries.map(([k, v], i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <input type="text" value={k} placeholder="key (e.g. parameters)"
                  onChange={e => {
                    const ad = { ...cfg.add_dims };
                    delete ad[k]; ad[e.target.value] = v;
                    updateDataTableConfig(ts.id, { add_dims: ad });
                  }}
                  className="w-1/3 px-2 py-1 text-xs border border-indigo-200 rounded-lg bg-white font-mono focus:outline-none" />
                <span className="text-indigo-400">:</span>
                <input type="text" value={v} placeholder="value (e.g. flow_eff)"
                  onChange={e => {
                    const ad = { ...cfg.add_dims, [k]: e.target.value };
                    updateDataTableConfig(ts.id, { add_dims: ad });
                  }}
                  className="flex-1 px-2 py-1 text-xs border border-indigo-200 rounded-lg bg-white font-mono focus:outline-none" />
                <button type="button" onClick={() => {
                  const ad = { ...cfg.add_dims }; delete ad[k];
                  updateDataTableConfig(ts.id, { add_dims: ad });
                }} className="text-indigo-400 hover:text-red-500 text-xs">&times;</button>
              </div>
            ))}
            {dimEntries.length === 0 && <p className="text-xs text-indigo-400 italic">No fixed dimensions — add one above</p>}
          </div>
        </div>

        {/* Table preview */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <div className="px-4 py-2 border-b border-slate-100 text-xs font-semibold text-slate-600">
            Preview — first {previewRows.length} rows of {ts.rowCount}
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50">
                {cols.map(c => <th key={c} className="px-3 py-2 text-left text-slate-500 font-medium border-b border-slate-100 whitespace-nowrap">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'border-b border-slate-50' : 'border-b border-slate-50 bg-slate-50/40'}>
                  {cols.map(c => <td key={c} className="px-3 py-1.5 text-slate-600 font-mono whitespace-nowrap">{row[c] ?? ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
}

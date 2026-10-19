// Filter / resolution / columns / stats sidebar for the TimeSeries chart view.
// All view state is passed as props.
import { FiChevronDown, FiChevronUp, FiCalendar, FiList, FiSearch, FiCheck, FiClock } from '../ui/icons';
import { tr } from '../../i18n';

// ECharts 6 default palette, in series order, so swatches match the chart lines.
const ECHARTS_COLORS = ['#5070dd', '#b6d634', '#505372', '#ff994d', '#0ca8df', '#ffd10a', '#fb628b', '#785db0', '#3fbe95'];
const fmtFull = (v) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—');

const RANGES = [['weeks2', tr("First 2 weeks")], ['month', tr("Month")], ['seasonal', tr("Season")], ['custom', tr("Custom")]];
const RESOLUTIONS = [['hourly', tr("Hourly")], ['daily', tr("Daily")], ['weekly', tr("Weekly")]];
const MONTHS = [tr("Jan"), tr("Feb"), tr("Mar"), tr("Apr"), tr("May"), tr("Jun"), tr("Jul"), tr("Aug"), tr("Sep"), tr("Oct"), tr("Nov"), tr("Dec")];
const SEASONS = [['DJF', tr("Winter")], ['MAM', tr("Spring")], ['JJA', tr("Summer")], ['SON', tr("Autumn")]];

function SectionTitle({ icon: Icon, children, extra }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {Icon && <Icon size={13} className="text-slate-400" />}
        {children}
      </span>
      {extra}
    </div>
  );
}

function Segmented({ items, value, onChange, cols = 2 }) {
  return (
    <div className="grid gap-1 bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.map(([id, label, hint]) => (
        <button key={id} onClick={() => onChange(id)}
          className={`px-2 py-1.5 text-[12px] font-medium leading-tight transition-colors ${value === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
          {label}{hint && <span className="ml-1 text-[10px] text-slate-400">{hint}</span>}
        </button>
      ))}
    </div>
  );
}

// Average into ~120 buckets so a full year reads as a shape, not a solid block.
function sparkPath(values, buckets = 120) {
  const step = Math.max(1, Math.floor(values.length / buckets));
  const pts = [];
  for (let i = 0; i < values.length; i += step) {
    const slice = values.slice(i, i + step);
    pts.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const xy = pts.map((v, i) => [(i / Math.max(pts.length - 1, 1)) * 100, 92 - ((v - min) / range) * 80]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return { line, area: `${line} L100,100 L0,100 Z` };
}

export default function TimeSeriesFilterSidebar({
  colSearch,
  getDataColumns,
  selectedColumns,
  selectedTimeSeries,
  setColSearch,
  setSelectedColumns,
  setShowStats,
  setViewCustomEnd,
  setViewCustomStart,
  setViewMode,
  setViewMonth,
  setViewResolution,
  setViewSeason,
  showStats,
  toggleColumn,
  viewCustomEnd,
  viewCustomStart,
  viewMode,
  viewMonth,
  viewResolution,
  viewSeason,
}) {
  const allCols = getDataColumns(selectedTimeSeries);
  const colorOf = (col) => {
    const i = selectedColumns.indexOf(col);
    return i < 0 ? '#cbd5e1' : ECHARTS_COLORS[i % ECHARTS_COLORS.length];
  };
  const visibleCols = allCols.filter((c) => !colSearch || c.toLowerCase().includes(colSearch.toLowerCase()));
  const inputCls = 'h-8 w-full border border-black/15 bg-white px-2 text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none';

  return (
    <div className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-black/15 bg-white">
      <div className="space-y-5 p-4">

        {/* Range */}
        <section>
          <SectionTitle icon={FiCalendar}>{tr("Range")}</SectionTitle>
          <Segmented items={RANGES} value={viewMode} onChange={setViewMode} />
          {viewMode === 'month' && (
            <div className="mt-2 grid grid-cols-4 gap-1">
              {MONTHS.map((m, i) => (
                <button key={m} onClick={() => setViewMonth(i)}
                  className={`py-1 text-[11px] font-medium transition-colors ${viewMonth === i ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                  {m}
                </button>
              ))}
            </div>
          )}
          {viewMode === 'seasonal' && (
            <div className="mt-2">
              <Segmented items={SEASONS.map(([id, l]) => [id, l])} value={viewSeason} onChange={setViewSeason} />
            </div>
          )}
          {viewMode === 'custom' && (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-0.5 block text-[10px] text-slate-400">{tr("From")}</span>
                  <input type="date" value={viewCustomStart} onChange={(e) => setViewCustomStart(e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[10px] text-slate-400">{tr("To")}</span>
                  <input type="date" value={viewCustomEnd} onChange={(e) => setViewCustomEnd(e.target.value)} className={inputCls} />
                </label>
              </div>
              {viewCustomStart && viewCustomEnd && (
                <p className="text-center text-[11px] text-slate-500">
                  {Math.max(0, Math.round((new Date(viewCustomEnd) - new Date(viewCustomStart)) / 86400000))} {tr("days selected")}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Resolution */}
        <section>
          <SectionTitle icon={FiClock}>{tr("Resolution")}</SectionTitle>
          <Segmented items={RESOLUTIONS} value={viewResolution} onChange={setViewResolution} cols={3} />
        </section>

        {/* Columns */}
        <section>
          <SectionTitle
            icon={FiList}
            extra={
              <span className="flex items-center gap-2 text-[11px]">
                <span className="tabular-nums text-slate-400">{selectedColumns.length}/{allCols.length}</span>
                <button onClick={() => setSelectedColumns(allCols)} className="font-medium text-slate-600 hover:text-slate-900">{tr("All")}</button>
                <button onClick={() => setSelectedColumns([])} className="font-medium text-slate-400 hover:text-slate-900">{tr("None")}</button>
              </span>
            }
          >
            {tr("Columns")}
          </SectionTitle>
          <div className="relative mb-2">
            <FiSearch size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder={tr("Search columns…")} value={colSearch} onChange={(e) => setColSearch(e.target.value)} className={`${inputCls} pl-8`} />
          </div>
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {visibleCols.map((col) => {
              const on = selectedColumns.includes(col);
              const color = colorOf(col);
              return (
                <button key={col} title={col} onClick={() => toggleColumn(col)}
                  className={`flex w-full items-center gap-2.5 px-2 py-1.5 text-left text-[12px] transition-colors ${on ? 'bg-slate-50 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                  <span className="grid h-4 w-4 shrink-0 place-items-center border" style={on ? { background: color, borderColor: color } : { borderColor: '#cbd5e1' }}>
                    {on && <FiCheck size={11} className="text-white" />}
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${on ? 'font-medium' : ''}`}>{col}</span>
                  {on && <span className="h-0.5 w-4 shrink-0" style={{ background: color }} />}
                </button>
              );
            })}
            {visibleCols.length === 0 && <p className="px-2 py-3 text-center text-[11px] text-slate-400">{tr("No columns match")}</p>}
          </div>
        </section>

        {/* Statistics */}
        <section>
          <button className="w-full" onClick={() => setShowStats(!showStats)}>
            <SectionTitle extra={showStats ? <FiChevronUp size={13} className="text-slate-400" /> : <FiChevronDown size={13} className="text-slate-400" />}>
              {tr("Statistics")}
            </SectionTitle>
          </button>
          {showStats && selectedTimeSeries.statistics && (
            <div className="space-y-2">
              {Object.entries(selectedTimeSeries.statistics)
                .filter(([col]) => selectedColumns.includes(col))
                .map(([col, stats]) => {
                  const colData = selectedTimeSeries.data.map((row) => parseFloat(row[col])).filter((v) => !isNaN(v));
                  if (!colData.length) return null;
                  const color = colorOf(col);
                  const { line, area } = sparkPath(colData);
                  return (
                    <div key={col} className="border border-black/10 bg-white p-2.5">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="truncate text-[12px] font-semibold text-slate-800" title={col}>{col}</span>
                        <span className="ml-auto text-[10px] tabular-nums text-slate-400">{colData.length} {tr("pts")}</span>
                      </div>
                      <svg className="mb-2 h-9 w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <path d={area} fill={color} opacity="0.12" />
                        <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
                      </svg>
                      <div className="grid grid-cols-3 gap-1 text-center">
                        {[[tr("Min"), stats.min], [tr("Max"), stats.max], [tr("Avg"), stats.mean]].map(([k, v]) => (
                          <div key={k} className="bg-slate-50 px-1 py-1">
                            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{k}</div>
                            <div className="truncate text-[11px] font-semibold tabular-nums text-slate-800" title={String(v)}>{fmtFull(v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

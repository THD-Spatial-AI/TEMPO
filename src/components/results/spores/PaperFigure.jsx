// PaperFigure — frame shared by the SPORES figures of Lombardi et al. (2020): title, a caption that
// states TEMPO's definitions, and PNG (pixel ratio 3) / SVG / CSV export of the plotted data.
// Panels inside register their exporters (EChartsPanel, SvgPanel, SporesMarkerMap).
import { useCallback, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { FiDownload } from '../../ui/icons';
import {
  PANEL_ATTR, registerPanel, echartsExporter, serializeSvg, svgToPng,
  figureToPng, figureToSvg, downloadUrl, downloadText, svgToDataUrl,
} from '../../../utils/figureExport';

const btn = 'flex items-center gap-1 text-xs text-electric-600 hover:underline disabled:opacity-40';

/**
 * @param label   'Figure 2', 'Table 1', … ('after Lombardi et al. 2020' is appended)
 * @param csv     () => ({ name, text }) — the plotted data
 * @param file    base name of the exported files
 * @param noImage tables: CSV only
 */
export default function PaperFigure({ label, title, caption, csv, file, noImage = false, controls, children }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const run = (fn) => async () => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  const png = run(async () => downloadUrl(`${file}.png`, await figureToPng(ref.current, 3)));
  const svg = run(async () => downloadUrl(`${file}.svg`, svgToDataUrl(await figureToSvg(ref.current))));
  const data = () => { const c = csv(); downloadText(c.name, c.text, 'text/csv'); };

  return (
    <div className="bg-white rounded-2xl border border-black/15 shadow-sm p-5">
      <div className="flex items-start gap-3 mb-1 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-700">
          {label} <span className="font-normal text-slate-400">(after Lombardi et al. 2020)</span>{title ? ` — ${title}` : ''}
        </h3>
        <div className="ml-auto flex items-center gap-3">
          {controls}
          {!noImage && <button disabled={busy} onClick={png} className={btn}><FiDownload size={12} /> PNG</button>}
          {!noImage && <button disabled={busy} onClick={svg} className={btn}><FiDownload size={12} /> SVG</button>}
          {csv && <button onClick={data} className={btn}><FiDownload size={12} /> CSV</button>}
        </div>
      </div>
      {caption && <p className="text-xs text-slate-500 mb-3 leading-relaxed">{caption}</p>}
      <div ref={ref} className="bg-white">{children}</div>
    </div>
  );
}

/** An ECharts chart that exports with its figure. */
export function EChartsPanel({ option, style, ...rest }) {
  const chart = useRef(null);
  const reg = useCallback((el) => registerPanel(echartsExporter(() => chart.current?.getEchartsInstance()))(el), []);
  return (
    <div {...{ [PANEL_ATTR]: '' }} ref={reg}>
      <ReactECharts ref={chart} option={option} style={style} notMerge {...rest} />
    </div>
  );
}

/** A plain <svg> drawing that exports as vector. */
export function SvgPanel({ children, className }) {
  const reg = useCallback((el) => registerPanel({
    svg: async () => serializeSvg(el.querySelector('svg')),
    png: async (scale = 3) => {
      const s = el.querySelector('svg');
      const { width, height } = s.getBoundingClientRect();
      return svgToPng(serializeSvg(s), width, height, scale);
    },
  })(el), []);
  // fit-content + start: the panel box is exactly the drawing (grids would stretch it, distorting the export)
  return <div className={className} style={{ width: 'fit-content', maxWidth: '100%', alignSelf: 'start', lineHeight: 0 }} {...{ [PANEL_ATTR]: '' }} ref={reg}>{children}</div>;
}

/** Text drawn into exports (panel letters, row headings). */
export function FigText({ className, children }) {
  return <span data-figure-text="" className={className}>{children}</span>;
}

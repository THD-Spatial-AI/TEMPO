// Attribution strip for maps whose built-in control is disabled.
import { ORG_CREDIT, BASEMAP_CREDITS } from '../../config/attribution';

export default function MapAttribution({ styleKey = 'streets', className = '' }) {
  const credits = [{ text: ORG_CREDIT, href: 'https://www.th-deg.de' }, ...(BASEMAP_CREDITS[styleKey] || BASEMAP_CREDITS.streets)];
  return (
    <div className={`pointer-events-auto absolute bottom-0 right-0 z-[650] max-w-[70%] truncate bg-white/85 px-2 py-0.5 text-[10.5px] text-slate-600 backdrop-blur-sm ${className}`}
      title={credits.map((c) => c.text).join(' | ')}>
      {credits.map((c, i) => (
        <span key={c.text}>
          {i > 0 && <span className="px-1 text-slate-400">|</span>}
          {c.href
            ? <a href={c.href} target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 hover:underline">{c.text}</a>
            : c.text}
        </span>
      ))}
    </div>
  );
}

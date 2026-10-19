// Tabbed, auto-cycling showcase of the drawing-mode illustrations.
import { useEffect, useState } from 'react';
import ModeIllustration from './ModeIllustration';
import ScenarioIllustration from '../scenarioStudio/ScenarioIllustration';
import { FiActivity, FiLink, FiMapPin, FiLayers, FiPlus, FiCalendar, FiPlay } from '../ui/icons';
import { tr } from '../../i18n';

const SHOWCASE = {
  location: {
    label: tr("Location"), icon: FiMapPin, seconds: 4,
    text: tr("A node of your energy system: a city, region, power plant or substation. Technologies are assigned to locations."),
    how: tr("Click the map to drop one."),
  },
  link: {
    label: tr("Link"), icon: FiLink, seconds: 4.5,
    text: tr("A transmission connection between two locations, e.g. a power line or pipeline. The link type sets its technology."),
    how: tr("Click a first location, then a second."),
  },
  polyline: {
    label: tr("Polyline"), icon: FiActivity, seconds: 5,
    text: tr("Draws a route quickly: every click adds a point and links it to the previous one."),
    how: tr("Click repeatedly; switch mode to finish."),
  },
  model: {
    label: tr("Full model"), icon: FiLayers, seconds: 7.5,
    text: tr("Place locations, connect them with links, add technologies such as solar, wind or storage, then save the model."),
    how: tr("Save appears bottom-right once a location exists."),
  },
  'scn-add': {
    label: tr("Add card"), icon: FiPlus, seconds: 5,
    text: tr("Config cards change the base model: demand, emissions, renewables, technologies, locations and more."),
    how: tr("Click “+ Add card” (or right-click the canvas) and pick a category."),
  },
  'scn-nest': {
    label: tr("Year"), icon: FiCalendar, seconds: 5,
    text: tr("Drop a card into a Year box to apply it to that year only. Cards left on the canvas apply to every year."),
    how: tr("Drag the card into the year, or use “+ Card” on the year."),
  },
  'scn-link': {
    label: tr("Chain"), icon: FiLink, seconds: 5,
    text: tr("Link years into a timeline so each year follows on from the previous one."),
    how: tr("Drag from a year’s right dot to the next year’s left dot."),
  },
  'scn-run': {
    label: tr("Run"), icon: FiPlay, seconds: 8,
    text: tr("Every year becomes one run. Parallel solves them all at once; Sequential solves them one after another."),
    how: tr("Choose the mode in the bottom bar, then Run scenario."),
  },
};

export default function ModeShowcase({ modes = ['location', 'link', 'polyline', 'model'], initial, autoPlay = true, compact = false }) {
  const [mode, setMode] = useState(initial || modes[0]);
  const [playing, setPlaying] = useState(autoPlay);
  const info = SHOWCASE[mode];

  useEffect(() => {
    if (!playing || modes.length < 2) return undefined;
    const t = setTimeout(() => setMode((m) => modes[(modes.indexOf(m) + 1) % modes.length]), info.seconds * 2 * 1000);
    return () => clearTimeout(t);
  }, [mode, playing, modes, info.seconds]);

  return (
    <div>
      {modes.length > 1 && (
        <div className="flex gap-0.5 bg-slate-100 p-0.5">
          {modes.map((m) => {
            const Icon = SHOWCASE[m].icon;
            return (
              <button key={m} onClick={() => { setMode(m); setPlaying(false); }}
                className={`flex flex-1 items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${
                  mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}>
                <Icon size={13} />{SHOWCASE[m].label}
              </button>
            );
          })}
        </div>
      )}
      <div className="relative mt-2 overflow-hidden border border-black/10">
        {mode.startsWith('scn-') ? <ScenarioIllustration mode={mode} /> : <ModeIllustration mode={mode} />}
        {playing && modes.length > 1 && (
          <span key={mode} className="tempo-showcase-progress absolute bottom-0 left-0 h-0.5 bg-slate-900" style={{ animationDuration: `${info.seconds * 2}s` }} />
        )}
      </div>
      {!compact && (
        <div className="mt-2.5">
          <p className="text-[12px] leading-snug text-slate-600">{info.text}</p>
          <p className="mt-1 text-[12px] font-medium text-slate-900">{info.how}</p>
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from 'react'

// Tabbed gallery of app screenshots. Tabs follow the WAI-ARIA pattern:
// arrow keys move between tabs, Home/End jump to the ends.
export default function AppScreens({ screens }) {
  const [active, setActive] = useState(0)
  const tabs = useRef([])

  const select = (i) => {
    const next = (i + screens.length) % screens.length
    setActive(next)
    tabs.current[next]?.focus()
  }

  const onKeyDown = (e) => {
    const keys = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: screens.length - 1 }
    if (e.key in keys) {
      e.preventDefault()
      select(keys[e.key])
    }
  }

  const screen = screens[active]

  return (
    <div>
      <div
        role="tablist"
        aria-label="TEMPO screens"
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-px bg-neutral-200 border border-neutral-200"
      >
        {screens.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => (tabs.current[i] = el)}
            role="tab"
            id={`screen-tab-${s.id}`}
            aria-selected={i === active}
            aria-controls={`screen-panel-${s.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={`flex-1 min-w-[8.5rem] min-h-[44px] px-4 py-3 text-[11px] font-bold uppercase tracking-widest transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 ${
              i === active
                ? 'bg-black text-white focus-visible:outline-white'
                : 'bg-white text-neutral-600 hover:text-black focus-visible:outline-black'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`screen-panel-${screen.id}`}
        aria-labelledby={`screen-tab-${screen.id}`}
        className="border-x border-b border-neutral-200 bg-white"
      >
        <img
          src={screen.img}
          alt={screen.alt}
          width="1600"
          height="1000"
          className="block w-full h-auto border-b border-neutral-200"
        />
        <p className="px-6 py-5 text-[0.875rem] text-neutral-600 leading-relaxed max-w-3xl">
          {screen.caption}
        </p>
      </div>
    </div>
  )
}

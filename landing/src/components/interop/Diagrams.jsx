import { motion, useReducedMotion } from 'framer-motion'

export const SRC = 'https://github.com/THD-Spatial-AI/TEMPO/blob/main/'

// Connectors draw themselves once when the diagram scrolls into view, so the eye
// follows the direction of each translation. Skipped under prefers-reduced-motion.
function Line({ d, dashed = false, delay = 0, marker }) {
  const reduce = useReducedMotion()
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="#000"
      strokeWidth={1.5}
      strokeDasharray={dashed ? '6 5' : undefined}
      markerEnd={`url(#${marker})`}
      // pathLength drives stroke-dasharray, so dashed lines fade in instead of drawing
      initial={reduce ? false : dashed ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
      whileInView={dashed ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.7, delay, ease: 'easeOut' }}
    />
  )
}

function ArrowDefs({ id }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="#000" />
      </marker>
    </defs>
  )
}

function Box({ x, y, w = 200, h = 80, title, sub, dark = false }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={dark ? '#000' : '#fff'} stroke="#000" strokeWidth={1.5} />
      <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" fontSize="17" fontWeight="800" fill={dark ? '#fff' : '#000'}>
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 18} textAnchor="middle" fontSize="12.5" fill={dark ? '#d4d4d4' : '#474747'}>
          {sub}
        </text>
      )}
    </g>
  )
}

const ENGINES = [
  { name: 'Calliope 0.6.8', files: 'YAML + CSV' },
  { name: 'Calliope 0.7', files: 'YAML + data tables' },
  { name: 'PyPSA', files: 'netCDF or CSV folder' },
  { name: 'OSeMOSYS', files: 'otoole CSV' },
  { name: 'AdOpT-NET0', files: 'case folder (JSON + CSV)' },
]

export function HubDiagram() {
  return (
    <figure>
      <svg
        viewBox="0 0 1000 600"
        className="hidden md:block w-full h-auto font-inter"
        role="img"
        aria-label="Hub and spoke: five engines connect only to the TEMPO internal model, each with a translate arrow out and an import arrow in."
      >
        <ArrowDefs id="arr-hub" />
        {/* legend */}
        <line x1="330" y1="30" x2="380" y2="30" stroke="#000" strokeWidth="1.5" markerEnd="url(#arr-hub)" />
        <text x="390" y="35" fontSize="13" fill="#000">translate (write engine files)</text>
        <line x1="580" y1="30" x2="630" y2="30" stroke="#000" strokeWidth="1.5" strokeDasharray="6 5" markerEnd="url(#arr-hub)" />
        <text x="640" y="35" fontSize="13" fill="#000">import (read engine files)</text>

        <Box x={380} y={220} w={240} h={120} dark title="TEMPO INTERNAL MODEL" sub="Calliope 0.6 vocabulary" />

        <Box x={40} y={80} title={ENGINES[0].name} sub={ENGINES[0].files} />
        <Box x={40} y={400} title={ENGINES[1].name} sub={ENGINES[1].files} />
        <Box x={760} y={80} title={ENGINES[2].name} sub={ENGINES[2].files} />
        <Box x={760} y={400} title={ENGINES[3].name} sub={ENGINES[3].files} />
        <Box x={400} y={490} title={ENGINES[4].name} sub={ENGINES[4].files} />

        <Line d="M380,250 L244,133" delay={0} marker="arr-hub" />
        <Line d="M240,150 L376,262" dashed delay={0.1} marker="arr-hub" />
        <Line d="M380,310 L244,427" delay={0.2} marker="arr-hub" />
        <Line d="M240,450 L376,322" dashed delay={0.3} marker="arr-hub" />
        <Line d="M620,250 L756,133" delay={0.4} marker="arr-hub" />
        <Line d="M760,150 L624,262" dashed delay={0.5} marker="arr-hub" />
        <Line d="M620,310 L756,427" delay={0.6} marker="arr-hub" />
        <Line d="M760,450 L624,322" dashed delay={0.7} marker="arr-hub" />
        <Line d="M485,340 L485,486" delay={0.8} marker="arr-hub" />
        <Line d="M515,490 L515,344" dashed delay={0.9} marker="arr-hub" />
      </svg>

      {/* Phone layout: the same relationships as a list, readable at 360px */}
      <div className="md:hidden">
        <div className="bg-black text-white p-5 text-center">
          <p className="font-black uppercase tracking-tight">TEMPO internal model</p>
          <p className="text-[13px] text-neutral-300">Calliope 0.6 vocabulary</p>
        </div>
        <ul className="border-x border-b border-black divide-y divide-black/15">
          {ENGINES.map((e) => (
            <li key={e.name} className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-bold text-[15px]">{e.name}</p>
                <p className="text-[13px] text-on-surface-variant">{e.files}</p>
              </div>
              <span className="text-[12px] text-right text-on-surface-variant leading-tight">
                translate out<br />import in
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="sr-only">Every engine talks only to the internal model, never to another engine.</figcaption>
    </figure>
  )
}

export function RoundTripDiagram() {
  return (
    <figure>
      <svg
        viewBox="0 0 1000 250"
        className="hidden md:block w-full h-auto"
        role="img"
        aria-label="Converting a PyPSA network to OSeMOSYS: the network is imported into the internal model, then OSeMOSYS files are written from it. There is no direct converter."
      >
        <ArrowDefs id="arr-trip" />
        <Box x={20} y={130} w={210} title="PyPSA network" sub="network.nc" />
        <Box x={395} y={130} w={210} dark title="INTERNAL MODEL" sub="+ import report" />
        <Box x={770} y={130} w={210} title="OSeMOSYS dataset" sub="otoole CSV folder" />

        <Line d="M230,170 L391,170" dashed delay={0} marker="arr-trip" />
        <text x="312" y="160" textAnchor="middle" fontSize="12.5" fill="#000">network_to_internal()</text>
        <Line d="M605,170 L766,170" delay={0.3} marker="arr-trip" />
        <text x="687" y="160" textAnchor="middle" fontSize="12.5" fill="#000">translate_model()</text>

        <path d="M125,128 C125,40 875,40 875,128" fill="none" stroke="#777" strokeWidth="1.5" strokeDasharray="2 6" />
        <rect x="390" y="44" width="220" height="30" fill="#faf8ff" />
        <text x="500" y="64" textAnchor="middle" fontSize="13" fill="#474747">no direct converter exists</text>
      </svg>

      <ol className="md:hidden border border-black divide-y divide-black/15">
        <li className="px-5 py-4"><p className="font-bold">PyPSA network</p><p className="text-[13px] text-on-surface-variant">network.nc</p></li>
        <li className="px-5 py-2 text-[13px] font-mono">network_to_internal()</li>
        <li className="px-5 py-4 bg-black text-white"><p className="font-bold">Internal model</p><p className="text-[13px] text-neutral-300">+ import report</p></li>
        <li className="px-5 py-2 text-[13px] font-mono">translate_model()</li>
        <li className="px-5 py-4"><p className="font-bold">OSeMOSYS dataset</p><p className="text-[13px] text-on-surface-variant">otoole CSV folder</p></li>
      </ol>
    </figure>
  )
}

const PARITY_ENGINES = ['Calliope 0.6.8', 'Calliope 0.7', 'PyPSA', 'OSeMOSYS', 'AdOpT-NET0']

export function ParityDiagram() {
  const ys = [20, 80, 140, 200, 260]
  return (
    <figure>
      <svg
        viewBox="0 0 1000 330"
        className="hidden md:block w-full h-auto"
        role="img"
        aria-label="Parity check: each reference model runs on all five engines; every result is compared with the Calliope baseline within a per-engine tolerance."
      >
        <ArrowDefs id="arr-parity" />
        <Box x={20} y={125} w={220} title="Reference models" sub="reference_model*.json" />
        {PARITY_ENGINES.map((name, i) => (
          <g key={name}>
            <rect x={400} y={ys[i]} width={200} height={46} fill={i === 0 ? '#000' : '#fff'} stroke="#000" strokeWidth={1.5} />
            <text x={500} y={ys[i] + 29} textAnchor="middle" fontSize="15" fontWeight="700" fill={i === 0 ? '#fff' : '#000'}>
              {name}
            </text>
            <Line d={`M240,165 L396,${ys[i] + 23}`} delay={i * 0.08} marker="arr-parity" />
            <Line d={`M600,${ys[i] + 23} L756,165`} delay={0.5 + i * 0.08} marker="arr-parity" />
          </g>
        ))}
        <Box x={760} y={115} w={220} h={100} title="Compare" sub="against the Calliope baseline" />
        <text x="500" y="325" textAnchor="middle" fontSize="12.5" fill="#474747">
          baseline: Calliope 0.6.8 (black), or 0.7 when 0.6.8 is not installed
        </text>
      </svg>

      <ol className="md:hidden border border-black divide-y divide-black/15 text-[14px]">
        <li className="px-5 py-4"><span className="font-bold">1.</span> Reference models (reference_model*.json)</li>
        <li className="px-5 py-4"><span className="font-bold">2.</span> Solved on each installed engine: {PARITY_ENGINES.join(', ')}</li>
        <li className="px-5 py-4"><span className="font-bold">3.</span> Each result compared with the Calliope 0.6.8 baseline (0.7 if 0.6.8 is missing)</li>
      </ol>
    </figure>
  )
}

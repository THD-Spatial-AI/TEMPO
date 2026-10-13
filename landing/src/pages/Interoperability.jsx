import Footer from '../components/Footer'
import { HubDiagram, RoundTripDiagram, ParityDiagram, SRC } from '../components/interop/Diagrams'
import ParameterExplorer from '../components/interop/ParameterExplorer'

const ENGINE_COLS = ['Calliope 0.6.8', 'Calliope 0.7', 'PyPSA', 'OSeMOSYS', 'AdOpT-NET0']

// Small black square: the hub, repeated as the section marker on this page.
function SectionMark({ n, label, light = false }) {
  return (
    <p className={`flex items-center gap-3 text-[13px] font-bold mb-6 ${light ? 'text-white' : 'text-black'}`}>
      <span className={`inline-block w-3 h-3 ${light ? 'bg-white' : 'bg-black'}`} aria-hidden="true" />
      {n} · {label}
    </p>
  )
}

function Src({ path, children, light = false }) {
  return (
    <a
      href={SRC + path}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-mono text-[13px] underline underline-offset-2 break-all ${light ? 'text-white' : 'text-black'}`}
    >
      {children || path}
    </a>
  )
}

const PIPELINE = [
  {
    title: 'Internal model',
    text: 'Locations, links, technologies, time series, overrides and scenarios, as the app saves them.',
    path: 'src/context/DataContext.jsx',
  },
  {
    title: 'Scenario flattening',
    text: 'The chosen scenario or override is applied to a copy of the model. Only Calliope has an override system, so the other engines get a model with the values already in place. Calliope-only keys such as run.* are skipped.',
    path: 'src/services/scenarioResolver.js',
  },
  {
    title: 'Shared conventions',
    text: 'Annuity, merging a technology with its per-location settings, turning a resource series into a capacity factor, link distance. The PyPSA, OSeMOSYS and AdOpT-NET0 translators import these from one module, so a convention is changed once.',
    path: 'python/engine_common.py',
  },
  {
    title: 'Engine translator',
    text: 'Maps each technology parent onto the engine\'s own objects and converts units. Approximations are written to a translation report that is printed in the run log.',
    path: 'python/pypsa_translate.py',
    more: [['python/osemosys_translate.py'], ['python/adoptnet0_translate.py'], ['python/calliope07_translate.py']],
  },
  {
    title: 'Engine overlay',
    text: 'Values the user typed under engineParams for this engine replace the translated ones. A value set on a location beats one set on the technology.',
    path: 'python/engine_overlay.py',
  },
  {
    title: 'Solve',
    text: 'Each engine runs in its own Python environment behind the same HTTP routes: POST /run returns a job id, and the log streams back while the solver works.',
    path: 'python/engine_service_base.py',
  },
  {
    title: 'Result contract',
    text: 'Every runner returns the same JSON keys. The result views read only these keys and never ask which engine produced them.',
    path: 'python/pypsa_runner.py',
  },
]

const CONTRACT_KEYS = [
  'objective', 'termination_condition', 'capacities', 'generation', 'dispatch', 'timestamps',
  'transmission_flow', 'demand_timeseries', 'costs_by_tech', 'costs_by_location', 'tech_metadata', 'tech_parents',
]

const BATTERY = [
  {
    engine: 'Calliope 0.6.8',
    text: 'Written as stored. energy_eff applies on charge and again on discharge, so 0.95 gives a round trip of about 0.90.',
  },
  {
    engine: 'Calliope 0.7',
    text: 'base_tech: storage. energy_cap_max becomes flow_cap_max, energy_eff becomes flow_out_eff and also flow_in_eff, so the round trip stays the same. storage_loss keeps its name.',
  },
  {
    engine: 'PyPSA',
    text: 'A Store on its own bus, plus a charge Link and a discharge Link held to one capacity. The power cost sits on the discharge side. storage_loss becomes standing_loss.',
  },
  {
    engine: 'OSeMOSYS',
    text: 'For a run: a two-mode technology attached to an OSeMOSYS STORAGE. For export: a charge and a discharge technology joined by a virtual fuel. OSeMOSYS 2017 has no self-discharge, so storage_loss is not modelled yet. A patch to the model file is in progress.',
  },
  {
    engine: 'AdOpT-NET0',
    text: 'A STOR technology with eta_in = eta_out = energy_eff and lambda = storage_loss. The runner ties charge and discharge capacity together, as Calliope does.',
  },
]

const IMPORTS = [
  {
    format: 'Calliope 0.6 / 0.7',
    files: 'model.yaml or model.yml',
    by: 'In the app (JavaScript). The 0.7 path reads both the dev7 and the 0.7.0 data-table keys.',
    path: 'src/services/calliope07Format.js',
  },
  {
    format: 'PyPSA',
    files: '*.nc, or buses.csv',
    by: 'network_to_internal(). A bus becomes a location and a component carrier becomes a technology. Capital costs come back as annual-cost equivalents, because lifetime is not in the network.',
    path: 'python/pypsa_translate.py',
  },
  {
    format: 'OSeMOSYS',
    files: 'SpecifiedAnnualDemand.csv, YearSplit.csv, or TECHNOLOGY + REGION',
    by: 'osemosys_to_internal(). One region and the first year only. Coordinates are not in otoole data, so locations land at 0, 0.',
    path: 'python/osemosys_import.py',
  },
  {
    format: 'AdOpT-NET0',
    files: 'Topology.json + ConfigModel.json',
    by: 'adoptnet0_to_internal(). Nodes become locations. Storage fixed O&M returns folded into the power cost.',
    path: 'python/adoptnet0_translate.py',
  },
]

// state: n = native, m = mapped, a = approximated, x = not supported. p = in progress.
const FIDELITY = [
  {
    feature: 'Capacity expansion (plan mode)',
    cells: [['n'], ['m'], ['m'], ['m'], ['m']],
  },
  {
    feature: 'Hourly time steps',
    cells: [['n'], ['m'], ['m'], ['a', 'Hour-of-day timeslices'], ['m']],
  },
  {
    feature: 'Transmission links',
    cells: [['n'], ['m', 'link_from / link_to techs'], ['m', 'Two directed Links, one capacity'], ['m', 'Conversion techs between location fuels'], ['m', 'One network per link, run as LP']],
  },
  {
    feature: 'Storage self-discharge (storage_loss)',
    cells: [['n'], ['m'], ['m', 'standing_loss'], ['x', 'Patch to the model file', true], ['m', 'lambda']],
  },
  {
    feature: 'Storage C-rate (energy_cap_per_storage_cap_equals)',
    cells: [['n'], ['x', 'Only the _min / _max forms map'], ['x'], ['x'], ['x']],
  },
  {
    feature: 'Absolute resource series (resource_unit: energy)',
    cells: [['n'], ['m', 'source_unit: absolute'], ['a', 'resource / energy_cap_max'], ['a', 'resource / energy_cap_max'], ['a', 'resource / energy_cap_max']],
  },
  {
    feature: 'Unlimited capacity',
    cells: [['n'], ['m'], ['m'], ['a', '999 GW stand-in'], ['a', '10⁶ MW stand-in']],
  },
  {
    feature: 'SPORES',
    cells: [['n'], ['x', 'Disabled in the app'], ['x'], ['x'], ['x']],
  },
  {
    feature: 'Export writes what TEMPO solves',
    cells: [['n'], ['m'], ['m'], ['a', 'Writes the older storage and transmission layout', true], ['m']],
  },
]

const STATE = {
  n: { label: 'Native', glyph: 'bg-black' },
  m: { label: 'Mapped', glyph: 'bg-black shadow-[inset_0_0_0_3px_#fff] border border-black' },
  a: { label: 'Approximated', glyph: 'border-2 border-black bg-[linear-gradient(135deg,#000_50%,transparent_50%)]' },
  x: { label: 'Not supported', glyph: 'border-2 border-black' },
}

function Glyph({ s }) {
  return <span className={`inline-block w-3 h-3 shrink-0 ${STATE[s].glyph}`} aria-hidden="true" />
}

const SOLVERS = ['HiGHS', 'HiGHS (CBC if HiGHS is missing)', 'HiGHS', 'GLPK', 'HiGHS']

const TOLERANCES = [
  ['Calliope 0.7', '0.5 %', '1 %'],
  ['PyPSA', '0.5 %', '1 %'],
  ['OSeMOSYS', '2 %', '5 %'],
  ['AdOpT-NET0', '2 %', '5 %'],
]

const RELATED = [
  {
    name: 'TEMPO',
    href: 'https://github.com/THD-Spatial-AI/TEMPO',
    hub: 'Internal model in Calliope 0.6 vocabulary',
    formats: 'Calliope 0.6.8, Calliope 0.7, PyPSA, OSeMOSYS, AdOpT-NET0',
    focus: 'Capacity expansion and dispatch, open solvers',
    ui: 'Desktop app with a map editor',
    check: 'Same reference models solved on every engine, compared within tolerances',
  },
  {
    name: 'tz-oss-interop (TransitionZero, part of OpenGrid)',
    href: 'https://github.com/transition-zero/tz-oss-interop',
    hub: 'Sienna',
    formats: 'PLEXOS, PyPSA, Sienna; OSeMOSYS named in the project description',
    focus: 'Power system and production cost models',
    ui: 'Command line, YAML pipelines of source, step and sink plugins',
    check: 'Case studies against published models (SEM, CAISO, AEMO ISP) and a compare command for Sienna and PyPSA solves. Marked beta.',
  },
  {
    name: 'otoole',
    href: 'https://github.com/OSeMOSYS/otoole',
    hub: 'None. Converts between OSeMOSYS data formats',
    formats: 'OSeMOSYS CSV, Excel, datafile',
    focus: 'OSeMOSYS input data and results',
    ui: 'Command line and Python',
    check: 'Not a cross-framework tool. TEMPO uses it to write and read OSeMOSYS data.',
  },
  {
    name: 'PyPSA to GEMS converter',
    href: 'https://gems-energy.readthedocs.io/en/latest/interoperability/pypsa-to-gems-converter/overview/',
    hub: 'None. One direction',
    formats: 'PyPSA to GEMS',
    focus: 'Linear optimal power flow, economic dispatch, two-stage stochastic studies',
    ui: 'Python',
    check: 'See the project documentation',
  },
]

const REFERENCES = [
  ['Pfenninger, S. and Pickering, B. (2018). Calliope: a multi-scale energy systems modelling framework. Journal of Open Source Software 3(29), 825.', 'https://doi.org/10.21105/joss.00825'],
  ['Brown, T., Hörsch, J. and Schlachtberger, D. (2018). PyPSA: Python for Power System Analysis. Journal of Open Research Software 6(1), 4.', 'https://doi.org/10.5334/jors.188'],
  ['Howells, M. et al. (2011). OSeMOSYS: The Open Source Energy Modeling System. Energy Policy 39(10), 5850-5870.', 'https://doi.org/10.1016/j.enpol.2011.06.033'],
  ['AdOpT-NET0 source code and archived releases (Zenodo).', 'https://doi.org/10.5281/zenodo.13384688'],
  ['Barnes, T. and Usher, W. (2023). otoole: OSeMOSYS Tools for Energy Work. Journal of Open Source Software 8(92), 5511.', 'https://doi.org/10.21105/joss.05511'],
  ['Booshehri, M. et al. (2021). Introducing the Open Energy Ontology: Enhancing data interpretation and interfacing in energy systems analysis. Energy and AI 5, 100074.', 'https://doi.org/10.1016/j.egyai.2021.100074'],
  ['Lombardi, F., Pickering, B., Colombo, E. and Pfenninger, S. (2020). Policy Decision Support for Renewables Deployment through Spatially Explicit Practically Optimal Alternatives. Joule 4(10), 2185-2207.', 'https://doi.org/10.1016/j.joule.2020.08.002'],
  ['Calliope documentation (0.6 and 0.7).', 'https://calliope.readthedocs.io/'],
  ['TransitionZero. tz-oss-interop: translation tooling for energy-system model formats.', 'https://github.com/transition-zero/tz-oss-interop'],
  ['TransitionZero. Open source translator becomes core part of OpenGrid initiative.', 'https://www.transitionzero.org/press/transitionzero-open-source-translator-becomes-core-part-of-opengrid-initiative'],
  ['Linux Foundation. OpenGrid.', 'https://opengrid.org/'],
]

const ADD_ENGINE = [
  ['Write the translator', 'Internal model to engine files. Use the helpers in engine_common.py and read engineParams through engine_overlay.py.', 'python/engine_common.py'],
  ['Write the importer', 'Engine files back to the internal model, with a report of everything it could not carry over.', 'python/osemosys_import.py'],
  ['Write the runner', 'Solve, then return the result contract keys listed above. The views will work without changes.', 'python/pypsa_runner.py'],
  ['Wrap it as a service', 'create_engine_app() gives you /health, /run and the log stream. Add /export and /import.', 'python/engine_service_base.py'],
  ['Teach the app to find it', 'A venv entry for the installer, a signature in the archive detector, and an engines block per parameter in the ontology.', 'src/services/archiveFormat.js'],
  ['Prove it', 'Add the engine to verify_engines.py with its own tolerances and run --auto until both reference models pass.', 'scripts/verify_engines.py'],
]

export default function Interoperability() {
  return (
    <div className="text-primary selection:bg-primary selection:text-surface-container-lowest">
      <main className="pt-16">

        {/* Hero */}
        <section className="px-4 sm:px-8 py-24 bg-surface">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-[2.75rem] sm:text-[3.5rem] md:text-[5rem] font-bold tracking-[-0.03em] leading-[1.05] mb-12">
              ONE MODEL,<br />FIVE ENGINES
            </h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-end">
              <p className="font-medium text-[1.125rem] leading-[1.6] text-on-surface-variant max-w-xl">
                TEMPO keeps every model in one format and translates it when you run or export. This page
                shows how the translation is built, what each engine receives, what gets approximated, and
                how we check that the engines agree. Each step links to the file that does the work.
              </p>
              <dl className="border-l border-black/20 pl-8 space-y-3 text-[14px]">
                <div><dt className="inline font-bold">Hub:</dt> <dd className="inline text-on-surface-variant">internal model, Calliope 0.6 vocabulary</dd></div>
                <div><dt className="inline font-bold">Engines:</dt> <dd className="inline text-on-surface-variant">Calliope 0.6.8, Calliope 0.7, PyPSA, OSeMOSYS, AdOpT-NET0</dd></div>
                <div><dt className="inline font-bold">Directions:</dt> <dd className="inline text-on-surface-variant">translate out to run or export, import in from an archive</dd></div>
              </dl>
            </div>
          </div>
        </section>

        {/* 01 Hub */}
        <section className="px-4 sm:px-8 py-24 bg-white border-y border-black/10">
          <div className="max-w-7xl mx-auto">
            <SectionMark n="01" label="The hub" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 mb-16">
              <h2 className="text-[2.25rem] md:text-[2.75rem] font-bold tracking-tight leading-none">
                EVERY ROUTE GOES THROUGH THE INTERNAL MODEL
              </h2>
              <div className="space-y-4 text-[1rem] leading-[1.65] text-on-surface-variant">
                <p>
                  TEMPO has no PyPSA-to-OSeMOSYS converter. A PyPSA network is first read into the internal
                  model, and the OSeMOSYS files are written from there. The same goes for every other pair.
                </p>
                <p>
                  Each engine needs one translator out and one importer in, so five engines take ten pieces of
                  translation code. Direct converters between every pair would take twenty. A sixth engine adds
                  two to the hub, or ten to the pairwise version.
                </p>
              </div>
            </div>
            <HubDiagram />
          </div>
        </section>

        {/* 02 Why Calliope */}
        <section className="px-4 sm:px-8 py-24 bg-black text-white">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-12 lg:gap-20">
            <div>
              <SectionMark n="02" label="Why Calliope" light />
              <h2 className="text-[2.25rem] md:text-[3rem] font-bold tracking-tighter leading-none">
                THE HUB IS NOT NEUTRAL, AND WE CHOSE THAT
              </h2>
            </div>
            <div className="space-y-6 text-[1rem] leading-[1.7] text-neutral-300">
              <p>
                The internal model uses Calliope 0.6 terms: locations, links, and technologies that inherit from a
                parent (supply, supply_plus, storage, conversion, conversion_plus, transmission, demand). Values are
                stored in Calliope units, kW for power, kWh for energy, cost per kW of capacity.
              </p>
              <p>
                Calliope 0.6.8 was TEMPO's first engine, so every model saved before the others existed is already in
                this shape and nothing had to be migrated. The parents also line up with what the other engines can
                express. A supply technology becomes a PyPSA Generator, an OSeMOSYS technology with an output
                activity ratio, or an AdOpT-NET0 RES technology. Calliope's cost rules (investment annualised with a
                capital recovery factor, fixed O&amp;M per kW, variable O&amp;M per kWh) are the reference the other
                runners are checked against.
              </p>
              <p>
                The cost of this choice: concepts Calliope 0.6 has no field for stay out of the hub. When a model
                needs an engine-native value, it goes into a per-engine overlay that only that engine's translator
                reads. The parameter editor shows each common parameter next to its engine fields, from one shared
                file, <Src path="python/parameterOntology.json" light />.
              </p>
            </div>
          </div>
        </section>

        {/* 03 Pipeline */}
        <section className="px-4 sm:px-8 py-24 bg-surface">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[4fr_8fr] gap-12 lg:gap-20">
            <div className="lg:sticky lg:top-28 self-start">
              <SectionMark n="03" label="Run path" />
              <h2 className="text-[2.25rem] md:text-[2.75rem] font-bold tracking-tight leading-none mb-6">
                FROM SAVED MODEL TO SOLVER INPUT
              </h2>
              <p className="text-[1rem] leading-[1.65] text-on-surface-variant">
                What happens between pressing Run and the solver starting, for any engine other than Calliope 0.6.8.
              </p>
            </div>
            <ol className="relative border-l-2 border-black ml-1.5">
              {PIPELINE.map((step, i) => (
                <li key={step.title} className="relative pl-8 pb-10 last:pb-0">
                  <span
                    className={`absolute -left-[9px] top-1 w-4 h-4 ${i === 0 || i === PIPELINE.length - 1 ? 'bg-black' : 'bg-surface border-2 border-black'}`}
                    aria-hidden="true"
                  />
                  <h3 className="font-black text-[1.125rem] tracking-tight mb-2">{step.title}</h3>
                  <p className="text-[15px] leading-[1.65] text-on-surface-variant mb-2 max-w-2xl">{step.text}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <Src path={step.path} />
                    {step.more?.map(([p]) => <Src key={p} path={p} />)}
                  </div>
                  {i === PIPELINE.length - 1 && (
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {CONTRACT_KEYS.map((k) => (
                        <li key={k} className="font-mono text-[12.5px] border border-black/30 px-2 py-1 bg-white">{k}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 04 Worked example */}
        <section className="px-4 sm:px-8 py-24 bg-white border-y border-black/10">
          <div className="max-w-7xl mx-auto">
            <SectionMark n="04" label="Worked example" />
            <h2 className="text-[2.25rem] md:text-[2.75rem] font-bold tracking-tight leading-none mb-12 max-w-3xl">
              ONE BATTERY, FIVE REPRESENTATIONS
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-10 lg:gap-16 items-start">
              <div>
                <p className="text-[14px] text-on-surface-variant mb-3">In the internal model (example values):</p>
                <pre className="bg-black text-white text-[13px] leading-[1.6] p-6 overflow-x-auto"><code>{`{
  "name": "battery",
  "essentials": { "parent": "storage",
                  "carrier": "electricity" },
  "constraints": {
    "energy_eff": 0.95,
    "storage_loss": 0.001,
    "energy_cap_max": 50000,
    "storage_cap_max": 200000,
    "lifetime": 15
  },
  "costs": { "monetary": {
    "energy_cap": 300,
    "storage_cap": 250
  } }
}`}</code></pre>
              </div>
              <dl className="divide-y divide-black/15 border-y border-black">
                {BATTERY.map((b) => (
                  <div key={b.engine} className="py-5 grid grid-cols-1 sm:grid-cols-[9.5rem_1fr] gap-1 sm:gap-6">
                    <dt className="font-bold text-[15px]">{b.engine}</dt>
                    <dd className="text-[15px] leading-[1.65] text-on-surface-variant">{b.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* 05 Explorer */}
        <section className="px-4 sm:px-8 py-24 bg-surface-container-low">
          <div className="max-w-7xl mx-auto">
            <SectionMark n="05" label="Parameters" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 mb-12">
              <h2 className="text-[2.25rem] md:text-[2.75rem] font-bold tracking-tight leading-none">
                WHERE EACH PARAMETER ENDS UP
              </h2>
              <p className="text-[1rem] leading-[1.65] text-on-surface-variant">
                Pick a parameter to see its field in every engine, with unit conversions and notes where the mapping
                is indirect. This list is built from the same mapping files the translators load, so it changes when
                they change.
              </p>
            </div>
            <ParameterExplorer />
          </div>
        </section>

        {/* 06 Import */}
        <section className="px-4 sm:px-8 py-24 bg-white border-y border-black/10">
          <div className="max-w-7xl mx-auto">
            <SectionMark n="06" label="Import" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 mb-12">
              <h2 className="text-[2.25rem] md:text-[2.75rem] font-bold tracking-tight leading-none">
                OPENING A MODEL FROM ANOTHER FRAMEWORK
              </h2>
              <div className="space-y-4 text-[1rem] leading-[1.65] text-on-surface-variant">
                <p>
                  Import a ZIP archive from the Models view. TEMPO decides the framework from the file names alone, then the
                  matching engine service parses the contents. Converting between two other frameworks is an import
                  followed by an export.
                </p>
                <p>
                  The PyPSA, OSeMOSYS and AdOpT-NET0 importers return a report of what they could not carry over.
                  Read it before you trust the imported model.
                </p>
              </div>
            </div>
            <div className="mb-14"><RoundTripDiagram /></div>
            <div className="overflow-x-auto border border-black">
              <table className="w-full min-w-[720px] text-left text-[14px]">
                <caption className="sr-only">How each framework is detected and imported</caption>
                <thead className="bg-black text-white">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-bold">Framework</th>
                    <th scope="col" className="px-5 py-3 font-bold">Recognised by</th>
                    <th scope="col" className="px-5 py-3 font-bold">Parsed by, and what is lost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/15">
                  {IMPORTS.map((r) => (
                    <tr key={r.format} className="align-top">
                      <th scope="row" className="px-5 py-4 font-bold whitespace-nowrap">{r.format}</th>
                      <td className="px-5 py-4 font-mono text-[13px]">{r.files}</td>
                      <td className="px-5 py-4 text-on-surface-variant leading-[1.6]">
                        {r.by} <span className="block mt-1"><Src path={r.path} /></span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[13px] text-on-surface-variant">
              Detection: <Src path="src/services/archiveFormat.js" />
            </p>
          </div>
        </section>

        {/* 07 Fidelity */}
        <section className="px-4 sm:px-8 py-24 bg-surface" id="fidelity">
          <div className="max-w-7xl mx-auto">
            <SectionMark n="07" label="Fidelity" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 mb-10">
              <h2 className="text-[2.25rem] md:text-[2.75rem] font-bold tracking-tight leading-none">
                WHAT TRANSLATES, AND WHAT DOES NOT
              </h2>
              <p className="text-[1rem] leading-[1.65] text-on-surface-variant">
                The state of the code today, not a roadmap. Rows marked in progress are being worked on now and are
                not in a release yet.
              </p>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 mb-6 text-[13px]">
              {Object.entries(STATE).map(([k, s]) => (
                <li key={k} className="flex items-center gap-2"><Glyph s={k} /> {s.label}</li>
              ))}
              <li className="flex items-center gap-2">
                <span className="text-[11px] font-bold border border-black px-1.5 py-0.5">IN PROGRESS</span> fix under way
              </li>
            </ul>
            <div className="overflow-x-auto border border-black bg-white">
              <table className="w-full min-w-[900px] text-left text-[13.5px]">
                <caption className="sr-only">Translation fidelity per engine</caption>
                <thead className="bg-black text-white">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-bold w-[22%]">Feature</th>
                    {ENGINE_COLS.map((e) => <th key={e} scope="col" className="px-4 py-3 font-bold">{e}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/15">
                  {FIDELITY.map((row) => (
                    <tr key={row.feature} className="align-top">
                      <th scope="row" className="px-4 py-4 font-bold leading-snug">{row.feature}</th>
                      {row.cells.map(([s, note, wip], i) => (
                        <td key={i} className="px-4 py-4">
                          <span className="flex items-center gap-2 font-medium">
                            <Glyph s={s} /> {STATE[s].label}
                          </span>
                          {note && <span className="block mt-1 text-[12.5px] text-on-surface-variant leading-snug">{note}</span>}
                          {wip && <span className="inline-block mt-2 text-[11px] font-bold border border-black px-1.5 py-0.5">IN PROGRESS</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="align-top bg-surface-container-low text-black">
                    <th scope="row" className="px-4 py-4 font-bold">Default solver</th>
                    {SOLVERS.map((s, i) => (
                      <td key={i} className="px-4 py-4">
                        {s}
                        {i === 1 && <span className="block mt-2"><span className="inline-block text-[11px] font-bold border border-black px-1.5 py-0.5">IN PROGRESS</span></span>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[13px] text-on-surface-variant max-w-3xl">
              AdOpT-NET0 is run as a pure LP: its one-direction and precise bidirectional options are switched off
              so it solves the same problem as Calliope.
            </p>
          </div>
        </section>

        {/* 08 Verification */}
        <section className="px-4 sm:px-8 py-24 bg-black text-white">
          <div className="max-w-7xl mx-auto">
            <SectionMark n="08" label="Verification" light />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 mb-12">
              <h2 className="text-[2.25rem] md:text-[3rem] font-bold tracking-tighter leading-none">
                HOW WE KNOW THE ENGINES AGREE
              </h2>
              <div className="space-y-4 text-[1rem] leading-[1.65] text-neutral-300">
                <p>
                  <Src path="scripts/verify_engines.py" light /> solves the same reference models on every
                  installed engine and compares each result with the Calliope baseline. It checks the objective,
                  installed capacity, energy produced per technology and demand, plus the result keys and series
                  lengths. Demand and transmission technologies are left out of the capacity and energy checks.
                </p>
                <p>
                  A failure means a translator or a result extractor has drifted. The rules every runner follows
                  are written down in the repository, from annualised investment to how storage efficiency applies.
                </p>
              </div>
            </div>
            <div className="bg-white text-black p-4 sm:p-8 mb-10"><ParityDiagram /></div>
            <div className="overflow-x-auto max-w-xl">
              <table className="w-full text-left text-[14px] border border-white/30">
                <caption className="text-left text-[13px] text-neutral-400 pb-3">Default tolerances against the baseline (a payload can override them)</caption>
                <thead>
                  <tr className="border-b border-white/30">
                    <th scope="col" className="px-4 py-3 font-bold">Engine</th>
                    <th scope="col" className="px-4 py-3 font-bold">Objective</th>
                    <th scope="col" className="px-4 py-3 font-bold">Capacity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/15">
                  {TOLERANCES.map(([e, o, c]) => (
                    <tr key={e}>
                      <th scope="row" className="px-4 py-3 font-medium">{e}</th>
                      <td className="px-4 py-3 text-neutral-300">{o}</td>
                      <td className="px-4 py-3 text-neutral-300">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 09 Related work */}
        <section className="px-4 sm:px-8 py-24 bg-white">
          <div className="max-w-7xl mx-auto">
            <SectionMark n="09" label="Related work" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 mb-12">
              <h2 className="text-[2.25rem] md:text-[2.75rem] font-bold tracking-tight leading-none">
                THE SAME PATTERN ELSEWHERE
              </h2>
              <p className="text-[1rem] leading-[1.65] text-on-surface-variant">
                TransitionZero's translator, now part of the Linux Foundation's OpenGrid initiative, also routes every
                conversion through one hub, Sienna, so PLEXOS to PyPSA runs as PLEXOS to Sienna to PyPSA. Its pipelines
                start from tools such as PLEXOS, a commercial production cost model. TEMPO works with open capacity
                expansion frameworks and puts a map editor in front of them.
              </p>
            </div>
            <div className="overflow-x-auto border border-black">
              <table className="w-full min-w-[960px] text-left text-[13.5px]">
                <caption className="sr-only">Comparison of model translation tools</caption>
                <thead className="bg-black text-white">
                  <tr>
                    {['Project', 'Hub', 'Formats', 'Model focus', 'Interface', 'How fidelity is checked'].map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/15">
                  {RELATED.map((r, i) => (
                    <tr key={r.name} className={`align-top ${i === 0 ? 'bg-surface-container-low' : ''}`}>
                      <th scope="row" className="px-4 py-4 font-bold">
                        <a href={r.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{r.name}</a>
                      </th>
                      <td className="px-4 py-4 text-on-surface-variant">{r.hub}</td>
                      <td className="px-4 py-4 text-on-surface-variant">{r.formats}</td>
                      <td className="px-4 py-4 text-on-surface-variant">{r.focus}</td>
                      <td className="px-4 py-4 text-on-surface-variant">{r.ui}</td>
                      <td className="px-4 py-4 text-on-surface-variant">{r.check}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="font-black text-[1.25rem] tracking-tight mt-20 mb-6">References</h3>
            <ol className="list-decimal pl-6 space-y-3 text-[14px] leading-[1.6] text-on-surface-variant max-w-4xl marker:font-bold marker:text-black">
              {REFERENCES.map(([text, href]) => (
                <li key={href}>
                  {text}{' '}
                  <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-black break-all">
                    {href.replace(/^https:\/\//, '')}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 10 Add an engine */}
        <section className="px-4 sm:px-8 pb-24 bg-white">
          <div className="max-w-7xl mx-auto bg-black text-white p-6 sm:p-12">
            <SectionMark n="10" label="Contribute" light />
            <div className="grid grid-cols-1 lg:grid-cols-[4fr_8fr] gap-10 lg:gap-16">
              <div>
                <h2 className="text-[2rem] md:text-[2.5rem] font-bold tracking-tighter leading-none mb-6">
                  ADD YOUR OWN ENGINE
                </h2>
                <p className="text-neutral-300 leading-[1.65] mb-8">
                  A new framework plugs into the hub, not into the other engines. This is the path the PyPSA,
                  OSeMOSYS and AdOpT-NET0 integrations took.
                </p>
                <a
                  href="https://github.com/THD-Spatial-AI/TEMPO/tree/main/python"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center min-h-[44px] px-6 bg-white text-black font-bold text-[14px] uppercase tracking-tight hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Read the engine code on GitHub
                </a>
              </div>
              <ol className="divide-y divide-white/15 border-y border-white/15">
                {ADD_ENGINE.map(([title, text, path], i) => (
                  <li key={title} className="py-5 grid grid-cols-[2.5rem_1fr] gap-2">
                    <span className="font-black text-neutral-400">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <p className="font-bold mb-1">{title}</p>
                      <p className="text-[14px] text-neutral-300 leading-[1.6] mb-2">{text}</p>
                      <Src path={path} light />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}

import { useState } from "react";
import {
  FiZap,
  FiBattery,
  FiMapPin,
  FiSettings,
  FiTrendingUp,
  FiArrowRight,
  FiLayers,
  FiCpu,
  FiClock,
  FiSliders,
} from "react-icons/fi";
import { TECH_TEMPLATES } from './TechnologiesData';

export const ModelStructureTutorial = () => {
  const [activeSection, setActiveSection] = useState('overview');

  const tabs = [
    { id: 'overview',     label: 'Overview' },
    { id: 'parents',      label: 'Parent Types' },
    { id: 'carriers',     label: 'Carriers & Demand' },
    { id: 'supply',       label: 'Supply' },
    { id: 'storage',      label: 'Storage & Conversion' },
    { id: 'constraints',  label: 'Constraints & Costs' },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeSection === tab.id
                ? 'border-slate-700 text-slate-800'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {activeSection === 'overview'    && <OverviewSection />}
        {activeSection === 'parents'     && <ParentTypesSection />}
        {activeSection === 'carriers'    && <CarriersSection />}
        {activeSection === 'supply'      && <SupplySection />}
        {activeSection === 'storage'     && <StorageConversionSection />}
        {activeSection === 'constraints' && <ConstraintsSection />}
      </div>
    </div>
  );
};

// ─── Overview ────────────────────────────────────────────────────────────────
const OverviewSection = () => (
  <div className="space-y-8">
    <div>
      <h2 className="text-xl font-semibold text-slate-800 mb-1">Model Structure</h2>
      <p className="text-slate-500 text-sm">
        Every TEMPO model shares the same internal structure regardless of which engine you run it on —
        Calliope 0.6.8, Calliope 0.7, PyPSA, OSeMOSYS, or AdOpT-NET0. The engine-specific translation
        happens automatically at run time.
      </p>
    </div>

    {/* Engine badge row */}
    <div className="flex flex-wrap gap-2">
      {['Calliope 0.6.8', 'Calliope 0.7', 'PyPSA', 'OSeMOSYS', 'AdOpT-NET0'].map(e => (
        <span key={e} className="px-2.5 py-1 border border-slate-200 rounded text-xs text-slate-600 font-mono">{e}</span>
      ))}
    </div>

    {/* Core building blocks */}
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Core building blocks</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { icon: FiMapPin,    title: 'Locations',     desc: 'Physical sites — substations, power plants, demand centres. Each has coordinates and a type.' },
          { icon: FiZap,       title: 'Technologies',  desc: 'Generation, storage, conversion or demand units assigned to a location.' },
          { icon: FiArrowRight,title: 'Links',         desc: 'Transmission lines or pipelines that connect two locations.' },
          { icon: FiClock,     title: 'Time Series',   desc: 'Hourly demand and resource profiles attached to technologies.' },
          { icon: FiSliders,   title: 'Scenarios',     desc: 'Override sets that mutate parameters at run time without editing the base model.' },
          { icon: FiCpu,       title: 'Engine',        desc: 'The solver backend selected per model. Each engine gets its own venv and solver binary.' },
        ].map((item) => {
          const BlockIcon = item.icon;
          return (
          <div key={item.title} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <BlockIcon size={14} className="text-slate-500 flex-shrink-0" />
              <span className="font-semibold text-slate-800 text-sm">{item.title}</span>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
          </div>
          );
        })}

      </div>
    </div>

    {/* Workflow */}
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Typical workflow</h3>
      <div className="flex flex-col md:flex-row gap-3">
        {[
          { n: '1', title: 'Create or import',  body: 'Start from scratch, import a YAML archive, use the CSV Wizard, or load a framework archive.' },
          { n: '2', title: 'Add technologies',   body: 'Assign generation, demand, storage, and conversion techs to each location.' },
          { n: '3', title: 'Connect the network',body: 'Draw transmission lines between locations.' },
          { n: '4', title: 'Attach time series', body: 'Upload hourly demand and resource profiles (CSV).' },
          { n: '5', title: 'Run & analyse',      body: 'Select an engine and solver, run the optimisation, inspect results in the Results tab.' },
        ].map(({ n, title, body }) => (
          <div key={n} className="flex-1 bg-white border border-slate-200 rounded-xl p-4">
            <div className="w-6 h-6 bg-slate-800 text-white rounded text-xs font-bold flex items-center justify-center mb-2">{n}</div>
            <div className="font-semibold text-slate-800 text-xs mb-1">{title}</div>
            <div className="text-slate-500 text-xs">{body}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── Parent Types (Calliope 0.6.8) ───────────────────────────────────────────
const ParentTypesSection = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-semibold text-slate-800 mb-1">Calliope Parent Types</h2>
      <p className="text-slate-500 text-sm">
        Every technology belongs to a parent type that defines its fundamental behaviour. These map to
        Calliope 0.6.8 and 0.7 — the PyPSA, OSeMOSYS and AdOpT-NET0 translators derive equivalent
        concepts automatically.
      </p>
    </div>

    {[
      {
        title: 'supply',
        description: 'Conventional generation with unlimited or defined fuel resources.',
        useCases: ['Coal power plants', 'Gas turbines', 'Oil generators', 'Diesel plants'],
        requirements: [
          'Must define carrier_out',
          'Requires energy_eff (conversion efficiency)',
          'resource: inf for unlimited fuel',
        ],
        example: { parent: 'supply', carrier_out: 'electricity', energy_eff: 0.4, resource: 'inf' },
      },
      {
        title: 'supply_plus',
        description: 'Renewable generation requiring an hourly resource time series.',
        useCases: ['Solar PV', 'Wind turbines', 'Run-of-river hydro', 'CSP'],
        requirements: [
          'Must provide resource time series',
          'Defines carrier_out (typically electricity)',
          'resource_unit: energy_per_cap or energy_per_area',
        ],
        example: { parent: 'supply_plus', carrier_out: 'electricity', resource_unit: 'energy_per_cap', resource: '[time series]' },
      },
      {
        title: 'storage',
        description: 'Energy storage systems that charge and discharge.',
        useCases: ['Battery storage', 'Pumped hydro', 'Hydrogen storage', 'Thermal storage'],
        requirements: [
          'Defines carrier (energy type stored)',
          'Requires energy_eff (round-trip efficiency)',
          'energy_cap_per_storage_cap_equals sets the C-rate',
        ],
        example: { parent: 'storage', carrier: 'electricity', energy_eff: 0.9, energy_cap_per_storage_cap_equals: 0.25 },
      },
      {
        title: 'conversion_plus',
        description: 'Multi-carrier conversion — input and output are different carriers.',
        useCases: ['Electrolysers (electricity → H₂)', 'Fuel cells (H₂ → electricity)', 'Heat pumps', 'CHP'],
        requirements: [
          'Defines carrier_in and carrier_out',
          'Requires energy_eff',
        ],
        example: { parent: 'conversion_plus', carrier_in: 'electricity', carrier_out: 'hydrogen', energy_eff: 0.7 },
      },
      {
        title: 'transmission',
        description: 'Energy transfer between two locations.',
        useCases: ['Power lines (11 kV – 500 kV)', 'Gas pipelines', 'Heat networks', 'H₂ pipelines'],
        requirements: [
          'Defines carrier',
          'energy_eff sets line losses (default 1.0)',
          'energy_cap_max limits the line',
        ],
        example: { parent: 'transmission', carrier: 'electricity', energy_eff: 0.97, energy_cap_max: 2000 },
      },
      {
        title: 'demand',
        description: 'Energy consumption driven by an hourly demand profile.',
        useCases: ['Power demand', 'Heat demand', 'Cooling demand', 'H₂ demand'],
        requirements: [
          'Defines carrier',
          'Must provide a demand time series (negative values)',
          'force_resource: true makes the profile mandatory',
        ],
        example: { parent: 'demand', carrier: 'electricity', resource: '[negative time series]' },
      },
    ].map(({ title, description, useCases, requirements, example }) => (
      <div key={title} className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <code className="text-sm font-mono font-semibold text-slate-800">{title}</code>
            <p className="text-slate-500 text-xs mt-0.5">{description}</p>
          </div>
          <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wide ml-4 flex-shrink-0">parent type</span>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Common uses</p>
            <ul className="space-y-1">
              {useCases.map(u => <li key={u} className="text-xs text-slate-600">· {u}</li>)}
            </ul>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Requirements</p>
            <ul className="space-y-1">
              {requirements.map(r => <li key={r} className="text-xs text-slate-600">· {r}</li>)}
            </ul>
          </div>
          <div className="bg-slate-900 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Example</p>
            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{JSON.stringify(example, null, 2)}</pre>
          </div>
        </div>
      </div>
    ))}
  </div>
);

// ─── Carriers & Demand ───────────────────────────────────────────────────────
const CarriersSection = () => (
  <div className="space-y-6">
    <div>
      <h2 className="text-xl font-semibold text-slate-800 mb-1">Energy Carriers & Demand</h2>
      <p className="text-slate-500 text-sm">
        Carriers define what type of energy flows through your model. Demand technologies consume them.
      </p>
    </div>

    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {[
        { name: 'electricity', description: 'Electric power — the most common carrier.', examples: ['Grid power', 'Solar PV output', 'Wind generation', 'Battery storage'], unit: 'kWh / MWh' },
        { name: 'heat',        description: 'Thermal energy for space or water heating.',examples: ['District heating', 'Boiler output', 'Heat pump delivery', 'CHP heat'],    unit: 'kWh thermal' },
        { name: 'cooling',     description: 'Cooling energy for air conditioning.',       examples: ['Air conditioning', 'Industrial cooling', 'District cooling'],             unit: 'kWh cooling' },
        { name: 'hydrogen',    description: 'Hydrogen for energy storage or transport.',  examples: ['Electrolyser output', 'Fuel cell input', 'H₂ storage'],                   unit: 'kg H₂' },
        { name: 'gas',         description: 'Natural gas or biogas.',                     examples: ['Natural gas grid', 'Biogas production', 'Gas turbine fuel'],              unit: 'kWh (LHV)' },
        { name: 'water',       description: 'Water for hydro or industrial processes.',   examples: ['Hydroelectric', 'Water supply', 'Industrial process'],                    unit: 'm³ or kWh' },
      ].map(({ name, description, examples, unit }) => (
        <div key={name} className="bg-white border border-slate-200 rounded-xl p-4">
          <code className="text-sm font-mono font-semibold text-slate-800">{name}</code>
          <p className="text-xs text-slate-500 mt-0.5 mb-2">{description}</p>
          <ul className="space-y-0.5 mb-2">
            {examples.map(e => <li key={e} className="text-xs text-slate-500">· {e}</li>)}
          </ul>
          <div className="text-[10px] text-slate-400 font-mono border-t border-slate-100 pt-1.5 mt-1.5">Unit: {unit}</div>
        </div>
      ))}
    </div>

    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Demand technology notes</h3>
      <ul className="space-y-1.5">
        {[
          'Resource time series must use negative values (consumption).',
          'Parent type must be demand.',
          'Set force_resource: true to make the profile mandatory.',
          'Time series resolution must match the model timesteps (hourly, daily, etc.).',
        ].map(note => (
          <li key={note} className="text-xs text-slate-600 flex gap-2">
            <span className="text-slate-300 mt-0.5 flex-shrink-0">—</span>
            {note}
          </li>
        ))}
      </ul>
    </div>

    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Demand examples</h3>
      <div className="grid md:grid-cols-2 gap-3">
        {[
          { name: 'power_demand',   carrier: 'electricity', desc: 'Electrical consumption',     typical: 'Residential, commercial, industrial loads' },
          { name: 'heat_demand',    carrier: 'heat',        desc: 'Thermal consumption',         typical: 'Space heating, hot water, process heat' },
          { name: 'cooling_demand', carrier: 'cooling',     desc: 'Cooling energy consumption',  typical: 'AC, refrigeration, data centres' },
          { name: 'h2_demand',      carrier: 'hydrogen',    desc: 'Hydrogen consumption',        typical: 'Fuel cell vehicles, industrial processes, steel' },
        ].map(({ name, carrier, desc, typical }) => (
          <div key={name} className="bg-white border border-slate-200 rounded-xl p-4">
            <code className="text-sm font-mono font-semibold text-slate-800">{name}</code>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex gap-2">
                <span className="text-slate-500 w-16 flex-shrink-0">Carrier</span>
                <code className="bg-slate-100 text-slate-700 px-1.5 rounded font-mono">{carrier}</code>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-500 w-16 flex-shrink-0">What</span>
                <span className="text-slate-600">{desc}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-500 w-16 flex-shrink-0">Typical</span>
                <span className="text-slate-600">{typical}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── Supply Technologies ──────────────────────────────────────────────────────
const SupplySection = () => {
  const supplyTechs = TECH_TEMPLATES.supply || [];
  const supplyPlusTechs = TECH_TEMPLATES.supply_plus || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800 mb-1">Supply Technologies</h2>
        <p className="text-slate-500 text-sm">Generation technologies available in the built-in catalogue.</p>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Conventional (supply)</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {supplyTechs.slice(0, 6).map(tech => <TechnologyCard key={tech.name} tech={tech} />)}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Renewable (supply_plus)</h3>
        <div className="grid md:grid-cols-2 gap-3">
          {supplyPlusTechs.map(tech => <TechnologyCard key={tech.name} tech={tech} />)}
        </div>
      </div>
    </div>
  );
};

// ─── Storage & Conversion ─────────────────────────────────────────────────────
const StorageConversionSection = () => {
  const storageTechs = TECH_TEMPLATES.storage || [];
  const conversionTechs = TECH_TEMPLATES.conversion_plus || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800 mb-1">Storage & Conversion</h2>
        <p className="text-slate-500 text-sm">Technologies that store energy or convert between different carriers.</p>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Storage</h3>
        <div className="grid md:grid-cols-2 gap-3">
          {storageTechs.map(tech => <TechnologyCard key={tech.name} tech={tech} />)}
        </div>
        <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-600 mb-2">Key parameters</p>
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            {[
              { p: 'energy_cap',  d: 'Power capacity (kW) — how fast it charges/discharges' },
              { p: 'storage_cap', d: 'Energy capacity (kWh) — how much it stores' },
              { p: 'energy_eff',  d: 'Round-trip efficiency (typically 0.85–0.95)' },
              { p: 'energy_cap_per_storage_cap_equals', d: 'C-rate ratio (e.g. 0.25 = 4 h battery)' },
            ].map(({ p, d }) => (
              <div key={p} className="flex gap-2">
                <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono text-[10px] flex-shrink-0">{p}</code>
                <span className="text-slate-500">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Conversion (conversion_plus)</h3>
        <div className="grid md:grid-cols-2 gap-3">
          {conversionTechs.map(tech => <TechnologyCard key={tech.name} tech={tech} />)}
        </div>
      </div>
    </div>
  );
};

// ─── Technology Card ──────────────────────────────────────────────────────────
const TechnologyCard = ({ tech }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
    <h4 className="text-sm font-semibold text-slate-800 mb-1">{tech.essentials?.name || tech.name}</h4>
    <p className="text-xs text-slate-500 mb-2">{tech.description}</p>
    <div className="space-y-1 text-xs">
      {tech.essentials?.carrier_out && (
        <div className="flex gap-2">
          <span className="text-slate-400 w-14 flex-shrink-0">Output</span>
          <code className="bg-slate-100 text-slate-700 px-1.5 rounded font-mono">{tech.essentials.carrier_out}</code>
        </div>
      )}
      {tech.essentials?.carrier_in && (
        <div className="flex gap-2">
          <span className="text-slate-400 w-14 flex-shrink-0">Input</span>
          <code className="bg-slate-100 text-slate-700 px-1.5 rounded font-mono">{tech.essentials.carrier_in}</code>
        </div>
      )}
      {tech.essentials?.carrier && (
        <div className="flex gap-2">
          <span className="text-slate-400 w-14 flex-shrink-0">Carrier</span>
          <code className="bg-slate-100 text-slate-700 px-1.5 rounded font-mono">{tech.essentials.carrier}</code>
        </div>
      )}
      {tech.constraints?.energy_eff && (
        <div className="flex gap-2">
          <span className="text-slate-400 w-14 flex-shrink-0">Efficiency</span>
          <span className="text-slate-600">{(tech.constraints.energy_eff * 100).toFixed(0)}%</span>
        </div>
      )}
      {tech.constraints?.lifetime && (
        <div className="flex gap-2">
          <span className="text-slate-400 w-14 flex-shrink-0">Lifetime</span>
          <span className="text-slate-600">{tech.constraints.lifetime} yr</span>
        </div>
      )}
    </div>
    {tech.costs?.monetary && (
      <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-1 text-xs">
        {tech.costs.monetary.energy_cap  && <div><span className="text-slate-400">CAPEX </span><span className="text-slate-600">${tech.costs.monetary.energy_cap}/kW</span></div>}
        {tech.costs.monetary.storage_cap && <div><span className="text-slate-400">Storage </span><span className="text-slate-600">${tech.costs.monetary.storage_cap}/kWh</span></div>}
        {tech.costs.monetary.om_annual   && <div><span className="text-slate-400">O&M </span><span className="text-slate-600">${tech.costs.monetary.om_annual}/kW/yr</span></div>}
        {tech.costs.monetary.om_prod     && <div><span className="text-slate-400">Var O&M </span><span className="text-slate-600">${tech.costs.monetary.om_prod}/kWh</span></div>}
      </div>
    )}
  </div>
);

// ─── Constraints & Costs ─────────────────────────────────────────────────────
const ConstraintsSection = () => (
  <div className="space-y-6">
    <div>
      <h2 className="text-xl font-semibold text-slate-800 mb-1">Constraints & Cost Parameters</h2>
      <p className="text-slate-500 text-sm">Technical limits and economic parameters for your technologies.</p>
    </div>

    <div>
      <div className="flex items-center gap-2 mb-3">
        <FiSettings size={13} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">Technical constraints</h3>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {[
          { name: 'energy_cap_max',   type: "number | 'inf'",   description: 'Maximum power capacity in kW.',          example: "energy_cap_max: 100000", notes: "Use 'inf' for unconstrained capacity." },
          { name: 'energy_eff',       type: 'number (0–1)',      description: 'Energy conversion efficiency.',           example: 'energy_eff: 0.4',        notes: 'Coal ~0.4, gas ~0.5, battery ~0.9.' },
          { name: 'energy_ramping',   type: 'number (0–1)',      description: 'Maximum ramp rate per timestep.',         example: 'energy_ramping: 0.6',    notes: 'Limits how quickly output can change.' },
          { name: 'lifetime',         type: 'number (years)',    description: 'Operational lifetime for cost annualisation.', example: 'lifetime: 25',       notes: 'Affects annualised CAPEX calculation.' },
          { name: 'resource',         type: "'inf' | time series", description: 'Available resource at each timestep.', example: "resource: 'inf'",         notes: "'inf' for fuel; array for renewables." },
          { name: 'resource_unit',    type: 'string',            description: 'How resource data is specified.',         example: "resource_unit: 'energy_per_cap'", notes: 'energy_per_cap or energy_per_area.' },
        ].map(c => <ConstraintCard key={c.name} {...c} />)}
      </div>
    </div>

    <div>
      <div className="flex items-center gap-2 mb-3">
        <FiTrendingUp size={13} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">Economic parameters (costs.monetary)</h3>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {[
          { name: 'interest_rate',             type: 'number (0–1)',   description: 'Discount rate for investment.',              example: 'interest_rate: 0.10',              notes: 'Typically 0.07–0.12.' },
          { name: 'energy_cap',                type: '$/kW',           description: 'Capital cost per kW capacity.',              example: 'energy_cap: 1534',                 notes: 'One-time installation cost.' },
          { name: 'storage_cap',               type: '$/kWh',          description: 'Storage capacity cost.',                     example: 'storage_cap: 1556',                notes: 'Only for storage technologies.' },
          { name: 'om_annual',                 type: '$/kW/year',      description: 'Annual fixed O&M cost.',                     example: 'om_annual: 40.74',                 notes: 'Recurring yearly maintenance.' },
          { name: 'om_prod',                   type: '$/kWh',          description: 'Variable O&M per unit of energy produced.',  example: 'om_prod: 0.043',                   notes: 'Cost per generated kWh.' },
          { name: 'energy_cap_per_distance',   type: '$/kW/km',        description: 'Transmission line cost per km.',             example: 'energy_cap_per_distance: 0.91',    notes: 'Transmission technologies only.' },
        ].map(c => <ConstraintCard key={c.name} {...c} />)}
      </div>
    </div>

    {/* Quick Reference */}
    <div className="bg-slate-800 rounded-xl p-5 text-white">
      <div className="flex items-center gap-2 mb-4">
        <FiLayers size={13} className="text-slate-400" />
        <h3 className="text-sm font-semibold">Quick reference: typical values</h3>
      </div>
      <div className="grid md:grid-cols-3 gap-5 text-xs">
        <div>
          <p className="text-slate-400 font-semibold mb-2">Efficiencies</p>
          <ul className="space-y-1 text-slate-300">
            {['Coal: 0.35–0.45', 'Gas: 0.45–0.60', 'Battery: 0.85–0.95', 'Electrolyser: 0.60–0.75', 'Fuel cell: 0.40–0.60'].map(l => <li key={l}>{l}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-slate-400 font-semibold mb-2">Lifetimes</p>
          <ul className="space-y-1 text-slate-300">
            {['Solar PV: 25–30 yr', 'Wind: 20–25 yr', 'Coal / Gas: 30–40 yr', 'Battery: 10–20 yr', 'Transmission: 40–50 yr'].map(l => <li key={l}>{l}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-slate-400 font-semibold mb-2">Interest rates</p>
          <ul className="space-y-1 text-slate-300">
            {['Low risk: 0.05–0.07', 'Medium risk: 0.08–0.10', 'High risk: 0.10–0.15', 'Public sector: 0.03–0.05'].map(l => <li key={l}>{l}</li>)}
          </ul>
        </div>
      </div>
    </div>
  </div>
);

const ConstraintCard = ({ name, type, description, example, notes }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4">
    <div className="flex items-start justify-between mb-1.5">
      <code className="text-xs font-mono font-semibold text-slate-800">{name}</code>
      <code className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-2 flex-shrink-0">{type}</code>
    </div>
    <p className="text-xs text-slate-600 mb-2">{description}</p>
    <div className="bg-slate-50 rounded px-2 py-1.5 mb-1.5">
      <code className="text-[10px] text-slate-600 font-mono">{example}</code>
    </div>
    <p className="text-[10px] text-slate-400 italic">{notes}</p>
  </div>
);

export default ModelStructureTutorial;

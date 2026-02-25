import React, { useState } from "react";
import { 
  FiZap, 
  FiSun, 
  FiWind, 
  FiBattery, 
  FiMapPin,
  FiSettings,
  FiTrendingUp,
  FiArrowRight,
  FiCheckCircle,
  FiAlertCircle
} from "react-icons/fi";
import { TECH_TEMPLATES, PARENT_TYPES } from './TechnologiesData';

export const ModelStructureTutorial = () => {
  const [activeSection, setActiveSection] = useState('overview');

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Model Structure Guide
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Complete reference for building energy system models with Calliope
          </p>
        </div>

        {/* Navigation Pills */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {[
            { id: 'overview', label: 'Overview', icon: FiMapPin },
            { id: 'parents', label: 'Parent Types', icon: FiSettings },
            { id: 'carriers', label: 'Carriers & Demand', icon: FiZap },
            { id: 'supply', label: 'Supply Technologies', icon: FiSun },
            { id: 'storage', label: 'Storage & Conversion', icon: FiBattery },
            { id: 'constraints', label: 'Constraints & Costs', icon: FiTrendingUp }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all ${
                activeSection === tab.id
                  ? 'bg-gray-900 text-white shadow-lg scale-105'
                  : 'bg-white text-gray-600 hover:bg-gray-100 shadow-md hover:shadow-lg'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Sections */}
        <div className="bg-white rounded-3xl shadow-xl p-8 md:p-12">
          {activeSection === 'overview' && <OverviewSection />}
          {activeSection === 'parents' && <ParentTypesSection />}
          {activeSection === 'carriers' && <CarriersSection />}
          {activeSection === 'supply' && <SupplySection />}
          {activeSection === 'storage' && <StorageConversionSection />}
          {activeSection === 'constraints' && <ConstraintsSection />}
        </div>
      </div>
    </div>
  );
};

// Overview Section
const OverviewSection = () => (
  <div className="space-y-8">
    <div className="text-center mb-8">
      <h2 className="text-3xl font-bold text-slate-800 mb-4">Building Your Energy Model</h2>
      <p className="text-lg text-slate-600 max-w-3xl mx-auto">
        Our platform uses the Calliope framework to model energy systems. Every model consists of locations, technologies, and connections.
      </p>
    </div>

    {/* Core Components */}
    <div className="grid md:grid-cols-3 gap-6 mb-12">
      <div className="bg-white rounded-2xl p-6 border-2 border-gray-300">
        <div className="w-14 h-14 bg-gray-800 rounded-xl flex items-center justify-center mb-4">
          <FiMapPin className="text-white text-2xl" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Locations</h3>
        <p className="text-gray-700 mb-4">
          Physical sites where energy technologies are installed. Can be substations, power plants, or demand centers.
        </p>
        <div className="bg-gray-100 rounded-lg p-3 text-sm">
          <span className="font-semibold text-gray-900">Required:</span> name, latitude, longitude
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border-2 border-gray-300">
        <div className="w-14 h-14 bg-gray-700 rounded-xl flex items-center justify-center mb-4">
          <FiZap className="text-white text-2xl" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Technologies</h3>
        <p className="text-gray-700 mb-4">
          Energy generation, storage, conversion, or consumption units attached to locations.
        </p>
        <div className="bg-gray-100 rounded-lg p-3 text-sm">
          <span className="font-semibold text-gray-900">Types:</span> supply, demand, storage, conversion
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border-2 border-gray-300">
        <div className="w-14 h-14 bg-gray-600 rounded-xl flex items-center justify-center mb-4">
          <FiArrowRight className="text-white text-2xl" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Transmission</h3>
        <p className="text-gray-700 mb-4">
          Power lines connecting locations to enable energy transfer across the network.
        </p>
        <div className="bg-gray-100 rounded-lg p-3 text-sm">
          <span className="font-semibold text-gray-900">Options:</span> 11kV - 500kV lines
        </div>
      </div>
    </div>

    {/* Workflow */}
    <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-2xl p-8 border border-slate-200">
      <h3 className="text-2xl font-bold text-slate-800 mb-6 text-center">Model Building Workflow</h3>
      <div className="grid md:grid-cols-4 gap-6">
        {[
          { num: 1, title: 'Define Locations', desc: 'Add substations and sites', color: 'black' },
          { num: 2, title: 'Add Technologies', desc: 'Assign generation/demand', color: 'purple' },
          { num: 3, title: 'Connect Network', desc: 'Draw transmission lines', color: 'green' },
          { num: 4, title: 'Set Parameters', desc: 'Configure constraints', color: 'orange' }
        ].map(step => (
          <div key={step.num} className="text-center">
            <div className={`w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3`}>
              {step.num}
            </div>
            <h4 className="font-bold text-slate-800 mb-1">{step.title}</h4>
            <p className="text-sm text-slate-600">{step.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Parent Types Section
const ParentTypesSection = () => (
  <div className="space-y-6">
    <div className="text-center mb-8">
      <h2 className="text-3xl font-bold text-slate-800 mb-4">Calliope Parent Types</h2>
      <p className="text-lg text-slate-600 max-w-3xl mx-auto">
        Every technology in Calliope belongs to a parent type that defines its fundamental behavior
      </p>
    </div>

    {/* Supply */}
    <ParentTypeCard
      title="supply"
      color="orange"
      description="Conventional energy generation with unlimited or defined fuel resources"
      useCases={['Coal power plants', 'Gas turbines', 'Oil generators', 'Diesel plants']}
      requirements={[
        'Must define carrier_out (what energy it produces)',
        'Requires energy_eff (conversion efficiency)',
        'Can set resource limits or use inf for unlimited'
      ]}
      example={{
        name: 'Coal Plant',
        parent: 'supply',
        carrier_out: 'electricity',
        energy_eff: 0.4,
        resource: 'inf'
      }}
    />

    {/* Supply Plus */}
    <ParentTypeCard
      title="supply_plus"
      color="green"
      description="Renewable energy generation requiring time-series resource availability data"
      useCases={['Solar PV', 'Wind turbines', 'Run-of-river hydro', 'Concentrated solar power (CSP)']}
      requirements={[
        'Must provide resource time series (hourly/daily availability)',
        'Defines carrier_out (typically electricity)',
        'Uses resource_unit to specify energy_per_cap or energy_per_area'
      ]}
      example={{
        name: 'Wind Power',
        parent: 'supply_plus',
        carrier_out: 'electricity',
        resource_unit: 'energy_per_cap',
        resource: '[time series data]'
      }}
    />

    {/* Storage */}
    <ParentTypeCard
      title="storage"
      color="purple"
      description="Energy storage systems that can charge and discharge"
      useCases={['Battery storage', 'Pumped hydro storage', 'Hydrogen storage', 'Thermal storage']}
      requirements={[
        'Defines carrier (type of energy stored)',
        'Requires energy_eff (round-trip efficiency)',
        'Can set energy_cap_per_storage_cap_equals ratio'
      ]}
      example={{
        name: 'Battery',
        parent: 'storage',
        carrier: 'electricity',
        energy_eff: 0.9,
        energy_cap_per_storage_cap_equals: 0.20
      }}
    />

    {/* Conversion Plus */}
    <ParentTypeCard
      title="conversion_plus"
      color="blue"
      description="Multi-carrier conversion technologies (input and output different carriers)"
      useCases={['Electrolyzers (electricity → hydrogen)', 'Fuel cells (hydrogen → electricity)', 'Heat pumps', 'CHP units']}
      requirements={[
        'Defines carrier_in (input energy type)',
        'Defines carrier_out (output energy type)',
        'Requires energy_eff (conversion efficiency)'
      ]}
      example={{
        name: 'Electrolyzer',
        parent: 'conversion_plus',
        carrier_in: 'electricity',
        carrier_out: 'hydrogen',
        energy_eff: 0.7
      }}
    />

    {/* Transmission */}
    <ParentTypeCard
      title="transmission"
      color="slate"
      description="Energy transfer between locations"
      useCases={['Power lines (11kV - 500kV)', 'Gas pipelines', 'Heat networks', 'Hydrogen pipelines']}
      requirements={[
        'Defines carrier (what it transmits)',
        'Optional energy_eff (transmission losses)',
        'Can set energy_cap_max per line'
      ]}
      example={{
        name: '220 kV Line',
        parent: 'transmission',
        carrier: 'electricity',
        energy_eff: 1.0,
        energy_cap_max: 323104
      }}
    />

    {/* Demand */}
    <ParentTypeCard
      title="demand"
      color="red"
      description="Energy consumption requiring time-series demand profiles"
      useCases={['Power demand', 'Heat demand', 'Cooling demand', 'Hydrogen demand']}
      requirements={[
        'Defines carrier (type of energy consumed)',
        'Must provide demand time series data',
        'Sets resource as negative values (consumption)'
      ]}
      example={{
        name: 'Power Demand',
        parent: 'demand',
        carrier: 'electricity',
        resource: '[negative time series]'
      }}
    />
  </div>
);

// Parent Type Card Component
const ParentTypeCard = ({ title, color, description, useCases, requirements, example }) => {
  const colorMap = {
    gray: { bg: 'bg-gray-900', border: 'border-gray-300', text: 'text-gray-900', badge: 'bg-gray-200' },
  };

  const colors = colorMap[color];

  return (
    <div className={`${colors.bg} rounded-2xl p-6 border-2 ${colors.border}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className={`text-2xl font-bold ${colors.text} mb-2`}>{title}</h3>
          <p className="text-slate-700">{description}</p>
        </div>
        <span className={`${colors.badge} ${colors.text} px-4 py-2 rounded-full text-sm font-bold`}>
          Parent Type
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* Use Cases */}
        <div className="bg-white rounded-xl p-4">
          <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
            <FiCheckCircle className={colors.text} />
            Common Technologies
          </h4>
          <ul className="space-y-1">
            {useCases.map((useCase, idx) => (
              <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                <span className="text-slate-400 mt-0.5">•</span>
                {useCase}
              </li>
            ))}
          </ul>
        </div>

        {/* Requirements */}
        <div className="bg-white rounded-xl p-4">
          <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
            <FiAlertCircle className={colors.text} />
            Requirements
          </h4>
          <ul className="space-y-1">
            {requirements.map((req, idx) => (
              <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                <span className="text-slate-400 mt-0.5">•</span>
                {req}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Example */}
      <div className="bg-slate-900 rounded-xl p-4">
        <div className="text-xs text-slate-400 mb-2 font-mono">Example Configuration:</div>
        <pre className="text-sm text-gray-400 font-mono">
{JSON.stringify(example, null, 2)}
        </pre>
      </div>
    </div>
  );
};

// Carriers and Demand Section
const CarriersSection = () => (
  <div className="space-y-8">
    <div className="text-center mb-8">
      <h2 className="text-3xl font-bold text-slate-800 mb-4">Energy Carriers & Demand</h2>
      <p className="text-lg text-slate-600 max-w-3xl mx-auto">
        Carriers define what type of energy flows through your model. Demand technologies consume these carriers.
      </p>
    </div>

    {/* Carriers Grid */}
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
      <CarrierCard
        name="electricity"
        color="gray"
        icon="⚡"
        description="Electric power - the most common carrier"
        examples={['Grid power', 'Solar PV output', 'Wind generation', 'Battery storage']}
        unit="kWh or MWh"
      />
      <CarrierCard
        name="heat"
        color="gray"
        icon="🔥"
        description="Thermal energy for space/water heating"
        examples={['District heating', 'Boiler output', 'Heat pump delivery', 'CHP heat']}
        unit="kWh thermal"
      />
      <CarrierCard
        name="cooling"
        color="gray"
        icon="❄️"
        description="Cooling energy for air conditioning"
        examples={['Air conditioning', 'Industrial cooling', 'District cooling']}
        unit="kWh cooling"
      />
      <CarrierCard
        name="hydrogen"
        color="gray"
        icon="💧"
        description="Hydrogen fuel for energy storage/transport"
        examples={['Electrolyzer output', 'Fuel cell input', 'H2 storage']}
        unit="kg H₂"
      />
      <CarrierCard
        name="gas"
        color="gray"
        icon="🔶"
        description="Natural gas or biogas"
        examples={['Natural gas grid', 'Biogas production', 'Gas turbine fuel']}
        unit="kWh (LHV)"
      />
      <CarrierCard
        name="water"
        color="gray"
        icon="💦"
        description="Water for hydro or other processes"
        examples={['Hydroelectric', 'Water supply', 'Industrial process']}
        unit="m³ or kWh"
      />
    </div>

    {/* Demand Technologies */}
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 border-2 border-gray-200">
      <h3 className="text-2xl font-bold text-slate-800 mb-6">Demand Technologies</h3>
      <p className="text-slate-700 mb-6">
        Demand technologies represent energy consumption. They require time-series data showing how much energy is needed at each time step.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <DemandExample
          name="power_demand"
          carrier="electricity"
          description="Electrical power consumption"
          typical="Residential, commercial, industrial loads"
          timeSeriesExample="[100, 120, 150, 180, 200, ...] kW per hour"
        />
        <DemandExample
          name="heat_demand"
          carrier="heat"
          description="Thermal energy consumption"
          typical="Space heating, water heating, industrial process heat"
          timeSeriesExample="[500, 600, 450, 300, ...] kWh per hour"
        />
        <DemandExample
          name="cooling_demand"
          carrier="cooling"
          description="Cooling energy consumption"
          typical="Air conditioning, refrigeration, data center cooling"
          timeSeriesExample="[200, 250, 300, 350, ...] kWh per hour"
        />
        <DemandExample
          name="h2_demand"
          carrier="hydrogen"
          description="Hydrogen consumption"
          typical="Fuel cell vehicles, industrial processes, steel production"
          timeSeriesExample="[50, 60, 55, 70, ...] kg H₂ per hour"
        />
      </div>

      <div className="mt-6 bg-gray-100 rounded-xl p-6">
        <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <FiAlertCircle className="text-gray-600" />
          Important Notes for Demand
        </h4>
        <ul className="space-y-2">
          <li className="flex items-start gap-2 text-sm text-gray-700">
            <span className="text-gray-500 mt-0.5">•</span>
            <span>Demand values should be <strong>negative</strong> in the resource time series</span>
          </li>
          <li className="flex items-start gap-2 text-sm text-slate-700">
            <span className="text-gray-500 mt-0.5">•</span>
            <span>Parent type must be <code className="bg-slate-100 px-1 rounded">demand</code></span>
          </li>
          <li className="flex items-start gap-2 text-sm text-slate-700">
            <span className="text-gray-500 mt-0.5">•</span>
            <span>Set <code className="bg-slate-100 px-1 rounded">force_resource: true</code> to make demand profiles mandatory</span>
          </li>
          <li className="flex items-start gap-2 text-sm text-slate-700">
            <span className="text-gray-500 mt-0.5">•</span>
            <span>Match time series resolution with your model timesteps (hourly, daily, etc.)</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
);

// Carrier Card Component
const CarrierCard = ({ name, color, icon, description, examples, unit }) => {
  const colorMap = {
    yellow: 'from-gray-50 to-gray-100 border-gray-300',
    red: 'from-gray-50 to-gray-100 border-gray-300',
    cyan: 'from-gray-50 to-gray-100 border-gray-300',
    blue: 'from-gray-50 to-gray-100 border-gray-300',
    orange: 'from-gray-50 to-gray-100 border-gray-300',
    teal: 'from-gray-50 to-gray-100 border-gray-300'
  };

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} rounded-xl p-5 border-2`}>
      <div className="text-4xl mb-3">{icon}</div>
      <h4 className="text-xl font-bold text-slate-800 mb-2">{name}</h4>
      <p className="text-sm text-slate-700 mb-3">{description}</p>
      <div className="bg-white rounded-lg p-3 mb-3">
        <div className="text-xs font-semibold text-slate-500 mb-1">EXAMPLES:</div>
        <ul className="space-y-1">
          {examples.map((ex, idx) => (
            <li key={idx} className="text-xs text-slate-600">• {ex}</li>
          ))}
        </ul>
      </div>
      <div className="text-xs text-slate-500">
        <span className="font-semibold">Unit:</span> {unit}
      </div>
    </div>
  );
};

// Demand Example Component
const DemandExample = ({ name, carrier, description, typical, timeSeriesExample }) => (
  <div className="bg-white rounded-xl p-5 border border-gray-200">
    <h5 className="font-bold text-slate-800 mb-2">{name}</h5>
    <div className="space-y-2 text-sm">
      <div>
        <span className="font-semibold text-slate-600">Carrier:</span>
        <code className="ml-2 bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{carrier}</code>
      </div>
      <div>
        <span className="font-semibold text-slate-600">Description:</span>
        <p className="text-slate-700 mt-1">{description}</p>
      </div>
      <div>
        <span className="font-semibold text-slate-600">Typical Uses:</span>
        <p className="text-slate-700 mt-1">{typical}</p>
      </div>
      <div className="bg-slate-50 rounded p-2 mt-2">
        <div className="text-xs font-mono text-slate-600">{timeSeriesExample}</div>
      </div>
    </div>
  </div>
);

// Supply Technologies Section
const SupplySection = () => {
  const supplyTechs = TECH_TEMPLATES.supply || [];
  const supplyPlusTechs = TECH_TEMPLATES.supply_plus || [];

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-slate-800 mb-4">Supply Technologies</h2>
        <p className="text-lg text-slate-600 max-w-3xl mx-auto">
          Generation technologies that produce energy in your model
        </p>
      </div>

      {/* Supply (Conventional) */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 border-2 border-gray-200">
        <h3 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="text-3xl">🏭</span>
          Conventional Generation (supply)
        </h3>
        <p className="text-slate-700 mb-6">
          These technologies have controllable output and don't depend on weather or natural resources.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {supplyTechs.slice(0, 6).map((tech) => (
            <TechnologyCard key={tech.name} tech={tech} type="supply" />
          ))}
        </div>
      </div>

      {/* Supply Plus (Renewable) */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 border-2 border-gray-200">
        <h3 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="text-3xl">🌿</span>
          Renewable Generation (supply_plus)
        </h3>
        <p className="text-slate-700 mb-6">
          These technologies depend on time-varying renewable resources (solar, wind, hydro).
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          {supplyPlusTechs.map((tech) => (
            <TechnologyCard key={tech.name} tech={tech} type="supply_plus" />
          ))}
        </div>
      </div>
    </div>
  );
};

// Storage and Conversion Section
const StorageConversionSection = () => {
  const storageTechs = TECH_TEMPLATES.storage || [];
  const conversionTechs = TECH_TEMPLATES.conversion_plus || [];

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-slate-800 mb-4">Storage & Conversion</h2>
        <p className="text-lg text-slate-600 max-w-3xl mx-auto">
          Technologies that store energy or convert between different carriers
        </p>
      </div>

      {/* Storage */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 border-2 border-gray-200">
        <h3 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <FiBattery className="text-gray-600" size={32} />
          Storage Technologies
        </h3>
        <p className="text-slate-700 mb-6">
          Store energy when abundant and release it when needed. Key for balancing renewable energy.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          {storageTechs.map((tech) => (
            <TechnologyCard key={tech.name} tech={tech} type="storage" />
          ))}
        </div>

        <div className="mt-6 bg-white rounded-xl p-6">
          <h4 className="font-bold text-slate-800 mb-3">Storage Key Parameters</h4>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-semibold text-gray-700">energy_cap:</span>
              <p className="text-slate-600">Power capacity (kW) - how fast it charges/discharges</p>
            </div>
            <div>
              <span className="font-semibold text-gray-700">storage_cap:</span>
              <p className="text-slate-600">Energy capacity (kWh) - how much it stores</p>
            </div>
            <div>
              <span className="font-semibold text-gray-700">energy_eff:</span>
              <p className="text-slate-600">Round-trip efficiency (typically 0.85-0.95)</p>
            </div>
            <div>
              <span className="font-semibold text-gray-700">energy_cap_per_storage_cap_equals:</span>
              <p className="text-slate-600">Ratio between power and energy (e.g., 0.25 = 4hr battery)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Conversion */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 border-2 border-gray-200">
        <h3 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="text-3xl">🔄</span>
          Conversion Technologies (conversion_plus)
        </h3>
        <p className="text-slate-700 mb-6">
          Convert one energy carrier to another (e.g., electricity to hydrogen, hydrogen to electricity).
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          {conversionTechs.map((tech) => (
            <TechnologyCard key={tech.name} tech={tech} type="conversion_plus" />
          ))}
        </div>
      </div>
    </div>
  );
};

// Technology Card Component
const TechnologyCard = ({ tech, type }) => {
  return (
    <div className="bg-white rounded-xl p-5 border-2 border-slate-200 hover:shadow-lg transition-shadow">
      <h4 className="text-lg font-bold text-slate-800 mb-2">{tech.essentials?.name || tech.name}</h4>
      <p className="text-sm text-slate-600 mb-3">{tech.description}</p>
      
      <div className="space-y-2 text-xs">
        {tech.essentials?.carrier_out && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Output:</span>
            <code className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{tech.essentials.carrier_out}</code>
          </div>
        )}
        {tech.essentials?.carrier_in && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Input:</span>
            <code className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{tech.essentials.carrier_in}</code>
          </div>
        )}
        {tech.essentials?.carrier && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Carrier:</span>
            <code className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{tech.essentials.carrier}</code>
          </div>
        )}
        {tech.constraints?.energy_eff && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Efficiency:</span>
            <span className="text-slate-600">{(tech.constraints.energy_eff * 100).toFixed(0)}%</span>
          </div>
        )}
        {tech.constraints?.lifetime && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Lifetime:</span>
            <span className="text-slate-600">{tech.constraints.lifetime} years</span>
          </div>
        )}
      </div>

      {tech.costs?.monetary && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="text-xs text-slate-500 mb-1">Cost Parameters:</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {tech.costs.monetary.energy_cap && (
              <div>
                <span className="font-semibold">CAPEX:</span> ${tech.costs.monetary.energy_cap}/kW
              </div>
            )}
            {tech.costs.monetary.storage_cap && (
              <div>
                <span className="font-semibold">Storage:</span> ${tech.costs.monetary.storage_cap}/kWh
              </div>
            )}
            {tech.costs.monetary.om_annual && (
              <div>
                <span className="font-semibold">O&M:</span> ${tech.costs.monetary.om_annual}/kW/yr
              </div>
            )}
            {tech.costs.monetary.om_prod && (
              <div>
                <span className="font-semibold">Var O&M:</span> ${tech.costs.monetary.om_prod}/kWh
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Constraints and Costs Section
const ConstraintsSection = () => (
  <div className="space-y-8">
    <div className="text-center mb-8">
      <h2 className="text-3xl font-bold text-slate-800 mb-4">Constraints & Cost Parameters</h2>
      <p className="text-lg text-slate-600 max-w-3xl mx-auto">
        Define technical limits and economic parameters for your technologies
      </p>
    </div>

    {/* Technical Constraints */}
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 border-2 border-gray-200">
      <h3 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <FiSettings className="text-gray-600" />
        Technical Constraints
      </h3>

      <div className="grid md:grid-cols-2 gap-6">
        <ConstraintCard
          name="energy_cap_max"
          type="number or 'inf'"
          description="Maximum power capacity in kW"
          example="energy_cap_max: 100000"
          notes="Use 'inf' for unlimited capacity"
        />
        <ConstraintCard
          name="energy_eff"
          type="number (0-1)"
          description="Energy conversion efficiency"
          example="energy_eff: 0.4"
          notes="Coal: ~0.4, Gas: ~0.5, Battery: ~0.9"
        />
        <ConstraintCard
          name="energy_ramping"
          type="number (0-1)"
          description="Maximum ramp rate per timestep"
          example="energy_ramping: 0.6"
          notes="Limits how quickly output can change"
        />
        <ConstraintCard
          name="lifetime"
          type="number (years)"
          description="Technology operational lifetime"
          example="lifetime: 25"
          notes="Used for annualized cost calculations"
        />
        <ConstraintCard
          name="resource"
          type="'inf' or time series"
          description="Available resource at each timestep"
          example="resource: 'inf' or [array]"
          notes="'inf' for unlimited, array for renewable resources"
        />
        <ConstraintCard
          name="resource_unit"
          type="string"
          description="How resource data is specified"
          example="resource_unit: 'energy_per_cap'"
          notes="'energy_per_cap' or 'energy_per_area'"
        />
      </div>
    </div>

    {/* Cost Parameters */}
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 border-2 border-gray-200">
      <h3 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <FiTrendingUp className="text-gray-600" />
        Economic Parameters (costs.monetary)
      </h3>

      <div className="grid md:grid-cols-2 gap-6">
        <ConstraintCard
          name="interest_rate"
          type="number (0-1)"
          description="Discount rate for investment"
          example="interest_rate: 0.10"
          notes="Typically 0.07-0.12 (7-12%)"
        />
        <ConstraintCard
          name="energy_cap"
          type="number ($/kW)"
          description="Capital cost per kW capacity"
          example="energy_cap: 1534"
          notes="One-time installation cost"
        />
        <ConstraintCard
          name="storage_cap"
          type="number ($/kWh)"
          description="Storage capacity cost"
          example="storage_cap: 1556"
          notes="Only for storage technologies"
        />
        <ConstraintCard
          name="om_annual"
          type="number ($/kW/year)"
          description="Annual fixed O&M costs"
          example="om_annual: 40.74"
          notes="Recurring yearly maintenance"
        />
        <ConstraintCard
          name="om_prod"
          type="number ($/kWh)"
          description="Variable O&M per energy produced"
          example="om_prod: 0.043"
          notes="Cost per unit of energy generated"
        />
        <ConstraintCard
          name="energy_cap_per_distance"
          type="number ($/kW/km)"
          description="Transmission line cost per distance"
          example="energy_cap_per_distance: 0.91"
          notes="Only for transmission technologies"
        />
      </div>
    </div>

    {/* Quick Reference */}
    <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-2xl p-8 text-white">
      <h3 className="text-2xl font-bold mb-6">Quick Reference: Typical Values</h3>
      <div className="grid md:grid-cols-3 gap-6 text-sm">
        <div>
          <h4 className="font-bold text-gray-300 mb-3">Efficiencies</h4>
          <ul className="space-y-1">
            <li>Coal: 0.35-0.45</li>
            <li>Gas: 0.45-0.60</li>
            <li>Battery: 0.85-0.95</li>
            <li>Electrolyzer: 0.60-0.75</li>
            <li>Fuel Cell: 0.40-0.60</li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold text-gray-300 mb-3">Lifetimes</h4>
          <ul className="space-y-1">
            <li>Solar PV: 25-30 years</li>
            <li>Wind: 20-25 years</li>
            <li>Coal/Gas: 30-40 years</li>
            <li>Battery: 10-20 years</li>
            <li>Transmission: 40-50 years</li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold text-gray-300 mb-3">Interest Rates</h4>
          <ul className="space-y-1">
            <li>Low risk: 0.05-0.07</li>
            <li>Medium risk: 0.08-0.10</li>
            <li>High risk: 0.10-0.15</li>
            <li>Public sector: 0.03-0.05</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
);

// Constraint Card Component
const ConstraintCard = ({ name, type, description, example, notes }) => (
  <div className="bg-white rounded-xl p-5 border border-slate-200">
    <div className="flex items-start justify-between mb-2">
      <h4 className="font-bold text-slate-800">{name}</h4>
      <code className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">{type}</code>
    </div>
    <p className="text-sm text-slate-700 mb-3">{description}</p>
    <div className="bg-slate-50 rounded p-2 mb-2">
      <code className="text-xs text-slate-600">{example}</code>
    </div>
    <p className="text-xs text-slate-500 italic">{notes}</p>
  </div>
);

export default ModelStructureTutorial;

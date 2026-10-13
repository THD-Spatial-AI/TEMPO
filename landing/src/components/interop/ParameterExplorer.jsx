import { useState } from 'react'
import ontology from '../../../../python/parameterOntology.json'
import mapping07 from '../../../../python/calliope07_mapping.json'
import { SRC } from './Diagrams'

const PARAMS = Object.entries(ontology.common)

const TRANSLATOR = {
  pypsa: 'python/pypsa_translate.py',
  osemosys: 'python/osemosys_translate.py',
  adoptnet0: 'python/adoptnet0_translate.py',
}

// Same lookup order as translate_constraints / translate_costs in calliope07_translate.py
function calliope07Name({ kind, name }) {
  if (kind === 'cost') return mapping07.cost_params[name] ? [mapping07.cost_params[name]] : null
  if (mapping07.equals_params[name]) return mapping07.equals_params[name]
  if (mapping07.tech_params[name]) return [mapping07.tech_params[name]]
  return null
}

function scaleText(common, eng) {
  if (eng.scale == null || eng.scale === 1) return null
  return `× ${eng.scale} (${common.unit} → ${eng.unit})`
}

function Row({ engine, children }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-1 sm:gap-6 px-5 py-4">
      <dt className="font-bold text-[14px]">{engine}</dt>
      <dd className="text-[14px] text-on-surface-variant leading-relaxed">{children}</dd>
    </div>
  )
}

function Code({ children }) {
  return <code className="font-mono text-[13px] text-black bg-surface-container-low px-1.5 py-0.5">{children}</code>
}

function NoField({ engine }) {
  return (
    <>
      No single field in the mapping file.{' '}
      <a className="underline underline-offset-2 text-black" href={SRC + TRANSLATOR[engine]} target="_blank" rel="noopener noreferrer">
        See how {TRANSLATOR[engine].split('/')[1]} handles it
      </a>
      .
    </>
  )
}

function MappedEngine({ engine, common }) {
  const eng = common.engines?.[engine]
  if (!eng) return <NoField engine={engine} />
  const scale = scaleText(common, eng)
  return (
    <>
      <Code>{eng.name}</Code>
      {scale && <span className="ml-2">{scale}</span>}
      {eng.note && <span className="block mt-1">{eng.note}</span>}
    </>
  )
}

export default function ParameterExplorer() {
  const [key, setKey] = useState(PARAMS[0][0])
  const common = ontology.common[key]
  const c06 = common.calliope
  const c07 = calliope07Name(c06)
  const extra07 = c06.kind === 'constraint' ? mapping07.parent_extra_params?.storage?.[c06.name] : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] border border-black bg-white">
      <div className="border-b lg:border-b-0 lg:border-r border-black">
        <p id="param-list-label" className="px-5 pt-5 pb-3 text-[13px] text-on-surface-variant">
          {PARAMS.length} common parameters
        </p>
        <div role="group" aria-labelledby="param-list-label" className="flex flex-wrap lg:flex-col lg:flex-nowrap pb-3 lg:pb-5">
          {PARAMS.map(([k, p]) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === key}
              onClick={() => setKey(k)}
              className={`shrink-0 text-left px-5 min-h-[44px] text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-black ${
                k === key ? 'bg-black text-white font-bold' : 'hover:bg-surface-container-low'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite">
        <div className="px-5 py-5 border-b border-black/15">
          <h4 className="text-[1.25rem] font-black tracking-tight">{common.label}</h4>
          <p className="text-[14px] text-on-surface-variant mt-1">{common.description}</p>
          <p className="text-[13px] text-on-surface-variant mt-3">
            Stored in <span className="font-bold text-black">{common.unit}</span>
            {common.oeoField && (
              <>
                {' '}· catalogue field <Code>{common.oeoField}</Code>
              </>
            )}
          </p>
        </div>
        <dl className="divide-y divide-black/15">
          <Row engine="Calliope 0.6.8">
            <Code>{c06.kind === 'cost' ? `costs.monetary.${c06.name}` : `constraints.${c06.name}`}</Code>
            <span className="block mt-1">Written as stored. This is the hub's own field.</span>
          </Row>
          <Row engine="Calliope 0.7">
            {c07 ? (
              <>
                {c07.map((n) => (
                  <Code key={n}>{n}</Code>
                )).reduce((acc, el, i) => (i ? [...acc, ' and ', el] : [el]), [])}
                {extra07 && (
                  <span className="block mt-1">
                    Storage technologies also get <Code>{extra07.join(', ')}</Code>, because Calliope 0.6 applies this
                    efficiency on charge and on discharge.
                  </span>
                )}
              </>
            ) : (
              <>Not mapped. The translator drops it and adds a warning to the run log.</>
            )}
          </Row>
          <Row engine="PyPSA">
            <MappedEngine engine="pypsa" common={common} />
          </Row>
          <Row engine="OSeMOSYS">
            <MappedEngine engine="osemosys" common={common} />
          </Row>
          <Row engine="AdOpT-NET0">
            Translated in code, not in the mapping file.{' '}
            <a className="underline underline-offset-2 text-black" href={SRC + TRANSLATOR.adoptnet0} target="_blank" rel="noopener noreferrer">
              Read adoptnet0_translate.py
            </a>
            .
          </Row>
        </dl>
        <p className="px-5 py-4 border-t border-black/15 text-[12.5px] text-on-surface-variant">
          Read at build time from{' '}
          <a className="underline underline-offset-2" href={SRC + 'python/parameterOntology.json'} target="_blank" rel="noopener noreferrer">parameterOntology.json</a>
          {' '}and{' '}
          <a className="underline underline-offset-2" href={SRC + 'python/calliope07_mapping.json'} target="_blank" rel="noopener noreferrer">calliope07_mapping.json</a>
          , the files the translators load.
        </p>
      </div>
    </div>
  )
}

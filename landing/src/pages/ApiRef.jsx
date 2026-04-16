import Footer from '../components/Footer'

const goEndpoints = [
  { method: 'GET', path: '/api/models', desc: 'List all Calliope models.' },
  { method: 'POST', path: '/api/models', desc: 'Create a new model.' },
  { method: 'GET', path: '/api/models/:id', desc: 'Fetch a model by ID.' },
  { method: 'PUT', path: '/api/models/:id', desc: 'Update a model.' },
  { method: 'DELETE', path: '/api/models/:id', desc: 'Delete a model.' },
  { method: 'GET', path: '/api/locations', desc: 'List all locations for the active model.' },
  { method: 'POST', path: '/api/locations', desc: 'Create a location.' },
  { method: 'DELETE', path: '/api/locations/:id', desc: 'Delete a location.' },
  { method: 'GET', path: '/api/links', desc: 'List all transmission links.' },
  { method: 'POST', path: '/api/links', desc: 'Create a link.' },
  { method: 'GET', path: '/api/technologies', desc: 'List technology templates.' },
  { method: 'GET', path: '/api/timeseries', desc: 'Retrieve time-series data.' },
  { method: 'POST', path: '/api/export/:id', desc: 'Export model as Calliope YAML / ZIP.' },
  { method: 'GET', path: '/api/osm/substations', desc: 'Fetch OSM substations (GeoServer or Overpass fallback).' },
  { method: 'GET', path: '/api/osm/power-plants', desc: 'Fetch OSM power plants.' },
  { method: 'GET', path: '/api/osm/power-lines', desc: 'Fetch OSM transmission lines.' },
]

const calliopeEndpoints = [
  { method: 'GET', path: '/health', desc: 'Service health check. Returns {"status":"ok"}.' },
  { method: 'POST', path: '/run', desc: 'Submit a Calliope model JSON for optimization. Returns {"job_id":"<uuid>"}.' },
  { method: 'GET', path: '/run/:job_id/stream', desc: 'SSE stream of log / done / error events for a running job.' },
  { method: 'DELETE', path: '/run/:job_id', desc: 'Cancel a running job. Returns {"cancelled":"<uuid>"}.' },
]

const methodColor = {
  GET: 'bg-neutral-100 text-neutral-700',
  POST: 'bg-black text-white',
  PUT: 'bg-neutral-800 text-white',
  DELETE: 'bg-neutral-400 text-white',
}

function EndpointTable({ endpoints }) {
  return (
    <div className="w-full border border-neutral-200">
      <div className="grid grid-cols-[80px_1fr_2fr] bg-neutral-100 border-b border-neutral-200">
        <div className="px-4 py-3 font-bold text-[0.625rem] uppercase tracking-widest">Method</div>
        <div className="px-4 py-3 font-bold text-[0.625rem] uppercase tracking-widest">Path</div>
        <div className="px-4 py-3 font-bold text-[0.625rem] uppercase tracking-widest">Description</div>
      </div>
      {endpoints.map((ep, i) => (
        <div
          key={i}
          className="grid grid-cols-[80px_1fr_2fr] border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors"
        >
          <div className="px-4 py-4 flex items-center">
            <span
              className={`font-mono font-black text-[0.625rem] tracking-widest px-2 py-1 ${methodColor[ep.method]}`}
            >
              {ep.method}
            </span>
          </div>
          <div className="px-4 py-4 font-mono text-[0.75rem] text-on-surface-variant self-center break-all">
            {ep.path}
          </div>
          <div className="px-4 py-4 text-[0.8125rem] text-neutral-500 self-center leading-relaxed">
            {ep.desc}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ApiRef() {
  return (
    <div className="bg-surface text-primary">
      <main className="pt-16">

        {/* Header */}
        <section className="px-8 py-24 bg-surface-container-lowest border-b border-outline-variant/20">
          <div className="max-w-7xl mx-auto">
            <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
              Reference
            </p>
            <h1 className="text-[3.5rem] md:text-[4.5rem] font-black tracking-[-0.03em] leading-none mb-6">
              API REFERENCE
            </h1>
            <p className="text-on-surface-variant text-[1rem] max-w-2xl leading-relaxed">
              Two HTTP services power TEMPO. The Go backend handles all model persistence and OSM
              data; the Python FastAPI service runs Calliope optimizations with SSE streaming.
            </p>
          </div>
        </section>

        {/* Services overview */}
        <section className="px-8 py-12 bg-black text-white">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-px bg-white/10">
            <div className="p-10">
              <p className="font-bold text-[0.6875rem] uppercase tracking-widest text-white/50 mb-2">Service 1</p>
              <h3 className="font-black text-xl uppercase mb-2">Go Backend</h3>
              <p className="text-[0.8125rem] text-white/60 mb-4">Model storage, OSM data proxy, export engine.</p>
              <div className="font-mono text-[0.75rem] bg-white/10 px-4 py-2 inline-block">
                http://localhost:8082
              </div>
            </div>
            <div className="p-10">
              <p className="font-bold text-[0.6875rem] uppercase tracking-widest text-white/50 mb-2">Service 2</p>
              <h3 className="font-black text-xl uppercase mb-2">Calliope FastAPI</h3>
              <p className="text-[0.8125rem] text-white/60 mb-4">Optimization runner with SSE streaming. Docker or local.</p>
              <div className="font-mono text-[0.75rem] bg-white/10 px-4 py-2 inline-block">
                http://localhost:5000
              </div>
            </div>
          </div>
        </section>

        {/* Go API */}
        <section className="px-8 py-24 bg-surface">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-6 mb-10">
              <span className="material-symbols-outlined text-3xl">storage</span>
              <div>
                <p className="font-bold text-[0.6875rem] uppercase tracking-widest text-outline">Go + Gin + SQLite</p>
                <h2 className="font-black text-2xl uppercase tracking-tight">Go Backend — Port 8082</h2>
              </div>
            </div>
            <EndpointTable endpoints={goEndpoints} />
          </div>
        </section>

        {/* Calliope service API */}
        <section className="px-8 py-24 bg-surface-container-lowest border-t border-outline-variant/20">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-6 mb-10">
              <span className="material-symbols-outlined text-3xl">sensors</span>
              <div>
                <p className="font-bold text-[0.6875rem] uppercase tracking-widest text-outline">FastAPI + Uvicorn + SSE</p>
                <h2 className="font-black text-2xl uppercase tracking-tight">Calliope Service — Port 5000</h2>
              </div>
            </div>
            <EndpointTable endpoints={calliopeEndpoints} />

            {/* SSE format note */}
            <div className="mt-12">
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                SSE Event Format
              </p>
              <div className="bg-black text-[#E2E2E2] p-8 font-mono text-[0.75rem] space-y-1">
                <div><span className="text-neutral-400">// Log line during optimization</span></div>
                <div>{'data: {"type":"log","message":"CBC solver: gap 1.2%"}'}</div>
                <div className="pt-2"><span className="text-neutral-400">// Completed event</span></div>
                <div>{'data: {"type":"done","results":{...}}'}</div>
                <div className="pt-2"><span className="text-neutral-400">// Error event</span></div>
                <div>{'data: {"type":"error","message":"Infeasible model"}'}</div>
              </div>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}

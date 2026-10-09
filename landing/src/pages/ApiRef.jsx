import Footer from '../components/Footer'

const DOCS_API = 'https://thd-spatial-ai.github.io/TEMPO/reference/api-endpoints/'

const services = [
  { name: 'Go Backend', port: 8082, desc: 'Model storage, run history, OSM data and geocoding.' },
  { name: 'Calliope 0.6.8', port: 5000, desc: 'Default Calliope engine. Supports SPORES.' },
  { name: 'AdOpT-NET0', port: 5001, desc: 'AdOpT-NET0 runner, plus import and export.' },
  { name: 'Calliope 0.7', port: 5002, desc: 'Same service as 0.6.8, started with the 0.7 runner.' },
  { name: 'PyPSA', port: 5003, desc: 'PyPSA runner using HiGHS, plus import and export.' },
  { name: 'OSeMOSYS', port: 5004, desc: 'otoole + GLPK runner, plus import and export.' },
]

const goEndpoints = [
  { method: 'GET', path: '/api/health', desc: 'Health check.' },
  { method: 'GET', path: '/api/models', desc: 'List saved models.' },
  { method: 'POST', path: '/api/models', desc: 'Save a new model.' },
  { method: 'GET', path: '/api/models/:id', desc: 'Fetch one model.' },
  { method: 'PUT', path: '/api/models/:id', desc: 'Update a model.' },
  { method: 'DELETE', path: '/api/models/:id', desc: 'Delete a model.' },
  { method: 'POST', path: '/api/models/:id/run', desc: 'Start an optimization through the Calliope service.' },
  { method: 'GET', path: '/api/jobs/:id', desc: 'Status of a job started above.' },
  { method: 'GET', path: '/api/jobs/:id/results', desc: 'Results of a finished job.' },
  { method: 'POST', path: '/api/completed-runs', desc: 'Store a finished run so it shows up in Results later.' },
  { method: 'GET', path: '/api/completed-runs', desc: 'List stored runs.' },
  { method: 'DELETE', path: '/api/completed-runs/:id', desc: 'Delete a stored run.' },
  { method: 'GET', path: '/api/osm/layers', desc: 'Names of the OSM layers the backend can serve.' },
  { method: 'GET', path: '/api/osm/regions', desc: 'Regions already loaded into PostGIS. Empty list if GeoServer is not running.' },
  { method: 'GET', path: '/api/osm/regions-db', desc: 'The Geofabrik region catalogue used by the region picker.' },
  { method: 'POST', path: '/api/osm/download', desc: 'Download and import a Geofabrik region. Streams log and done events.' },
  { method: 'GET', path: '/api/osm/:layer', desc: 'GeoJSON for one OSM layer. Optional bbox=minLon,minLat,maxLon,maxLat.' },
  { method: 'GET', path: '/api/overpass/power', desc: 'Power infrastructure straight from Overpass, for when PostGIS is not available. Takes bbox and kind=lines|substations|plants.' },
  { method: 'GET', path: '/api/geocode', desc: 'Place search. q is free text, e.g. "Santiago, Chile".' },
  { method: 'GET', path: '/tech/health', desc: 'Health of the OpenTech-DB API behind the proxy.' },
  { method: 'ANY', path: '/tech/api/v1/*', desc: 'Proxy to the OpenTech-DB API.' },
]

const engineEndpoints = [
  { method: 'GET', path: '/health', desc: 'Health check. Returns {"status":"ok","engine":...}.' },
  { method: 'POST', path: '/run', desc: 'Submit a model as JSON. Returns {"job_id":"<uuid>"}.' },
  { method: 'GET', path: '/run/:job_id/stream', desc: 'Server-Sent Events for the job: log, stats, done and error.' },
  { method: 'GET', path: '/run/:job_id/result', desc: 'Full result once the job is done, including the large timeseries.' },
  { method: 'DELETE', path: '/run/:job_id', desc: 'Cancel a job. Returns {"cancelled":"<uuid>"}. The solver may keep running in the background, but its result is thrown away.' },
]

const formatEndpoints = [
  { method: 'POST', path: '/export', desc: 'Send a TEMPO model as JSON, get back a ZIP in the engine\'s own format.' },
  { method: 'POST', path: '/import', desc: 'Send a ZIP in the engine\'s format, get back {"model":{...},"report":[...]}.' },
]

const methodColor = {
  GET: 'bg-neutral-100 text-neutral-700',
  POST: 'bg-black text-white',
  PUT: 'bg-neutral-800 text-white',
  DELETE: 'bg-neutral-400 text-white',
  ANY: 'border border-black text-black',
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
            <p className="text-on-surface-variant text-[1rem] max-w-2xl leading-relaxed mb-4">
              The desktop app talks to a Go backend and one small Python service per engine, all
              over HTTP on your own machine. You only need these endpoints if you work on TEMPO
              itself or want to script against a running copy.
            </p>
            <p className="text-on-surface-variant text-[1rem] max-w-2xl leading-relaxed">
              The ports below are defaults. If one is taken, TEMPO picks the next free port at
              startup, so don't hard-code them.
            </p>
          </div>
        </section>

        {/* Services overview */}
        <section className="px-8 py-12 bg-black text-white">
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10">
            {services.map((s) => (
              <div key={s.name} className="p-10 bg-black">
                <h3 className="font-black text-xl uppercase mb-2">{s.name}</h3>
                <p className="text-[0.8125rem] text-white/60 mb-4">{s.desc}</p>
                <div className="font-mono text-[0.75rem] bg-white/10 px-4 py-2 inline-block">
                  http://localhost:{s.port}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Go API */}
        <section className="px-8 py-24 bg-surface">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-6 mb-10">
              <span className="material-symbols-outlined text-3xl">storage</span>
              <div>
                <p className="font-bold text-[0.6875rem] uppercase tracking-widest text-outline">Go + Gin + SQLite</p>
                <h2 className="font-black text-2xl uppercase tracking-tight">Go Backend · Port 8082</h2>
              </div>
            </div>
            <EndpointTable endpoints={goEndpoints} />
          </div>
        </section>

        {/* Engine services API */}
        <section className="px-8 py-24 bg-surface-container-lowest border-t border-outline-variant/20">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-6 mb-4">
              <span className="material-symbols-outlined text-3xl">sensors</span>
              <div>
                <p className="font-bold text-[0.6875rem] uppercase tracking-widest text-outline">FastAPI + Uvicorn + SSE</p>
                <h2 className="font-black text-2xl uppercase tracking-tight">Engine Services · Ports 5000 to 5004</h2>
              </div>
            </div>
            <p className="text-[0.875rem] text-neutral-500 max-w-2xl leading-relaxed mb-10">
              All five engine services share the same run endpoints, and they all return results
              in the same JSON shape, so a client written for one works with the others.
            </p>
            <EndpointTable endpoints={engineEndpoints} />

            {/* SSE format note */}
            <div className="mt-12">
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                SSE Event Format
              </p>
              <div className="bg-black text-[#E2E2E2] p-8 font-mono text-[0.75rem] space-y-1 overflow-x-auto">
                <div><span className="text-neutral-400">// One line of solver output</span></div>
                <div>{'data: {"type":"log","line":"Running optimisation with solver=cbc …"}'}</div>
                <div className="pt-2"><span className="text-neutral-400">// Elapsed time and resource use, sent periodically</span></div>
                <div>{'data: {"type":"stats","elapsed":"42s","cpu_pct":87.5,"proc_ram_mb":812.3,...}'}</div>
                <div className="pt-2"><span className="text-neutral-400">// Finished. Carries a summary; fetch /run/:job_id/result for the full data</span></div>
                <div>{'data: {"type":"done","result":{...}}'}</div>
                <div className="pt-2"><span className="text-neutral-400">// Failed</span></div>
                <div>{'data: {"type":"error","error":"...","traceback":"..."}'}</div>
              </div>
            </div>

            {/* Import / export */}
            <div className="mt-16">
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-2">
                Import &amp; Export
              </p>
              <p className="text-[0.875rem] text-neutral-500 max-w-2xl leading-relaxed mb-6">
                The PyPSA, OSeMOSYS and AdOpT-NET0 services can also convert models to and from
                their native formats. Calliope import and export happen in the app itself.
              </p>
              <EndpointTable endpoints={formatEndpoints} />
            </div>

            <p className="mt-16 text-[0.8125rem] text-neutral-500">
              Request and response examples for the Go backend are in the{' '}
              <a href={DOCS_API} target="_blank" rel="noopener noreferrer" className="text-black underline hover:opacity-70">
                full API docs
              </a>.
            </p>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}

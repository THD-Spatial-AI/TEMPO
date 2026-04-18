import React, { useState, useEffect, useRef } from 'react';
import {
  FiDownloadCloud,
  FiChevronDown,
  FiChevronRight,
  FiCheckCircle,
  FiAlertCircle,
  FiLoader,
  FiGlobe,
  FiDatabase,
  FiRefreshCw,
  FiX,
} from 'react-icons/fi';
import { api } from '../services/api';

// ── helpers ─────────────────────────────────────────────────────────────────

function groupByContinent(countries) {
  const map = {};
  for (const [name, data] of Object.entries(countries)) {
    const cont = data.continent || 'Other';
    if (!map[cont]) map[cont] = [];
    map[cont].push({ name, ...data });
  }
  return map;
}

// ── sub-components ───────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  if (!status) return null;
  const styles = {
    running:  'bg-blue-100 text-blue-700',
    done:     'bg-green-100 text-green-700',
    error:    'bg-red-100 text-red-700',
  };
  const icons = {
    running: <FiLoader className="animate-spin" size={13} />,
    done:    <FiCheckCircle size={13} />,
    error:   <FiAlertCircle size={13} />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] || ''}`}>
      {icons[status]}
      {status === 'running' ? 'Importing…' : status === 'done' ? 'Done' : 'Error'}
    </span>
  );
};

// ── main component ───────────────────────────────────────────────────────────

const OSMDownloader = () => {
  const [regionsDB, setRegionsDB] = useState(null);   // full geofabrik DB
  const [loadedRegions, setLoadedRegions] = useState([]); // already in PostGIS
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  // selection state
  const [selectedContinent, setSelectedContinent] = useState('');
  const [selectedCountry, setSelectedCountry]     = useState('');
  const [selectedRegion, setSelectedRegion]       = useState('');
  const [expandedContinent, setExpandedContinent] = useState('');

  // download / log state
  const [downloadStatus, setDownloadStatus] = useState(null); // null | 'running' | 'done' | 'error'
  const [logLines, setLogLines] = useState([]);
  const logRef = useRef(null);
  const abortRef = useRef(null);

  // ── load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [db, loaded] = await Promise.all([
          api.getRegionsDatabase(),
          api.getLoadedRegions(),
        ]);
        if (!mounted) return;
        setRegionsDB(db);
        setLoadedRegions(loaded.regions || []);
      } catch (e) {
        if (mounted) setLoadError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  // ── derived data ─────────────────────────────────────────────────────────
  const continentMap = regionsDB ? groupByContinent(regionsDB.countries) : {};
  const sortedContinents = Object.keys(continentMap).sort();

  const countryData = selectedCountry && regionsDB
    ? regionsDB.countries[selectedCountry]
    : null;

  const isLoaded = (continent, country, region = '') => {
    const path = region
      ? `${continent}/${country}/${region}`
      : `${continent}/${country}`;
    return loadedRegions.some(r => r === path || r.startsWith(path + '/'));
  };

  // ── download ─────────────────────────────────────────────────────────────
  const startDownload = async () => {
    if (!selectedContinent || !selectedCountry) return;
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setDownloadStatus('running');
    setLogLines([]);

    try {
      const res = await api.downloadOSMRegionStream(
        selectedContinent,
        selectedCountry,
        selectedRegion,
      );

      if (!res.ok) {
        const err = await res.text();
        setDownloadStatus('error');
        setLogLines([`Server error: ${err}`]);
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop(); // incomplete line stays in buffer

        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            const evt = JSON.parse(json);
            if (evt.type === 'log') {
              setLogLines(prev => [...prev, evt.message]);
            } else if (evt.type === 'done') {
              setDownloadStatus('done');
              // refresh loaded-regions list
              api.getLoadedRegions().then(r => setLoadedRegions(r.regions || []));
            } else if (evt.type === 'error') {
              setDownloadStatus('error');
              setLogLines(prev => [...prev, `ERROR: ${evt.message}`]);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setDownloadStatus('error');
        setLogLines(prev => [...prev, `Connection error: ${e.message}`]);
      }
    }
  };

  const cancelDownload = () => {
    abortRef.current?.abort();
    setDownloadStatus(null);
  };

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <FiLoader className="animate-spin text-electric-500" size={32} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 text-center">
        <FiAlertCircle size={32} className="mx-auto text-red-400 mb-3" />
        <p className="text-sm text-slate-600">{loadError}</p>
        <p className="text-xs text-slate-400 mt-1">Make sure the Go backend is running.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── header ── */}
      <div className="px-6 py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-electric-500 to-electric-600 flex items-center justify-center shadow-sm">
            <FiDownloadCloud size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">GIS Data Download</h1>
            <p className="text-xs text-slate-500">Import OSM power-infrastructure data by country or region</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── left panel: country selector ── */}
        <div className="w-72 border-r border-slate-200 bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Region</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sortedContinents.map(continent => (
              <div key={continent}>
                {/* continent row */}
                <button
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                  onClick={() => setExpandedContinent(p => p === continent ? '' : continent)}
                >
                  <FiGlobe size={14} className="text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-sm font-semibold text-slate-700">{continent}</span>
                  {expandedContinent === continent
                    ? <FiChevronDown size={14} className="text-slate-400" />
                    : <FiChevronRight size={14} className="text-slate-400" />}
                </button>

                {expandedContinent === continent && (
                  <div>
                    {continentMap[continent].map(c => {
                      const loaded = isLoaded(continent, c.name);
                      const active = selectedCountry === c.name;
                      return (
                        <button
                          key={c.name}
                          className={`w-full flex items-center gap-2 pl-8 pr-4 py-2 text-sm text-left transition-colors ${
                            active
                              ? 'bg-electric-50 text-electric-700 font-semibold'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                          onClick={() => {
                            setSelectedContinent(continent);
                            setSelectedCountry(c.name);
                            setSelectedRegion('');
                          }}
                        >
                          <span className="flex-1">{c.name}</span>
                          {loaded && <FiCheckCircle size={13} className="text-green-500 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* already loaded */}
          {loadedRegions.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <FiDatabase size={13} className="text-green-500" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loaded</p>
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {loadedRegions.map(r => (
                  <p key={r} className="text-xs text-green-700 bg-green-50 rounded px-2 py-0.5">{r}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── right panel: detail + download ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedCountry ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <FiGlobe size={40} className="text-slate-200 mb-4" />
              <p className="text-sm font-medium text-slate-500">Select a country from the list</p>
              <p className="text-xs text-slate-400 mt-1">OSM power infrastructure data will be downloaded and imported into PostGIS / GeoServer.</p>
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-y-auto p-6 gap-5">
              {/* country header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{selectedCountry}</h2>
                  <p className="text-sm text-slate-500">{selectedContinent}</p>
                  {isLoaded(selectedContinent, selectedCountry) && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full mt-1">
                      <FiCheckCircle size={11} /> In database
                    </span>
                  )}
                </div>
                {downloadStatus && (
                  <StatusBadge status={downloadStatus} />
                )}
              </div>

              {/* region selector (if country has sub-regions) */}
              {countryData?.has_regions && countryData.regions?.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Sub-region (optional)
                  </label>
                  <select
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-electric-500"
                    value={selectedRegion}
                    onChange={e => setSelectedRegion(e.target.value)}
                  >
                    <option value="">— Entire country —</option>
                    {countryData.regions.map(r => (
                      <option key={r.url_name} value={r.name}>
                        {r.name}
                        {isLoaded(selectedContinent, selectedCountry, r.name) ? ' ✓' : ''}
                      </option>
                    ))}
                  </select>
                  {countryData.note && (
                    <p className="text-xs text-slate-400 mt-1">{countryData.note}</p>
                  )}
                </div>
              )}

              {/* info box */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">What will be downloaded?</p>
                <p>Power substations, plants, transmission lines, and admin boundaries from OpenStreetMap via Geofabrik.</p>
                <p>Data is automatically uploaded to PostGIS and made available in GeoServer for map layers and model creation.</p>
                <p className="text-blue-500">Large countries (e.g. Germany full) can take 5–15 minutes.</p>
              </div>

              {/* action button */}
              {downloadStatus !== 'running' ? (
                <button
                  onClick={startDownload}
                  disabled={!selectedCountry}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-electric-500 to-electric-600 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FiDownloadCloud size={18} />
                  {downloadStatus === 'done' ? 'Re-import' : (
                    selectedRegion
                      ? `Download ${selectedCountry} / ${selectedRegion}`
                      : `Download ${selectedCountry}`
                  )}
                </button>
              ) : (
                <button
                  onClick={cancelDownload}
                  className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition-all"
                >
                  <FiX size={16} /> Cancel
                </button>
              )}

              {/* log output */}
              {logLines.length > 0 && (
                <div className="flex-1 min-h-0">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Import Log</p>
                    <button
                      className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                      onClick={() => setLogLines([])}
                    >
                      <FiRefreshCw size={11} /> Clear
                    </button>
                  </div>
                  <div
                    ref={logRef}
                    className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-300 overflow-y-auto max-h-80 space-y-0.5"
                  >
                    {logLines.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.startsWith('ERROR') || line.startsWith('✗')
                            ? 'text-red-400'
                            : line.startsWith('✓') || line.includes('complete')
                            ? 'text-green-400'
                            : line.startsWith('📥') || line.startsWith('⬆') || line.startsWith('🔧')
                            ? 'text-cyan-300'
                            : 'text-slate-300'
                        }
                      >
                        {line}
                      </div>
                    ))}
                    {downloadStatus === 'running' && (
                      <div className="flex items-center gap-1.5 text-blue-400 mt-1">
                        <FiLoader className="animate-spin" size={12} /> Running…
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OSMDownloader;

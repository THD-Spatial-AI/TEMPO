import React, { Suspense, lazy, useState, useEffect } from "react";
import { DataProvider, useData } from "./context/DataContext";
import Sidebar from "./components/Sidebar";
import ErrorBoundary from "./components/ErrorBoundary";
// Dashboard is the initial view — load eagerly
import Dashboard from "./components/Dashboard";
// All other views are lazy-loaded to reduce initial bundle size (LCP/INP fix)
const Tutorial = lazy(() => import("./components/Tutorial"));
const Models = lazy(() => import("./components/Models"));
const MapView = lazy(() => import("./components/MapView"));
const Creation = lazy(() => import("./components/Creation"));
const Locations = lazy(() => import("./components/Locations"));
const Links = lazy(() => import("./components/Links"));
const Overrides = lazy(() => import("./components/Overrides"));
const Scenarios = lazy(() => import("./components/Scenarios"));
const Parameters = lazy(() => import("./components/Parameters"));
const Technologies = lazy(() => import("./components/Technologies"));
const TimeSeries = lazy(() => import("./components/TimeSeries"));
const Settings = lazy(() => import("./components/Settings"));
const Export = lazy(() => import("./components/Export"));
const Run = lazy(() => import("./components/Run"));
const Results = lazy(() => import("./components/Results"));
const SetupScreen = lazy(() => import("./components/SetupScreen"));
const HydrogenPlantDashboard = lazy(() => import("./components/HydrogenPlantDashboard"));

function AppContent() {
  const [selected, setSelected] = useState("Dashboard");
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const { isDirty, saveNow, locations, links, timeSeries, overrides, scenarios, technologies, currentModelId, showNotification } = useData();

  // Screens that carry editable model data — navigating away always asks to save
  // when a model is loaded (currentModelId is set).
  const EDITING_VIEWS = new Set([
    'Locations', 'Links', 'TimeSeries', 'Overrides', 'Scenarios', 'Technologies',
    'Tech Database', 'Parameters', 'Creation',
  ]);

  // Global Ctrl+S save shortcut
  React.useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (currentModelId && EDITING_VIEWS.has(selected)) {
          saveNow();
          showNotification('Model saved.', 'success');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModelId, selected, saveNow]);

  const handleNavigation = (newView) => {
    // Always intercept when leaving an editing screen that has a model loaded.
    // The user should consciously decide whether to save before leaving.
    if (currentModelId && EDITING_VIEWS.has(selected) && newView !== selected) {
      setPendingNavigation(newView);
    } else {
      setSelected(newView);
    }
  };

  const confirmNavigation = () => {
    if (pendingNavigation) {
      setSelected(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  const cancelNavigation = () => {
    setPendingNavigation(null);
  };

  const handleSaveAndNavigate = () => {
    saveNow();
    showNotification('Changes saved.', 'success');
    confirmNavigation();
  };

  const renderContent = () => {
    // Switch pattern avoids creating React elements for inactive views (INP fix)
    switch (selected) {
      case "Dashboard":      return <Dashboard />;
      case "Tutorial":       return <Tutorial />;
      case "Models":         return <Models />;
      case "Map View":       return <MapView />;
      case "Creation":       return <Creation />;
      case "Locations":      return <Locations />;
      case "Links":          return <Links />;
      case "Overrides":      return <Overrides />;
      case "Scenarios":      return <Scenarios />;
      case "Parameters":     return <Parameters />;
      case "Technologies":   return <Technologies />;
      case "Tech Database":  return <Technologies />;
      case "TimeSeries":     return <TimeSeries />;
      case "Settings":       return <Settings />;
      case "Run":            return <Run onNavigate={handleNavigation} />;
      case "Results":        return <Results />;
      case "Export":         return <Export />;
      case "Tech Simulator": return <HydrogenPlantDashboard />;
      default:               return <Dashboard />;
    }
  };

  return (
    <>
      {/* Skip link — keyboard users jump past sidebar (WCAG 2.4.1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[99999] focus:px-4 focus:py-2 focus:bg-electric-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      <div className="flex h-screen overflow-hidden relative">
        {/* Animated background accent — will-change hints allow GPU compositing (paint perf fix) */}
        <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-0 right-0 w-96 h-96 bg-electric-500/5 rounded-full blur-3xl animate-pulse-slow" style={{ willChange: 'opacity' }}></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-gray-500/5 rounded-full blur-3xl animate-pulse-slow" style={{ willChange: 'opacity', animationDelay: '1s' }}></div>
        </div>
        
        <Sidebar selected={selected} setSelected={handleNavigation} />
        
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto relative z-10">
          {/* Suspense boundary for lazy-loaded view chunks */}
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="w-8 h-8 border-4 border-gray-600 border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <div className="animate-fadeIn">
              {renderContent()}
            </div>
          </Suspense>
        </main>
      </div>

      {/* ── Navigation guard ─────────────────────────────────────────── */}
      {pendingNavigation && currentModelId && EDITING_VIEWS.has(selected) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 border border-slate-200">

            {/* Header */}
            <div className="flex items-center gap-3 p-6 border-b border-slate-100">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDirty ? 'bg-amber-100' : 'bg-blue-100'}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                     className={isDirty ? 'text-amber-600' : 'text-blue-600'}>
                  {isDirty
                    ? <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>
                    : <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>
                  }
                </svg>
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {isDirty ? 'Unsaved changes' : 'Save before leaving?'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isDirty
                    ? `You're leaving ${selected} without saving`
                    : `Your last changes were auto-saved`}
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              {isDirty ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-700">These items have pending changes:</p>
                  <ul className="text-xs text-slate-500 space-y-1 ml-1 mt-2">
                    {locations.length > 0     && <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/>{locations.length} location{locations.length !== 1 ? 's' : ''}</li>}
                    {links.length > 0         && <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/>{links.length} link{links.length !== 1 ? 's' : ''}</li>}
                    {timeSeries.length > 0    && <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/>{timeSeries.length} time series</li>}
                    {Object.keys(overrides).length > 0  && <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/>{Object.keys(overrides).length} override{Object.keys(overrides).length !== 1 ? 's' : ''}</li>}
                    {Object.keys(scenarios).length > 0  && <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/>{Object.keys(scenarios).length} scenario{Object.keys(scenarios).length !== 1 ? 's' : ''}</li>}
                    {technologies.length > 0  && <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/>{technologies.length} technolog{technologies.length !== 1 ? 'ies' : 'y'}</li>}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  Your model changes have been auto-saved. You can also click{' '}
                  <strong>Save &amp; leave</strong> to make a manual save before continuing.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="p-6 pt-0 flex gap-2 justify-end flex-wrap">
              <button
                onClick={cancelNavigation}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Stay here
              </button>
              <button
                onClick={confirmNavigation}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Leave
              </button>
              <button
                onClick={handleSaveAndNavigate}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm transition-colors"
              >
                Save &amp; leave
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function App() {
  // 'checking' | 'setup' | 'ready'
  const [appState, setAppState] = useState('checking');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.getDockerStatus().then(result => {
        const allReady = result.dockerAvailable &&
          (result.services || []).filter(s => s.required).every(s => s.running);
        setAppState(allReady ? 'ready' : 'setup');
      }).catch(() => {
        // If check fails (e.g. non-Electron browser), skip setup
        setAppState('ready');
      });
    } else {
      // Browser / dev mode without Electron — skip setup
      setAppState('ready');
    }
  }, []);

  if (appState === 'checking') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (appState === 'setup') {
    return <SetupScreen onComplete={() => setAppState('ready')} />;
  }

  return (
    <ErrorBoundary>
      <DataProvider>
        <AppContent />
      </DataProvider>
    </ErrorBoundary>
  );
}

export default App;

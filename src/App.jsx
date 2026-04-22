import React, { Suspense, lazy, useState, useEffect } from "react";
import { DataProvider, useData } from "./context/DataContext";
import Sidebar from "./components/Sidebar";
import ErrorBoundary from "./components/ErrorBoundary";
import PrivacyDialog from "./components/PrivacyDialog";
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
    // Only intercept navigation when there are genuinely unsaved changes.
    // Auto-save runs after 1.5s — when isDirty=false the model is already saved.
    if (isDirty && currentModelId && EDITING_VIEWS.has(selected) && newView !== selected) {
      setPendingNavigation(newView);
    } else {
      setSelected(newView);
    }
  };

  const confirmNavigation = () => {
    if (pendingNavigation) {
      // Always flush current state to models array before navigating so data
      // is not lost even if the 1.5 s auto-save debounce hasn't fired yet.
      saveNow();
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

      {/* ── Navigation guard — only shown when isDirty=true ─────────── */}
      {pendingNavigation && isDirty && currentModelId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-slate-200">

            {/* Header */}
            <div className="flex items-center gap-3 p-6 border-b border-slate-100">
              <span className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Unsaved changes</h3>
                <p className="text-xs text-slate-500 mt-0.5">You're leaving <span className="font-medium text-slate-700">{selected}</span> with unsaved edits</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-4">
              <p className="text-sm text-slate-600">
                Your changes haven't been saved yet. Save now to make sure nothing is lost.
              </p>
            </div>

            {/* Actions */}
            <div className="p-6 pt-0 flex gap-2 justify-end">
              <button
                onClick={cancelNavigation}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Stay here
              </button>
              <button
                onClick={confirmNavigation}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                title="Leave without an explicit save — auto-save will still run in ~1.5 s"
              >
                Leave anyway
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
  const [consentGiven, setConsentGiven] = useState(true); // optimistic; corrected after check

  // Check whether the user has already accepted the privacy notice.
  // In non-Electron (browser dev) environments the API is absent — skip the check.
  useEffect(() => {
    if (!window.electronAPI?.getPrivacyConsent) return;
    window.electronAPI.getPrivacyConsent().then(({ accepted }) => {
      setConsentGiven(accepted);
    }).catch(() => setConsentGiven(true));
  }, []);

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
      {!consentGiven && (
        <PrivacyDialog onAccept={() => setConsentGiven(true)} />
      )}
      <DataProvider>
        <AppContent />
      </DataProvider>
    </ErrorBoundary>
  );
}

export default App;

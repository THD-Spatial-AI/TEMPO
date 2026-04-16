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
const Configuration = lazy(() => import("./components/Configuration"));
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
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const { navigationWarning, locations, links, createModel, showNotification } = useData();

  const handleNavigation = (newView) => {
    if (navigationWarning) {
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
    setShowSaveDialog(true);
  };

  const renderContent = () => {
    // Switch pattern avoids creating React elements for inactive views (INP fix)
    switch (selected) {
      case "Dashboard":      return <Dashboard />;
      case "Tutorial":       return <Tutorial />;
      case "Models":         return <Models />;
      case "Map View":       return <MapView />;
      case "Configuration":  return <Configuration />;
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

      {/* Navigation Warning Dialog - Enhanced */}
      {pendingNavigation && navigationWarning && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10000] animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 animate-scaleIn border border-slate-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-semibold text-slate-900">Unsaved Work</h3>
            </div>
            <div className="p-6">
              <p className="text-slate-600 leading-relaxed mb-3">
                You have unsaved work in your model:
              </p>
              <ul className="text-sm text-slate-500 space-y-1 ml-4">
                {locations.length > 0 && <li>• {locations.length} location{locations.length !== 1 ? 's' : ''}</li>}
                {links.length > 0 && <li>• {links.length} link{links.length !== 1 ? 's' : ''}</li>}
              </ul>
              <p className="text-slate-600 mt-4">
                Do you want to save your work before leaving, or discard it?
              </p>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
              <button
                onClick={cancelNavigation}
                className="px-5 py-2.5 border-2 border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmNavigation}
                className="px-5 py-2.5 border-2 border-red-200 text-red-600 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all duration-200 font-medium"
              >
                Discard
              </button>
              <button
                onClick={handleSaveAndNavigate}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 shadow-md hover:shadow-lg transition-all duration-200 font-medium"
              >
                Save & Leave
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Save Dialog (triggered from navigation warning) */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10001] animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 animate-scaleIn border border-slate-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-semibold text-slate-900">Save Model</h3>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Model Name
              </label>
              <input
                type="text"
                placeholder="Enter model name..."
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const name = e.target.value.trim();
                    if (name) {
                      createModel(name);
                      showNotification('Model saved successfully!', 'success');
                      setShowSaveDialog(false);
                      confirmNavigation();
                    }
                  }
                }}
                autoFocus
              />
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-5 py-2.5 border-2 border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  const input = e.target.closest('.bg-white').querySelector('input');
                  const name = input.value.trim();
                  if (name) {
                    createModel(name);
                    showNotification('Model saved successfully!', 'success');
                    setShowSaveDialog(false);
                    confirmNavigation();
                  }
                }}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 shadow-md hover:shadow-lg transition-all duration-200 font-medium"
              >
                Save
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

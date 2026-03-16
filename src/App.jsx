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
  const { navigationWarning } = useData();

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
      case "TimeSeries":     return <TimeSeries />;
      case "Settings":       return <Settings />;
      case "Run":            return <Run />;
      case "Results":        return <Results />;
      case "Export":         return <Export />;
      case "H2 Plant":       return <HydrogenPlantDashboard />;
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
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl animate-pulse-slow" style={{ willChange: 'opacity', animationDelay: '1s' }}></div>
        </div>
        
        <Sidebar selected={selected} setSelected={handleNavigation} />
        
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto relative z-10">
          {/* Suspense boundary for lazy-loaded view chunks */}
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
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
              <h3 className="text-xl font-semibold text-slate-900">Unsaved Changes</h3>
            </div>
            <div className="p-6">
              <p className="text-slate-600 leading-relaxed">
                You have unsaved changes in Locations. Do you want to discard them and leave?
              </p>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
              <button
                onClick={cancelNavigation}
                className="px-5 py-2.5 border-2 border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 font-medium"
              >
                Stay
              </button>
              <button
                onClick={confirmNavigation}
                className="px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 shadow-md hover:shadow-lg transition-all duration-200 font-medium"
              >
                Discard Changes
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
      window.electronAPI.checkCalliope().then(status => {
        if (status.envExists) {
          setAppState('ready');
        } else {
          setAppState('setup');
        }
      }).catch(() => {
        // If check fails for any reason, show setup screen
        setAppState('setup');
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

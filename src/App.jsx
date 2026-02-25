import React, { useState } from "react";
import { DataProvider, useData } from "./context/DataContext";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Tutorial from "./components/Tutorial";
import Models from "./components/Models";
import MapView from "./components/MapView";
import Configuration from "./components/Configuration";
import Creation from "./components/Creation";
import Locations from "./components/Locations";
import Links from "./components/Links";
import Overrides from "./components/Overrides";
import Scenarios from "./components/Scenarios";
import Parameters from "./components/Parameters";
import Technologies from "./components/Technologies";
import TimeSeries from "./components/TimeSeries";
import Settings from "./components/Settings";
import Export from "./components/Export";
import Run from "./components/Run";
import Results from "./components/Results";

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
    const viewMap = {
      "Dashboard": <Dashboard />,
      "Tutorial": <Tutorial />,
      "Models": <Models />,
      "Map View": <MapView />,
      "Configuration": <Configuration />,
      "Creation": <Creation />,
      "Locations": <Locations />,
      "Links": <Links />,
      "Overrides": <Overrides />,
      "Scenarios": <Scenarios />,
      "Parameters": <Parameters />,
      "Technologies": <Technologies />,
      "TimeSeries": <TimeSeries />,
      "Settings": <Settings />,
      "Run": <Run />,
      "Results": <Results />,
      "Export": <Export />,
    };
    
    return viewMap[selected] || <Dashboard />;
  };

  return (
    <>
      <div className="flex h-screen overflow-hidden relative">
        {/* Animated background accent */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-electric-500/5 rounded-full blur-3xl animate-pulse-slow"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
        </div>
        
        <Sidebar selected={selected} setSelected={handleNavigation} />
        
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="animate-fadeIn">
            {renderContent()}
          </div>
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
  return (
    <DataProvider>
      <AppContent />
    </DataProvider>
  );
}

export default App;

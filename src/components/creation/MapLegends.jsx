// MapLegends — map overlay extracted verbatim from Creation.jsx.
export default function MapLegends({
  layerVisibility,
  osmPowerLines,
  osmPowerPlants,
}) {
  return (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white bg-opacity-95 rounded-lg shadow-lg p-3 max-w-2xl">
            <div className="flex gap-6">
              {/* Power Lines Legend */}
              {osmPowerLines && layerVisibility.powerLines && (
                <div>
                  <div className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Transmission Lines
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-[rgb(220,20,60)] rounded"></div>
                      <span className="text-xs text-slate-600">≥220 kV</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-[rgb(255,140,0)] rounded"></div>
                      <span className="text-xs text-slate-600">110-220 kV</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-[rgb(255,215,0)] rounded"></div>
                      <span className="text-xs text-slate-600">20-110 kV</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-[rgb(100,100,100)] rounded"></div>
                      <span className="text-xs text-slate-600">&lt;20 kV</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Power Plants Legend */}
              {osmPowerPlants && layerVisibility.powerPlants && (
                <div>
                  <div className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                    Power Plants
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FDB813]"></div>
                      <span className="text-xs text-slate-600">Solar</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#00A8CC]"></div>
                      <span className="text-xs text-slate-600">Wind</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#1976D2]"></div>
                      <span className="text-xs text-slate-600">Hydro</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#689F38]"></div>
                      <span className="text-xs text-slate-600">Biomass</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FF6F00]"></div>
                      <span className="text-xs text-slate-600">Gas</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#424242]"></div>
                      <span className="text-xs text-slate-600">Coal</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#E91E63]"></div>
                      <span className="text-xs text-slate-600">Nuclear</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#9C27B0]"></div>
                      <span className="text-xs text-slate-600">Battery</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { FiBarChart2, FiPieChart, FiTrendingUp, FiDownload, FiExternalLink, FiRefreshCw, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

const Results = () => {
  const { showNotification } = useData();
  const [selectedJob, setSelectedJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [availableJobs, setAvailableJobs] = useState([]);
  const [resultsData, setResultsData] = useState(null);
  
  // External visualization service URL - configure this URL before deployment
  const VISUALIZATION_SERVICE_URL = 'https://your-viz-service.com/results';

  // Mock jobs data - replace with actual data from backend
  useEffect(() => {
    const mockJobs = [
      {
        id: 'job_1',
        modelName: 'Germany Energy System',
        framework: 'calliope',
        status: 'completed',
        completedAt: '2026-02-24T14:30:00',
        objective: 1234567.89,
        hasResults: true
      },
      {
        id: 'job_2',
        modelName: 'Chile Power Grid',
        framework: 'calliope',
        status: 'completed',
        completedAt: '2026-02-24T12:15:00',
        objective: 987654.32,
        hasResults: true
      }
    ];
    setAvailableJobs(mockJobs);
  }, []);

  const handleLoadResults = async (job) => {
    setLoading(true);
    setSelectedJob(job);

    try {
      // TODO: Replace with actual API call to your visualization service
      // const response = await fetch(`/api/results/${job.id}`);
      // const data = await response.json();
      
      // Mock data for demonstration
      const mockResults = {
        objective: job.objective,
        capacities: {
          solar: 150,
          wind: 200,
          gas: 50,
          battery: 75
        },
        generation: {
          solar: 1200,
          wind: 1800,
          gas: 400,
          battery: 300
        },
        costs: {
          investment: 500000,
          operational: 100000,
          total: 600000
        }
      };

      setResultsData(mockResults);
      
      showNotification('Results loaded successfully!', 'success');
    } catch (error) {
      showNotification('Failed to load results', 'error');
      console.error('Error loading results:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportResults = () => {
    if (!resultsData) return;

    const dataStr = JSON.stringify(resultsData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `results_${selectedJob?.id || 'export'}.json`;
    link.click();
    URL.revokeObjectURL(url);

    showNotification('Results exported successfully!', 'success');
  };

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-electric-600 to-violet-600 bg-clip-text text-transparent mb-2">
            Results Visualization
          </h1>
          <p className="text-slate-600">
            View and analyze your energy model optimization results
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Panel - Job Selection */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiBarChart2 className="text-electric-500" />
                Completed Jobs
              </h2>

              {availableJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FiAlertCircle size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No completed jobs</p>
                  <p className="text-xs mt-1">Run a model first</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableJobs.map(job => (
                    <button
                      key={job.id}
                      onClick={() => handleLoadResults(job)}
                      className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                        selectedJob?.id === job.id
                          ? 'border-electric-500 bg-electric-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="font-medium text-sm text-slate-800">{job.modelName}</div>
                        {job.hasResults && (
                          <FiCheckCircle className="text-green-500 flex-shrink-0" size={16} />
                        )}
                      </div>
                      <div className="text-xs text-slate-500 space-y-1">
                        <div>{job.framework.toUpperCase()}</div>
                        <div>{new Date(job.completedAt).toLocaleDateString()}</div>
                        {job.objective && (
                          <div className="font-medium text-electric-600">
                            ${(job.objective / 1000).toFixed(1)}k
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main Content - Results Display */}
          <div className="lg:col-span-3 space-y-6">
            {!selectedJob ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12">
                <div className="text-center text-slate-400">
                  <FiBarChart2 size={64} className="mx-auto mb-4 opacity-30" />
                  <h3 className="text-lg font-semibold mb-2">No Results Selected</h3>
                  <p className="text-sm">
                    Select a completed job from the list to view its results
                  </p>
                </div>
              </div>
            ) : loading ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12">
                <div className="text-center">
                  <FiRefreshCw size={48} className="mx-auto mb-4 text-electric-500 animate-spin" />
                  <p className="text-slate-600">Loading results...</p>
                </div>
              </div>
            ) : (
              <>
                {/* Results Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800 mb-2">
                        {selectedJob.modelName}
                      </h2>
                      <div className="flex gap-4 text-sm text-slate-600">
                        <span className="flex items-center gap-1">
                          <FiCheckCircle className="text-green-500" />
                          {selectedJob.framework.toUpperCase()}
                        </span>
                        <span>{new Date(selectedJob.completedAt).toLocaleString()}</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={handleExportResults}
                        className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                      >
                        <FiDownload size={16} />
                        Export
                      </button>
                      
                      <a
                        href={`${VISUALIZATION_SERVICE_URL}/${selectedJob.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-electric-500 text-white rounded-lg hover:bg-electric-600 transition-colors flex items-center gap-2"
                      >
                        <FiExternalLink size={16} />
                        Open in Viz Tool
                      </a>
                    </div>
                  </div>
                </div>

                {/* Summary Cards */}
                {resultsData && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <FiTrendingUp className="text-green-600" size={20} />
                        </div>
                        <div className="text-sm text-slate-600">Total Objective</div>
                      </div>
                      <div className="text-2xl font-bold text-slate-800">
                        ${(resultsData.objective / 1000).toFixed(1)}k
                      </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <FiBarChart2 className="text-blue-600" size={20} />
                        </div>
                        <div className="text-sm text-slate-600">Investment Cost</div>
                      </div>
                      <div className="text-2xl font-bold text-slate-800">
                        ${(resultsData.costs.investment / 1000).toFixed(1)}k
                      </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-100 rounded-lg">
                          <FiPieChart className="text-purple-600" size={20} />
                        </div>
                        <div className="text-sm text-slate-600">Operational Cost</div>
                      </div>
                      <div className="text-2xl font-bold text-slate-800">
                        ${(resultsData.costs.operational / 1000).toFixed(1)}k
                      </div>
                    </div>
                  </div>
                )}

                {/* Visualization Placeholder */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">
                    Technology Capacities
                  </h3>
                  
                  {resultsData && (
                    <div className="space-y-4">
                      {Object.entries(resultsData.capacities).map(([tech, capacity]) => (
                        <div key={tech}>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="font-medium text-slate-700 capitalize">{tech}</span>
                            <span className="text-slate-600">{capacity} MW</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-3">
                            <div
                              className="bg-gradient-to-r from-electric-500 to-electric-600 h-3 rounded-full transition-all duration-500"
                              style={{ width: `${(capacity / 200) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* External Visualization Integration */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">
                    Advanced Visualization
                  </h3>
                  
                  <div className="bg-gradient-to-br from-electric-50 to-violet-50 border-2 border-dashed border-electric-300 rounded-xl p-12">
                    <div className="text-center">
                      <FiExternalLink size={48} className="mx-auto mb-4 text-electric-400" />
                      <h4 className="text-lg font-semibold text-slate-800 mb-2">
                        External Visualization Service
                      </h4>
                      <p className="text-sm text-slate-600 mb-4 max-w-md mx-auto">
                        Interactive charts and detailed analysis are available through the external visualization service.
                      </p>
                      
                      <a
                        href={`${VISUALIZATION_SERVICE_URL}/${selectedJob.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-electric-500 to-electric-600 text-white rounded-lg font-medium hover:from-electric-600 hover:to-electric-700 transition-all"
                      >
                        <FiExternalLink size={20} />
                        Open Visualization Dashboard
                      </a>
                    </div>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex gap-3">
                    <FiAlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                    <div className="text-sm text-blue-800">
                      <p className="font-semibold mb-1">Visualization Service</p>
                      <p>
                        Advanced visualization features are provided by an external service configured in the application code. 
                        Click the button above to open the full visualization dashboard with interactive plots, charts, and detailed analysis.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Results;

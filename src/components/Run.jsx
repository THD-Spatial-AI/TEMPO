import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { FiPlay, FiStopCircle, FiCheckCircle, FiAlertCircle, FiClock, FiCpu, FiZap, FiActivity, FiSettings } from 'react-icons/fi';

const MODELING_FRAMEWORKS = [
  {
    id: 'calliope',
    name: 'Calliope',
    description: 'Multi-scale energy system modeling framework',
    icon: FiZap,
    color: 'from-blue-500 to-blue-600',
    supported: true
  },
  {
    id: 'pypsa',
    name: 'PyPSA',
    description: 'Python for Power System Analysis',
    icon: FiActivity,
    color: 'from-green-500 to-green-600',
    supported: false
  },
  {
    id: 'osemosys',
    name: 'OSeMOSYS',
    description: 'Open Source Energy Modelling System',
    icon: FiCpu,
    color: 'from-purple-500 to-purple-600',
    supported: false
  },
  {
    id: 'adoptnet',
    name: 'AdoptNET',
    description: 'Adoption Network Energy Transition',
    icon: FiSettings,
    color: 'from-orange-500 to-orange-600',
    supported: false
  }
];

const SOLVER_OPTIONS = {
  calliope: ['gurobi', 'glpk', 'cplex', 'cbc'],
  pypsa: ['gurobi', 'glpk', 'cplex', 'highs'],
  osemosys: ['glpk', 'gurobi', 'cplex', 'cbc'],
  adoptnet: ['gurobi', 'cplex']
};

const Run = () => {
  const { models, getCurrentModel, showNotification } = useData();
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedFramework, setSelectedFramework] = useState('calliope');
  const [selectedSolver, setSelectedSolver] = useState('gurobi');
  const [runningJobs, setRunningJobs] = useState([]);
  const [completedJobs, setCompletedJobs] = useState([]);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  
  // Calliope webservice API endpoint - configure this URL before deployment
  const API_ENDPOINT = 'http://localhost:5000/api';
  
  // Advanced settings
  const [advancedSettings, setAdvancedSettings] = useState({
    threads: 4,
    timeLimit: 3600,
    mipGap: 0.001,
    feasibilityTol: 1e-6,
    optimalityTol: 1e-6
  });

  useEffect(() => {
    const currentModel = getCurrentModel();
    if (currentModel) {
      setSelectedModel(currentModel);
    }
  }, [getCurrentModel]);

  useEffect(() => {
    // Update solver when framework changes
    const availableSolvers = SOLVER_OPTIONS[selectedFramework] || [];
    if (availableSolvers.length > 0) {
      setSelectedSolver(availableSolvers[0]);
    }
  }, [selectedFramework]);

  const handleRunModel = async () => {
    if (!selectedModel) {
      showNotification('Please select a model to run', 'warning');
      return;
    }

    const framework = MODELING_FRAMEWORKS.find(f => f.id === selectedFramework);
    if (!framework.supported) {
      showNotification(`${framework.name} support is coming soon!`, 'info');
      return;
    }

    const jobId = `job_${Date.now()}`;
    const newJob = {
      id: jobId,
      modelName: selectedModel.name,
      framework: selectedFramework,
      solver: selectedSolver,
      status: 'running',
      progress: 0,
      startTime: new Date().toISOString(),
      settings: { ...advancedSettings }
    };

    setRunningJobs(prev => [...prev, newJob]);
    showNotification(`Started ${framework.name} run for ${selectedModel.name}`, 'success');

    try {
      // Call actual Calliope webservice API
      const response = await fetch(`${API_ENDPOINT}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          framework: selectedFramework,
          solver: selectedSolver,
          settings: advancedSettings
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit job to webservice');
      }

      const data = await response.json();
      
      // Poll for job status
      pollJobStatus(jobId, data.jobId || jobId);
      
    } catch (error) {
      console.error('API Error:', error);
      showNotification(`Failed to connect to API: ${error.message}. Running simulation instead.`, 'warning');
      
      // Fallback to simulation if API fails
      simulateModelRun(jobId);
    }
  };

  const pollJobStatus = async (localJobId, remoteJobId) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_ENDPOINT}/job/${remoteJobId}`);
        const data = await response.json();
        
        if (data.status === 'completed') {
          clearInterval(pollInterval);
          setRunningJobs(prev => prev.filter(job => job.id !== localJobId));
          
          const completedJob = {
            id: localJobId,
            modelName: selectedModel.name,
            framework: selectedFramework,
            solver: selectedSolver,
            status: 'completed',
            progress: 100,
            startTime: data.startTime,
            endTime: new Date().toISOString(),
            duration: data.duration || 'N/A',
            objective: data.objective,
            results: data.results,
            settings: { ...advancedSettings }
          };
          
          setCompletedJobs(prev => [completedJob, ...prev]);
          showNotification(`Model run completed successfully!`, 'success');
        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          setRunningJobs(prev => prev.filter(job => job.id !== localJobId));
          showNotification(`Model run failed: ${data.error}`, 'error');
        } else {
          // Update progress
          setRunningJobs(prev => prev.map(job => 
            job.id === localJobId ? { ...job, progress: data.progress || 0 } : job
          ));
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
  };

  const simulateModelRun = (jobId) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      
      if (progress >= 100) {
        clearInterval(interval);
        setRunningJobs(prev => prev.filter(job => job.id !== jobId));
        
        const completedJob = {
          id: jobId,
          modelName: selectedModel.name,
          framework: selectedFramework,
          solver: selectedSolver,
          status: 'completed',
          progress: 100,
          startTime: new Date(Date.now() - 30000).toISOString(),
          endTime: new Date().toISOString(),
          duration: '30s',
          objective: Math.random() * 1000000,
          settings: { ...advancedSettings }
        };
        
        setCompletedJobs(prev => [completedJob, ...prev]);
        showNotification(`Model run completed successfully!`, 'success');
      } else {
        setRunningJobs(prev => prev.map(job => 
          job.id === jobId ? { ...job, progress: Math.min(progress, 100) } : job
        ));
      }
    }, 1000);
  };

  const handleStopJob = (jobId) => {
    setRunningJobs(prev => prev.filter(job => job.id !== jobId));
    showNotification('Model run stopped', 'info');
  };

  const handleDeleteJob = (jobId) => {
    setCompletedJobs(prev => prev.filter(job => job.id !== jobId));
  };

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-electric-600 to-violet-600 bg-clip-text text-transparent mb-2">
            Run Model
          </h1>
          <p className="text-slate-600">
            Execute your energy model using different modeling frameworks and solvers
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Model Selection & Framework */}
          <div className="lg:col-span-2 space-y-6">
            {/* Model Selection */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiSettings className="text-electric-500" />
                Model Selection
              </h2>
              
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Select Model to Run
                </label>
                <select
                  value={selectedModel?.id || ''}
                  onChange={(e) => {
                    const model = models.find(m => m.id === e.target.value);
                    setSelectedModel(model);
                  }}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent bg-white"
                >
                  <option value="">-- Select a model --</option>
                  {models.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.locations?.length || 0} locations, {model.links?.length || 0} links)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Framework Selection */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiCpu className="text-electric-500" />
                Modeling Framework
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {MODELING_FRAMEWORKS.map(framework => {
                  const Icon = framework.icon;
                  const isSelected = selectedFramework === framework.id;
                  
                  return (
                    <button
                      key={framework.id}
                      onClick={() => setSelectedFramework(framework.id)}
                      disabled={!framework.supported}
                      className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                        isSelected
                          ? `border-transparent bg-gradient-to-r ${framework.color} text-white shadow-lg`
                          : framework.supported
                          ? 'border-slate-200 hover:border-slate-300 bg-white hover:shadow-md'
                          : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Icon size={24} className={isSelected ? 'text-white' : 'text-slate-400'} />
                        <div className="flex-1">
                          <div className="font-semibold mb-1">{framework.name}</div>
                          <div className={`text-xs ${isSelected ? 'text-white/90' : 'text-slate-500'}`}>
                            {framework.description}
                          </div>
                        </div>
                      </div>
                      
                      {!framework.supported && (
                        <div className="absolute top-2 right-2 bg-slate-200 text-slate-700 text-xs px-2 py-1 rounded">
                          Coming Soon
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Solver & Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                Solver Configuration
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Solver
                  </label>
                  <select
                    value={selectedSolver}
                    onChange={(e) => setSelectedSolver(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent bg-white"
                  >
                    {(SOLVER_OPTIONS[selectedFramework] || []).map(solver => (
                      <option key={solver} value={solver}>
                        {solver.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Advanced Settings Toggle */}
                <button
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="flex items-center gap-2 text-sm text-electric-600 hover:text-electric-700 font-medium"
                >
                  <FiSettings size={16} />
                  {showAdvancedSettings ? 'Hide' : 'Show'} Advanced Settings
                </button>

                {/* Advanced Settings */}
                {showAdvancedSettings && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Threads
                      </label>
                      <input
                        type="number"
                        value={advancedSettings.threads}
                        onChange={(e) => setAdvancedSettings({...advancedSettings, threads: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Time Limit (s)
                      </label>
                      <input
                        type="number"
                        value={advancedSettings.timeLimit}
                        onChange={(e) => setAdvancedSettings({...advancedSettings, timeLimit: parseInt(e.target.value)})}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        MIP Gap
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        value={advancedSettings.mipGap}
                        onChange={(e) => setAdvancedSettings({...advancedSettings, mipGap: parseFloat(e.target.value)})}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Feasibility Tol
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        value={advancedSettings.feasibilityTol}
                        onChange={(e) => setAdvancedSettings({...advancedSettings, feasibilityTol: parseFloat(e.target.value)})}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Run Button */}
            <button
              onClick={handleRunModel}
              disabled={!selectedModel || !MODELING_FRAMEWORKS.find(f => f.id === selectedFramework)?.supported}
              className="w-full py-4 bg-gradient-to-r from-electric-500 to-electric-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:from-electric-600 hover:to-electric-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
            >
              <FiPlay size={20} />
              Run Model
            </button>
          </div>

          {/* Right Panel - Job Queue & Status */}
          <div className="space-y-6">
            {/* Running Jobs */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiActivity className="text-orange-500" />
                Running Jobs ({runningJobs.length})
              </h2>
              
              {runningJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FiClock size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No running jobs</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {runningJobs.map(job => (
                    <div key={job.id} className="p-4 bg-orange-50 border border-orange-100 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm text-slate-800">{job.modelName}</div>
                          <div className="text-xs text-slate-500">
                            {MODELING_FRAMEWORKS.find(f => f.id === job.framework)?.name} · {job.solver.toUpperCase()}
                          </div>
                        </div>
                        <button
                          onClick={() => handleStopJob(job.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Stop job"
                        >
                          <FiStopCircle size={16} />
                        </button>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-slate-600 mb-1">
                          <span>Progress</span>
                          <span>{Math.round(job.progress)}%</span>
                        </div>
                        <div className="w-full bg-orange-100 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Completed Jobs */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiCheckCircle className="text-green-500" />
                Completed ({completedJobs.length})
              </h2>
              
              {completedJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FiCheckCircle size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No completed jobs</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {completedJobs.map(job => (
                    <div key={job.id} className="p-4 bg-green-50 border border-green-100 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm text-slate-800">{job.modelName}</div>
                          <div className="text-xs text-slate-500">
                            {MODELING_FRAMEWORKS.find(f => f.id === job.framework)?.name} · {job.solver.toUpperCase()}
                          </div>
                          <div className="text-xs text-green-600 mt-1">
                            Duration: {job.duration}
                          </div>
                          {job.objective && (
                            <div className="text-xs text-slate-600 mt-1">
                              Objective: {job.objective.toFixed(2)}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete job"
                        >
                          <FiAlertCircle size={16} />
                        </button>
                      </div>
                      
                      <button className="mt-2 w-full text-xs py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                        View Results
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Run;

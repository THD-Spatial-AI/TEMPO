// Modeling-framework catalogue + per-framework solver options for the Run view.
// Extracted from Run.jsx so a collaborator adding an engine edits one small file.
import { FiZap, FiActivity, FiCpu, FiBarChart2 } from 'react-icons/fi';

export const MODELING_FRAMEWORKS = [
  {
    id: 'calliope',
    name: 'Calliope',
    description: 'Multi-scale energy system modeling framework',
    icon: FiZap,
    color: 'from-gray-600 to-gray-700',
    supported: true,
  },
  {
    id: 'adoptnet0',
    name: 'AdOpT-NET0',
    description: 'Adaptive Optimisation Tool for Net-Zero Energy Systems',
    icon: FiActivity,
    color: 'from-gray-500 to-gray-600',
    supported: true,
  },
  {
    id: 'pypsa',
    name: 'PyPSA',
    description: 'Python for Power System Analysis',
    icon: FiCpu,
    color: 'from-gray-500 to-gray-600',
    supported: true,
  },
  {
    id: 'osemosys',
    name: 'OSeMOSYS',
    description: 'Open Source Energy Modelling System',
    icon: FiBarChart2,
    color: 'from-gray-500 to-gray-600',
    supported: true,
  },
];

export const SOLVER_OPTIONS = {
  calliope:  ['highs'],
  adoptnet0: ['highs', 'gurobi', 'glpk'],
  pypsa:     ['highs'],
  osemosys:  ['glpk'],
};

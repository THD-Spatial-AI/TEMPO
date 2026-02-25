import React from 'react';
import { FiGlobe, FiMapPin, FiMap, FiLayers } from 'react-icons/fi';

const RegionSelectionStepper = ({ 
  currentStep, 
  selectedContinent,
  selectedCountry,
  selectedRegion,
  selectedSubregion,
  availableContinents,
  availableCountries,
  availableRegions,
  availableSubregions,
  onContinentSelect,
  onCountrySelect,
  onRegionSelect,
  onSubregionSelect
}) => {
  const steps = [
    { 
      id: 1, 
      title: 'Continent', 
      icon: FiGlobe,
      value: selectedContinent,
      options: availableContinents,
      onSelect: onContinentSelect,
      placeholder: 'Choose a continent...',
      status: selectedContinent ? 'completed' : currentStep === 1 ? 'active' : 'pending'
    },
    { 
      id: 2, 
      title: 'Country', 
      icon: FiMapPin,
      value: selectedCountry,
      options: availableCountries,
      onSelect: onCountrySelect,
      placeholder: 'Choose a country...',
      status: selectedCountry ? 'completed' : currentStep === 2 ? 'active' : 'pending',
      disabled: !selectedContinent
    },
    { 
      id: 3, 
      title: 'Region', 
      icon: FiMap,
      value: selectedRegion,
      options: availableRegions,
      onSelect: onRegionSelect,
      placeholder: 'Choose a region...',
      status: selectedRegion ? 'completed' : currentStep === 3 ? 'active' : 'pending',
      disabled: !selectedCountry || availableRegions.length === 0
    },
    { 
      id: 4, 
      title: 'Subregion', 
      icon: FiLayers,
      value: selectedSubregion,
      options: availableSubregions,
      onSelect: onSubregionSelect,
      placeholder: 'Choose a subregion...',
      status: selectedSubregion ? 'completed' : currentStep === 4 ? 'active' : 'pending',
      disabled: !selectedRegion || availableSubregions.length === 0
    }
  ];

  return (
    <div className="bg-white rounded-lg p-4 border border-slate-200">
      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-4">
        Region Selection
      </div>
      
      {steps.map((step, index) => (
        <div key={step.id} className="relative mb-4 last:mb-0">
          <div className="flex items-start">
            {/* Circle */}
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10
              ${step.status === 'completed' ? 'bg-gray-900 text-white' : ''}
              ${step.status === 'active' ? 'border-2 border-gray-900 text-gray-900 bg-white' : ''}
              ${step.status === 'pending' ? 'border-2 border-slate-300 text-slate-400 bg-white' : ''}
            `}>
              {step.status === 'completed' ? (
                <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
                  <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z" />
                </svg>
              ) : (
                <step.icon className="w-4 h-4" />
              )}
            </div>

            {/* Content */}
            <div className="ml-3 flex-1">
              <div className={`
                font-semibold text-sm mb-2
                ${step.status === 'completed' || step.status === 'active' ? 'text-gray-900' : 'text-slate-400'}
              `}>
                {step.title}
              </div>
              
              {/* Dropdown - Always visible for active or completed steps */}
              {(step.status === 'active' || step.status === 'completed') && (
                <select
                  value={step.value || ''}
                  onChange={(e) => step.onSelect(e.target.value || null)}
                  disabled={step.disabled}
                  className={`
                    w-full px-3 py-2 text-sm border rounded-lg 
                    focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white
                    ${step.disabled ? 'opacity-50 cursor-not-allowed border-slate-200' : 'border-slate-300'}
                    ${step.status === 'completed' ? 'border-gray-900' : ''}
                  `}
                >
                  <option value="">{step.placeholder}</option>
                  {step.options && step.options.map(option => (
                    <option key={option} value={option}>
                      {option.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              )}
              
              {/* Pending state message */}
              {step.status === 'pending' && (
                <div className="text-xs text-slate-400 italic">
                  Complete previous steps first
                </div>
              )}
            </div>
          </div>

          {/* Connecting Line */}
          {index < steps.length - 1 && (
            <div className={`
              absolute left-4 top-8 w-0.5 h-8
              ${step.status === 'completed' ? 'bg-gray-900' : 'bg-slate-300'}
            `} />
          )}
        </div>
      ))}
    </div>
  );
};

export default RegionSelectionStepper;

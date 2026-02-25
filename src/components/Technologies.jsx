import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import useMeasure from 'react-use-measure';
import { FiChevronLeft, FiChevronRight, FiSearch, FiEdit2, FiX, FiSave, FiPlus, FiTrash2, FiChevronDown, FiChevronRight as FiChevronRightIcon, FiArrowRight, FiHelpCircle } from 'react-icons/fi';
import { useData } from '../context/DataContext';
import { TECH_TEMPLATES, TECH_IMAGES, PARENT_TYPES } from './TechnologiesData';

// Card dimensions
const CARD_WIDTH = 280;
const CARD_HEIGHT = 320;
const MARGIN = 16;
const CARD_SIZE = CARD_WIDTH + MARGIN;

// Constraint definitions (from Locations.jsx)
const CONSTRAINT_DEFINITIONS = {
  // Capacity Constraints
  energy_cap_max: { group: 'Capacity', desc: 'Maximum energy capacity (kW). Upper limit on installed capacity.' },
  energy_cap_min: { group: 'Capacity', desc: 'Minimum energy capacity (kW). Lower limit on installed capacity.' },
  energy_cap_equals: { group: 'Capacity', desc: 'Fixed energy capacity (kW). Capacity must equal this value.' },
  storage_cap_max: { group: 'Capacity', desc: 'Maximum storage capacity (kWh). Upper limit on energy storage.' },
  storage_cap_min: { group: 'Capacity', desc: 'Minimum storage capacity (kWh).' },
  storage_cap_equals: { group: 'Capacity', desc: 'Fixed storage capacity (kWh).' },
  
  // Efficiency Constraints
  energy_eff: { group: 'Efficiency', desc: 'Energy conversion efficiency (0-1). Ratio of output to input energy.' },
  resource_eff: { group: 'Efficiency', desc: 'Resource conversion efficiency (0-1). Efficiency of resource usage.' },
  
  // Resource Constraints
  resource: { group: 'Resource', desc: 'Resource availability (kWh or file:// path). Energy source input.' },
  resource_min_use: { group: 'Resource', desc: 'Minimum resource utilization fraction (0-1).' },
  resource_scale: { group: 'Resource', desc: 'Resource scaling factor.' },
  
  // Operational Constraints
  energy_ramping: { group: 'Operation', desc: 'Ramping rate limit (fraction/hour). Max change in output per timestep.' },
  charge_rate: { group: 'Operation', desc: 'Charge/discharge rate (C-rate). Storage power relative to capacity.' },
  storage_loss: { group: 'Operation', desc: 'Storage standing loss (fraction/hour). Energy lost per time period.' },
  lifetime: { group: 'Operation', desc: 'Technology lifetime (years). Economic lifespan.' },
};

// Cost definitions (from Locations.jsx)
const COST_DEFINITIONS = {
  energy_cap: { group: 'Investment', desc: 'Capital cost per unit energy capacity ($/kW). One-time installation cost.' },
  storage_cap: { group: 'Investment', desc: 'Capital cost per unit storage capacity ($/kWh).' },
  purchase: { group: 'Investment', desc: 'Purchase cost per unit of technology ($).' },
  
  om_annual: { group: 'O&M', desc: 'Annual operations & maintenance cost ($/year). Fixed yearly cost.' },
  om_prod: { group: 'O&M', desc: 'Variable O&M cost per unit energy produced ($/kWh).' },
  om_con: { group: 'O&M', desc: 'Variable O&M cost per unit energy consumed ($/kWh).' },
  
  interest_rate: { group: 'Financial', desc: 'Interest rate for investment (fraction, e.g., 0.10 = 10%).' },
  depreciation_rate: { group: 'Financial', desc: 'Depreciation rate (fraction/year). Asset value reduction rate.' },
};

// Constraints configuration for parent types
const PARENT_CONSTRAINTS = {
  supply: ['energy_cap_max', 'energy_cap_min', 'energy_eff', 'resource', 'resource_min_use', 'energy_ramping', 'lifetime'],
  supply_plus: ['energy_cap_max', 'energy_cap_min', 'energy_eff', 'resource', 'resource_min_use', 'energy_ramping', 'lifetime'],
  storage: ['energy_cap_max', 'energy_cap_min', 'storage_cap_max', 'storage_cap_min', 'charge_rate', 'storage_loss', 'lifetime'],
  conversion: ['energy_cap_max', 'energy_cap_min', 'energy_eff', 'energy_ramping', 'lifetime'],
  conversion_plus: ['energy_cap_max', 'energy_cap_min', 'energy_eff', 'energy_ramping', 'lifetime'],
  transmission: ['energy_cap_max', 'energy_cap_min', 'energy_eff', 'lifetime'],
  demand: ['resource']
};

// Custom scrollbar CSS
const customScrollbarStyles = `
  /* Webkit browsers (Chrome, Safari, Edge) */
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(139, 92, 246, 0.1);
    border-radius: 3px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgb(48, 46, 46);
    border-radius: 3px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgb(0, 0, 0);
  }
`;

// TechCard component
const TechCard = ({ techName, tech, isCustom, onDuplicate, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const imageUrl = TECH_IMAGES[techName] || TECH_IMAGES[tech.parent] || TECH_IMAGES.default;

  const renderObjectEntries = (obj, parentKey = '') => {
    if (!obj || typeof obj !== 'object') return null;

    return (
      <div className="space-y-2">
        {Object.entries(obj).map(([key, value]) => {
          const displayKey = parentKey ? `${parentKey}.${key}` : key;
          
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return (
              <div key={displayKey} className="pl-2 border-l-2 border-gray-300">
                <div className="font-medium text-gray-700 mb-1">{key}:</div>
                {renderObjectEntries(value, displayKey)}
              </div>
            );
          }
          
          return (
            <div key={displayKey} className="flex justify-between items-start">
              <span className="text-slate-600 font-medium">{key}:</span>
              <span className="text-slate-800 text-right ml-2">{String(value)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <motion.div
      className="relative flex-shrink-0 rounded-lg overflow-hidden shadow-lg bg-white"
      style={{ width: `${CARD_WIDTH}px`, minWidth: `${CARD_WIDTH}px`, height: CARD_HEIGHT }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />

      {/* Trash Icon for Custom Technologies */}
      {isCustom && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(techName);
          }}
          className="absolute top-2 right-2 z-10 p-2 bg-gray-600/80 hover:bg-gray-700 text-white rounded-full transition-colors backdrop-blur-sm"
          title="Delete technology"
        >
          <FiTrash2 size={16} />
        </button>
      )}

      {/* Content */}
      <div className="relative h-full flex flex-col p-4">
        {/* Header */}
        <div>
          <h3 className="text-lg font-bold text-white mb-1">{techName}</h3>
          <p className="text-xs text-gray-200 font-medium">{PARENT_TYPES[tech.parent]}</p>
        </div>

        {/* Scrollable Details */}
        <div className="flex-1 overflow-y-auto custom-scrollbar mt-2 mb-2 h-[200px] pb-4">
          {expanded ? (
            <div className="space-y-2 text-sm bg-white/90 backdrop-blur-sm rounded p-2">
              <div>
                <div className="font-bold text-gray-700 mb-1">Essentials:</div>
                {renderObjectEntries(tech.essentials)}
              </div>
              {tech.constraints && Object.keys(tech.constraints).length > 0 && (
                <div>
                  <div className="font-bold text-gray-700 mb-1">Constraints:</div>
                  {renderObjectEntries(tech.constraints)}
                </div>
              )}
              {tech.costs?.monetary && Object.keys(tech.costs.monetary).length > 0 && (
                <div>
                  <div className="font-bold text-gray-700 mb-1">Costs:</div>
                  {renderObjectEntries(tech.costs.monetary)}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/80 line-clamp-3 bg-black/20 backdrop-blur-sm rounded p-2">
              {tech.description || 'No description available.'}
            </p>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="flex gap-2">
          <motion.button
            onClick={() => setExpanded(!expanded)}
            className="flex-1 px-3 py-2 bg-white/20 backdrop-blur-sm text-white rounded hover:bg-white/30 transition-colors text-sm font-medium"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {expanded ? 'Show Less' : 'Show More'}
          </motion.button>
          
          {isCustom ? (
            <motion.button
              onClick={() => onEdit(techName, tech)}
              className="flex-1 px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm font-medium flex items-center justify-center gap-1"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <FiEdit2 size={16} />
              Edit
            </motion.button>
          ) : (
            <motion.button
              onClick={() => onDuplicate(techName)}
              className="flex-1 px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm font-medium"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Duplicate
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// CardCarousel component
const CardCarousel = ({ title, items, onDuplicate, onEdit, onDelete }) => {
  const [ref, bounds] = useMeasure();
  const [currentPage, setCurrentPage] = useState(0);
  const containerWidthRef = useRef(0);

  // Lock in cardsPerView based on initial full width
  const cardsPerView = useMemo(() => {
    if (bounds.width === 0) return 3;
    // Store the first non-zero width we get (full container width)
    if (containerWidthRef.current === 0 && bounds.width > 0) {
      containerWidthRef.current = bounds.width;
    }
    // Always use the stored full width for calculations
    const fullWidth = containerWidthRef.current || bounds.width;
    const availableWidth = fullWidth - 80; // Account for arrow buttons
    const cardWithGap = CARD_WIDTH + 16; // card width + gap
    const fits = Math.floor(availableWidth / cardWithGap);
    return Math.max(1, fits);
  }, [bounds.width]);

  const totalPages = Math.ceil(items.length / cardsPerView);
  const startIndex = currentPage * cardsPerView;
  const visibleItems = items.slice(startIndex, startIndex + cardsPerView);

  const handlePrev = () => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
  };

  // Reset to first page and clear width cache when items change
  useEffect(() => {
    setCurrentPage(0);
    containerWidthRef.current = 0;
  }, [items.length, title]);

  return (
    <div className="mb-6" ref={ref}>
      <h3 className="text-xl font-bold text-slate-800 mb-3">{title}</h3>
      <div className="relative w-full" style={{ minWidth: containerWidthRef.current || '100%' }}>
        {/* Navigation Buttons */}
        {currentPage > 0 && (
          <button
            onClick={handlePrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-lg hover:bg-white transition-colors"
          >
            <FiChevronLeft size={24} />
          </button>
        )}
        
        {currentPage < totalPages - 1 && (
          <button
            onClick={handleNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-lg hover:bg-white transition-colors"
          >
            <FiChevronRight size={24} />
          </button>
        )}

        {/* Carousel Container - Fixed width */}
        <div className="overflow-hidden px-12 w-full" style={{ height: `${CARD_HEIGHT}px`, minWidth: '100%' }}>
          <div 
            className="flex gap-4 items-start w-full h-full"
            style={{ minWidth: '100%' }}
          >
            {visibleItems.map((item) => (
              <motion.div
                key={item.techName}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <TechCard {...item} onDuplicate={onDuplicate} onEdit={onEdit} onDelete={onDelete} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Technologies Component
function Technologies() {
  const { technologies, setTechnologies } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showOnlyCustom, setShowOnlyCustom] = useState(false);
  const [editingTech, setEditingTech] = useState(null);
  const [editForm, setEditForm] = useState(null);
  
  // Constraint and cost management states
  const [constraintSearch, setConstraintSearch] = useState({});
  const [costSearch, setCostSearch] = useState({});
  const [selectedConstraintGroup, setSelectedConstraintGroup] = useState({});
  const [selectedCostGroup, setSelectedCostGroup] = useState({});

  // Combine template and custom technologies
  const allTechnologies = useMemo(() => {
    const combined = {};
    
    // Add all templates
    Object.values(TECH_TEMPLATES).forEach(categoryTechs => {
      if (Array.isArray(categoryTechs)) {
        categoryTechs.forEach(tech => {
          combined[tech.name] = { ...tech, isTemplate: true };
        });
      }
    });
    
    // Don't override templates with custom - keep them separate
    // Custom technologies will be shown in "My Technologies" section
    
    return combined;
  }, [technologies]);

  // Handle duplicate
  const handleDuplicate = (techName) => {
    const tech = allTechnologies[techName];
    if (!tech) return;

    const newName = `${techName}_copy_${Date.now()}`;
    const newTech = JSON.parse(JSON.stringify(tech));
    newTech.name = newName;
    newTech.essentials.name = newName;
    delete newTech.isTemplate;

    setTechnologies([...technologies, newTech]);
    alert(`Technology "${newName}" added to My Technologies!`);
  };

  // Handle edit
  const handleEdit = (techName, tech) => {
    setEditingTech(techName);
    setEditForm(JSON.parse(JSON.stringify(tech)));
  };

  // Handle save edit
  const handleSaveEdit = () => {
    if (!editForm || !editingTech) return;

    const updatedTechs = technologies.map(t => 
      t.name === editingTech ? editForm : t
    );
    setTechnologies(updatedTechs);
    setEditingTech(null);
    setEditForm(null);
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingTech(null);
    setEditForm(null);
  };

  // Handle delete technology
  const handleDeleteTech = () => {
    if (!editingTech) return;
    
    if (window.confirm(`Are you sure you want to delete "${editingTech}"?`)) {
      const updatedTechs = technologies.filter(t => t.name !== editingTech);
      setTechnologies(updatedTechs);
      setEditingTech(null);
      setEditForm(null);
    }
  };

  // Handle delete from card
  const handleDeleteFromCard = (techName) => {
    if (window.confirm(`Are you sure you want to delete "${techName}"?`)) {
      const updatedTechs = technologies.filter(t => t.name !== techName);
      setTechnologies(updatedTechs);
    }
  };

  // Add constraint to technology
  const addConstraint = (constraintKey, defaultValue = '') => {
    if (!editForm) return;
    
    setEditForm({
      ...editForm,
      constraints: {
        ...editForm.constraints,
        [constraintKey]: defaultValue
      }
    });
    setConstraintSearch({});
  };

  // Add cost to technology
  const addCost = (costKey, defaultValue = 0) => {
    if (!editForm) return;
    
    setEditForm({
      ...editForm,
      costs: {
        ...editForm.costs,
        monetary: {
          ...(editForm.costs?.monetary || {}),
          [costKey]: defaultValue
        }
      }
    });
    setCostSearch({});
  };

  // Group technologies for carousel
  const groupedTechs = useMemo(() => {
    const grouped = {};

    Object.entries(allTechnologies).forEach(([techName, tech]) => {
      // Skip if doesn't match search
      if (searchTerm && !techName.toLowerCase().includes(searchTerm.toLowerCase())) {
        return;
      }

      // Skip if category filter active
      if (selectedCategory !== 'all' && tech.parent !== selectedCategory) {
        return;
      }

      // Skip templates if showing only custom
      if (showOnlyCustom && tech.isTemplate) {
        return;
      }

      const parent = tech.parent;
      if (!grouped[parent]) {
        grouped[parent] = [];
      }

      grouped[parent].push({
        techName,
        tech,
        isCustom: !tech.isTemplate,
        onDuplicate: handleDuplicate,
        onEdit: handleEdit,
        onDelete: handleDeleteFromCard
      });
    });

    return grouped;
  }, [allTechnologies, searchTerm, selectedCategory, showOnlyCustom]);

  // Custom technologies grouped by parent
  const customTechsByParent = useMemo(() => {
    const grouped = {};
    
    technologies.forEach(tech => {
      // Skip if doesn't match search
      if (searchTerm && !tech.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return;
      }
      
      const parent = tech.parent || tech.essentials?.parent || 'supply';
      
      // Skip if category filter active
      if (selectedCategory !== 'all' && parent !== selectedCategory) {
        return;
      }
      
      if (!grouped[parent]) {
        grouped[parent] = [];
      }
      
      grouped[parent].push({
        techName: tech.name,
        tech,
        isCustom: true,
        onDuplicate: handleDuplicate,
        onEdit: handleEdit,
        onDelete: handleDeleteFromCard
      });
    });
    
    return grouped;
  }, [technologies, searchTerm, selectedCategory]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <style>{customScrollbarStyles}</style>
      
      <div className="flex h-screen overflow-x-hidden">
        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 bg-white/80 backdrop-blur-sm shadow-lg p-6 overflow-y-auto">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Technology Library</h2>

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search technologies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* My Technologies Section */}
          {Object.keys(customTechsByParent).length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                <span className="text-gray-600">✨</span> My Technologies
              </h3>
              <div className="space-y-1">
                {Object.keys(PARENT_TYPES).map(key => {
                  const count = (customTechsByParent[key] || []).length;
                  if (count === 0) return null;
                  
                  return (
                    <button
                      key={`custom-${key}`}
                      onClick={() => setSelectedCategory(key)}
                      className={`w-full text-left px-3 py-2 rounded transition-colors ${
                        selectedCategory === key
                          ? 'bg-gray-600 text-white'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {PARENT_TYPES[key]}
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">✨</span>
                        <span className="ml-auto">({count})</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Category Filters */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Templates</h3>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`w-full text-left px-3 py-2 rounded transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-gray-600 text-white'
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                All Categories ({Object.keys(allTechnologies).length})
              </button>
              {Object.keys(PARENT_TYPES).map(key => {
                const count = Object.values(allTechnologies).filter(t => t.parent === key).length;
                if (count === 0) return null;
                
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedCategory(key)}
                    className={`w-full text-left px-3 py-2 rounded transition-colors ${
                      selectedCategory === key
                        ? 'bg-gray-600 text-white'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {PARENT_TYPES[key]} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Show Only Custom Toggle */}
          <div className="mb-6">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyCustom}
                onChange={(e) => setShowOnlyCustom(e.target.checked)}
                className="mr-2 w-4 h-4 text-gray-600 rounded focus:ring-gray-500"
              />
              <span className="text-sm text-slate-700">Show only my technologies</span>
            </label>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="h-full overflow-y-auto p-8">
            {/* My Custom Technologies - Grouped by Parent */}
            {Object.keys(customTechsByParent).length > 0 && !showOnlyCustom && (
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="text-gray-600">✨</span> My Technologies
                </h2>
                {Object.keys(PARENT_TYPES).map(parentKey => {
                  const items = customTechsByParent[parentKey] || [];
                  if (items.length === 0) return null;

                  return (
                    <CardCarousel
                      key={`custom-${parentKey}`}
                      title={`${PARENT_TYPES[parentKey]} (Custom)`}
                      items={items}
                      onDuplicate={handleDuplicate}
                      onEdit={handleEdit}
                      onDelete={handleDeleteFromCard}
                    />
                  );
                })}
              </div>
            )}

            {/* Template Category Carousels */}
            {showOnlyCustom ? (
              Object.keys(customTechsByParent).length > 0 ? (
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="text-gray-600">✨</span> My Technologies
                  </h2>
                  {Object.keys(PARENT_TYPES).map(parentKey => {
                    const items = customTechsByParent[parentKey] || [];
                    if (items.length === 0) return null;

                    return (
                      <CardCarousel
                        key={`custom-only-${parentKey}`}
                        title={`${PARENT_TYPES[parentKey]} (Custom)`}
                        items={items}
                        onDuplicate={handleDuplicate}
                        onEdit={handleEdit}
                        onDelete={handleDeleteFromCard}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-20 text-slate-500">
                  <p className="text-xl">No custom technologies yet.</p>
                  <p className="text-sm mt-2">Duplicate a template to get started!</p>
                </div>
              )
            ) : (
              <div>
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Technology Templates</h2>
                {Object.keys(PARENT_TYPES).map(parentKey => {
                  const items = groupedTechs[parentKey] || [];
                  if (items.length === 0) return null;

                  return (
                    <CardCarousel
                      key={parentKey}
                      title={PARENT_TYPES[parentKey]}
                      items={items}
                      onDuplicate={handleDuplicate}
                      onEdit={handleEdit}
                      onDelete={handleDeleteFromCard}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingTech && editForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-t-lg">
              <h2 className="text-2xl font-bold">Edit Technology: {editingTech}</h2>
              <button
                onClick={handleCancelEdit}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <FiX size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {/* Essentials Section */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <span className="text-gray-600">📋</span> Essentials
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(editForm.essentials || {}).map(([key, value]) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {key}
                      </label>
                      {key === 'color' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={value}
                            onChange={(e) => {
                              setEditForm({
                                ...editForm,
                                essentials: {
                                  ...editForm.essentials,
                                  [key]: e.target.value
                                }
                              });
                            }}
                            className="w-12 h-10 border border-slate-300 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => {
                              setEditForm({
                                ...editForm,
                                essentials: {
                                  ...editForm.essentials,
                                  [key]: e.target.value
                                }
                              });
                            }}
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-500"
                          />
                        </div>
                      ) : key === 'parent' ? (
                        <input
                          type="text"
                          value={value}
                          disabled
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-600"
                        />
                      ) : (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => {
                            setEditForm({
                              ...editForm,
                              essentials: {
                                ...editForm.essentials,
                                [key]: e.target.value
                              }
                            });
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Constraints Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-slate-700">
                    <span className="text-gray-600">⚙️</span> Constraints ({Object.keys(editForm.constraints || {}).length})
                  </h3>
                  <button
                    onClick={() => setConstraintSearch({ main: 'open' })}
                    className="group flex h-9 items-center gap-2 rounded-full bg-gray-200 pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-gray-600 hover:pl-2 hover:text-white active:bg-gray-700 text-sm font-medium text-gray-800"
                  >
                    <span className="rounded-full bg-gray-600 p-1 text-sm transition-colors duration-300 group-hover:bg-white">
                      <FiArrowRight className="-translate-x-[200%] text-[0px] transition-all duration-300 group-hover:translate-x-0 group-hover:text-base group-hover:text-gray-600" />
                    </span>
                    <span>Add Constraint</span>
                  </button>
                </div>
                {editForm.constraints && Object.keys(editForm.constraints).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(editForm.constraints).map(([key, value]) => {
                      const definition = CONSTRAINT_DEFINITIONS[key];
                      return (
                        <div key={key} className="flex gap-2 items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <label className="block text-sm font-medium text-slate-700">
                                {key}
                              </label>
                              {definition && (
                                <div className="group relative">
                                  <FiHelpCircle className="text-slate-400 hover:text-gray-600 cursor-help" size={14} />
                                  <div className="absolute left-0 top-6 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                                    <strong>{definition.group}:</strong> {definition.desc}
                                  </div>
                                </div>
                              )}
                            </div>
                            <input
                              type="text"
                              value={typeof value === 'object' ? JSON.stringify(value) : value}
                              onChange={(e) => {
                                let parsedValue = e.target.value;
                                if (!isNaN(parsedValue) && parsedValue !== '') {
                                  parsedValue = parseFloat(parsedValue);
                                }
                                setEditForm({
                                  ...editForm,
                                  constraints: {
                                    ...editForm.constraints,
                                    [key]: parsedValue
                                  }
                                });
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-500 font-mono text-sm"
                            />
                          </div>
                          <button
                            onClick={() => {
                              const newConstraints = { ...editForm.constraints };
                              delete newConstraints[key];
                              setEditForm({
                                ...editForm,
                                constraints: newConstraints
                              });
                            }}
                            className="mt-6 p-2 text-gray-600 hover:bg-gray-100 rounded"
                          >
                            <FiTrash2 size={18} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic">No constraints defined. Click "Add Constraint" to browse available options.</p>
                )}
              </div>

              {/* Costs Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-slate-700">
                    <span className="text-gray-600">💰</span> Costs ({Object.keys(editForm.costs?.monetary || {}).length})
                  </h3>
                  <button
                    onClick={() => setCostSearch({ main: 'open' })}
                    className="group flex h-9 items-center gap-2 rounded-full bg-gray-200 pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-gray-600 hover:pl-2 hover:text-white active:bg-gray-700 text-sm font-medium text-gray-800"
                  >
                    <span className="rounded-full bg-gray-600 p-1 text-sm transition-colors duration-300 group-hover:bg-white">
                      <FiArrowRight className="-translate-x-[200%] text-[0px] transition-all duration-300 group-hover:translate-x-0 group-hover:text-base group-hover:text-gray-600" />
                    </span>
                    <span>Add Cost</span>
                  </button>
                </div>
                {editForm.costs?.monetary && Object.keys(editForm.costs.monetary).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(editForm.costs.monetary).map(([key, value]) => {
                      const definition = COST_DEFINITIONS[key];
                      return (
                        <div key={key} className="flex gap-2 items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <label className="block text-sm font-medium text-slate-700">
                                {key}
                              </label>
                              {definition && (
                                <div className="group relative">
                                  <FiHelpCircle className="text-slate-400 hover:text-gray-600 cursor-help" size={14} />
                                  <div className="absolute left-0 top-6 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                                    <strong>{definition.group}:</strong> {definition.desc}
                                  </div>
                                </div>
                              )}
                            </div>
                            <input
                              type="number"
                              step="any"
                              value={value}
                              onChange={(e) => {
                                setEditForm({
                                  ...editForm,
                                  costs: {
                                    ...editForm.costs,
                                    monetary: {
                                      ...(editForm.costs?.monetary || {}),
                                      [key]: parseFloat(e.target.value) || 0
                                    }
                                  }
                                });
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-500 font-mono text-sm"
                            />
                          </div>
                          <button
                            onClick={() => {
                              const newMonetary = { ...(editForm.costs?.monetary || {}) };
                              delete newMonetary[key];
                              setEditForm({
                                ...editForm,
                                costs: {
                                  ...editForm.costs,
                                  monetary: newMonetary
                                }
                              });
                            }}
                            className="mt-6 p-2 text-gray-600 hover:bg-gray-100 rounded"
                          >
                            <FiTrash2 size={18} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic">No costs defined. Click "Add Cost" to browse available options.</p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-6 border-t border-slate-200 bg-slate-50">
              <button
                onClick={handleDeleteTech}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <FiTrash2 size={18} />
                Delete Technology
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleCancelEdit}
                  className="px-6 py-2 bg-slate-300 text-slate-700 rounded-lg hover:bg-slate-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
                >
                  <FiSave size={18} />
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Constraint Search Modal */}
      {constraintSearch.main === 'open' && editForm && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]" 
          onClick={() => setConstraintSearch({})}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 bg-gray-600 text-white">
              <h3 className="text-lg font-bold">Available Constraints for {PARENT_TYPES[editForm.essentials?.parent] || 'Technology'}</h3>
              <p className="text-xs text-gray-100 mt-1">Browse by category and click to add</p>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-120px)]">
              {(() => {
                const parentType = editForm.essentials?.parent;
                const availableConstraints = PARENT_CONSTRAINTS[parentType] || [];
                const filteredAvailable = availableConstraints.filter(c => !editForm.constraints?.[c]);
                
                if (filteredAvailable.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-500">
                      <p className="text-sm">All available constraints have been added.</p>
                    </div>
                  );
                }

                // Group by category
                const grouped = {};
                filteredAvailable.forEach(constraint => {
                  const group = CONSTRAINT_DEFINITIONS[constraint]?.group || 'Other';
                  if (!grouped[group]) grouped[group] = [];
                  grouped[group].push(constraint);
                });

                return Object.entries(grouped).map(([group, constraints]) => {
                  const isExpanded = selectedConstraintGroup[group];
                  
                  return (
                    <div key={group} className="border-b border-slate-200 last:border-b-0">
                      <button
                        onClick={() => setSelectedConstraintGroup({ 
                          ...selectedConstraintGroup, 
                          [group]: !isExpanded 
                        })}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <span className="text-sm font-semibold text-gray-900">
                          {group} ({constraints.length})
                        </span>
                        {isExpanded ? <FiChevronDown size={16} className="text-gray-600" /> : <FiChevronRightIcon size={16} className="text-gray-600" />}
                      </button>
                      {isExpanded && (
                        <div className="divide-y divide-slate-100 bg-white">
                          {constraints.map(constraint => {
                            const def = CONSTRAINT_DEFINITIONS[constraint];
                            return (
                              <button
                                key={constraint}
                                onClick={() => addConstraint(constraint, '')}
                                className="w-full text-left px-6 py-3 hover:bg-gray-50 transition-colors"
                              >
                                <div className="font-medium text-slate-800 text-sm mb-1">{constraint}</div>
                                <div className="text-slate-600 text-xs leading-relaxed">{def?.desc || 'No description available'}</div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Cost Search Modal */}
      {costSearch.main === 'open' && editForm && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]" 
          onClick={() => setCostSearch({})}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 bg-gray-600 text-white">
              <h3 className="text-lg font-bold">Available Costs</h3>
              <p className="text-xs text-gray-100 mt-1">Browse by category and click to add</p>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-120px)]">
              {(() => {
                const existingCosts = editForm.costs?.monetary || {};
                const filteredAvailable = Object.keys(COST_DEFINITIONS).filter(c => !existingCosts[c]);
                
                if (filteredAvailable.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-500">
                      <p className="text-sm">All available costs have been added.</p>
                    </div>
                  );
                }

                // Group by category
                const grouped = {};
                filteredAvailable.forEach(cost => {
                  const group = COST_DEFINITIONS[cost]?.group || 'Other';
                  if (!grouped[group]) grouped[group] = [];
                  grouped[group].push(cost);
                });

                return Object.entries(grouped).map(([group, costs]) => {
                  const isExpanded = selectedCostGroup[group];
                  
                  return (
                    <div key={group} className="border-b border-slate-200 last:border-b-0">
                      <button
                        onClick={() => setSelectedCostGroup({ 
                          ...selectedCostGroup, 
                          [group]: !isExpanded 
                        })}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <span className="text-sm font-semibold text-gray-900">
                          {group} ({costs.length})
                        </span>
                        {isExpanded ? <FiChevronDown size={16} className="text-gray-600" /> : <FiChevronRightIcon size={16} className="text-gray-600" />}
                      </button>
                      {isExpanded && (
                        <div className="divide-y divide-slate-100 bg-white">
                          {costs.map(cost => {
                            const def = COST_DEFINITIONS[cost];
                            return (
                              <button
                                key={cost}
                                onClick={() => addCost(cost, 0)}
                                className="w-full text-left px-6 py-3 hover:bg-gray-50 transition-colors"
                              >
                                <div className="font-medium text-slate-800 text-sm mb-1">{cost}</div>
                                <div className="text-slate-600 text-xs leading-relaxed">{def?.desc || 'No description available'}</div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Technologies;

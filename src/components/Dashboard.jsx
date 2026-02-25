import React, { useMemo, useRef, useEffect } from "react";
import ModelSelector from "./ModelSelector";
import { useData } from "../context/DataContext";
import Card from "./ui/Card";
import Badge from "./ui/Badge";
import { FiMapPin, FiLink, FiZap, FiBarChart2, FiTrendingUp, FiActivity, FiDollarSign, FiCloud, FiPower } from 'react-icons/fi';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';

const Dashboard = () => {
  const { locations, links, parameters, getCurrentModel, technologies, timeSeries } = useData();
  const currentModel = getCurrentModel();

  // Create technology color map from model definitions OR from location techs
  const techMap = useMemo(() => {
    console.log('🔍 Technologies object:', technologies);
    console.log('🔍 Locations count:', locations?.length);
    
    const map = new Map();
    
    // Try to get colors from technologies object first
    if (technologies && typeof technologies === 'object') {
      Object.entries(technologies).forEach(([techName, techDef]) => {
        console.log(`  Tech from technologies: ${techName}`, techDef);
        map.set(techName, techDef);
      });
    }
    
    // If technologies is empty, extract from locations
    if (map.size === 0 && locations && Array.isArray(locations)) {
      locations.forEach(location => {
        if (location.techs) {
          Object.entries(location.techs).forEach(([techName, techData]) => {
            if (!map.has(techName) && techData) {
              console.log(`  Tech from location: ${techName}`, techData);
              map.set(techName, techData);
            }
          });
        }
      });
    }
    
    console.log(`✅ TechMap size: ${map.size}`);
    console.log('📋 Tech names in map:', Array.from(map.keys()));
    return map;
  }, [technologies, locations]);

  // Format power values: MW for < 10000, GW for >= 10000
  const formatPower = (mw) => {
    if (mw >= 10000) {
      return { value: (mw / 1000).toFixed(1), unit: 'GW' };
    }
    return { value: Math.round(mw).toLocaleString(), unit: 'MW' };
  };

  // Get technology color from model
  const getTechColor = (techName) => {
    const tech = techMap.get(techName);
    
    // Try constraints.color first (where it's actually stored in the model)
    if (tech?.constraints?.color) {
      console.log(`✅ Using constraints.color for ${techName}: ${tech.constraints.color}`);
      return tech.constraints.color;
    }
    
    // Try essentials.color (from YAML tech definitions)
    if (tech?.essentials?.color) {
      console.log(`✅ Using essentials.color for ${techName}: ${tech.essentials.color}`);
      return tech.essentials.color;
    }
    
    // Try color at root level (sometimes it's stored there)
    if (tech?.color) {
      console.log(`✅ Using root color for ${techName}: ${tech.color}`);
      return tech.color;
    }
    
    // Chilean model technology colors (common defaults)
    const chileColors = {
      'power_demand': '#072486',
      'power_lines': '#966F9E',
      '11_kv': '#966F9E',
      '13_kv': '#966F9E',
      '23_kv': '#966F9E',
      '66_kv': '#8B4C8F',
      '110_kv': '#7A3D7E',
      '154_kv': '#6B2E6D',
      '220_kv': '#5C1F5C',
      '500_kv': '#4D104D',
      'ccgt': '#E37222',
      'coal': '#4A4A4A',
      'hydro': '#4A90E2',
      'wind': '#50C878',
      'solar': '#FFD700',
      'battery': '#9B59B6',
      'hydrogen': '#00CED1',
      'biomass': '#8B4513',
      'geothermal': '#DC143C',
      'nuclear': '#FF6347'
    };
    
    // Check if tech name matches any known Chilean tech
    const lowerTechName = techName.toLowerCase();
    for (const [key, color] of Object.entries(chileColors)) {
      if (lowerTechName.includes(key)) {
        console.log(`✅ Using Chilean default for ${techName}: ${color}`);
        return color;
      }
    }
    
    // Fallback: assign distinct colors based on tech name hash
    const vibrantColors = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#16A085', '#27AE60', '#2980B9', '#8E44AD', '#C0392B', '#D35400', '#7F8C8D'];
    const hash = techName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const fallbackColor = vibrantColors[hash % vibrantColors.length];
    console.log(`⚠️ Using fallback color for ${techName}: ${fallbackColor}`);
    return fallbackColor;
  };

  // Calculate comprehensive statistics
  const stats = useMemo(() => {
    const totalLocations = locations?.length || 0;
    const totalLinks = links?.length || 0;
    
    let totalDemand = 0;
    let totalCosts = 0;
    let totalEmissions = 0;
    let activeTechnologies = new Set();
    let totalCapacity = 0;
    let demandByLocation = [];
    let techCapacities = {};
    let techCapacitiesWithColors = [];
    let costBreakdown = {
      capital: 0,
      operational: 0,
      transmission: 0
    };
    let energyMixData = {};
    
    // Calculate total demand from time series if available
    let demandFromTimeSeries = 0;
    if (timeSeries && typeof timeSeries === 'object') {
      Object.entries(timeSeries).forEach(([filename, data]) => {
        if (Array.isArray(data) && filename.toLowerCase().includes('demand')) {
          // Sum all numeric columns (excluding timestamp/date columns)
          data.forEach(row => {
            Object.entries(row).forEach(([key, value]) => {
              if (key.toLowerCase() !== 'timestamp' && key.toLowerCase() !== 'date' && !isNaN(parseFloat(value))) {
                demandFromTimeSeries += parseFloat(value) || 0;
              }
            });
          });
        }
      });
    }
    
    locations?.forEach(location => {
      if (location.techs) {
        Object.entries(location.techs).forEach(([techName, techData]) => {
          activeTechnologies.add(techName);
          
          const constraints = techData.constraints || {};
          const costs = techData.costs || {};
          
          // Extract capacity - prioritize energy_cap_max
          const capacity = parseFloat(constraints.energy_cap_max) || 
                          parseFloat(constraints.energy_cap) || 
                          parseFloat(constraints.energy_cap_min) || 0;
          
          // Only count non-demand technologies for capacity
          if (!techName.toLowerCase().includes('demand')) {
            totalCapacity += capacity;
            
            if (!techCapacities[techName]) {
              techCapacities[techName] = 0;
            }
            techCapacities[techName] += capacity;
            
            // Build energy mix
            if (!energyMixData[techName]) {
              energyMixData[techName] = { value: 0, color: getTechColor(techName) };
            }
            energyMixData[techName].value += capacity;
          }
          
          // Calculate CAPEX costs (costs.monetary.energy_cap is $/MW, multiply by capacity in MW)
          const capex = parseFloat(costs.monetary?.energy_cap) || 
                       parseFloat(costs.energy_cap) || 0;
          const omAnnual = parseFloat(costs.monetary?.om_annual) || 
                          parseFloat(costs.om_annual) || 0;
          const omCon = parseFloat(costs.monetary?.om_con) || 
                       parseFloat(costs.om_con) || 0;
          
          const capitalCost = capex * capacity; // CAPEX in $ = ($/MW) * MW
          const operationalCost = omAnnual + (omCon * capacity);
          
          totalCosts += capitalCost + operationalCost;
          costBreakdown.capital += capitalCost;
          costBreakdown.operational += operationalCost;
          
          // Calculate emissions
          let emissionFactor = 0;
          const techNameLower = techName.toLowerCase();
          if (techNameLower.includes('coal')) emissionFactor = 0.9;
          else if (techNameLower.includes('gas') || techNameLower.includes('ccgt')) emissionFactor = 0.4;
          else if (techNameLower.includes('oil')) emissionFactor = 0.7;
          
          totalEmissions += capacity * emissionFactor * 8760;
          
          // Calculate demand from location constraints
          if (techNameLower.includes('demand') || techNameLower.includes('power_demand')) {
            const demandValue = parseFloat(constraints.resource) || 
                               parseFloat(constraints.energy_cap_max) || 
                               parseFloat(constraints.energy_cap) || 0;
            totalDemand += demandValue;
            if (demandValue > 0) {
              demandByLocation.push({
                name: location.name,
                demand: demandValue
              });
            }
          }
        });
      }
    });
    
    // Use time series demand if it's available and greater than constraint-based demand
    if (demandFromTimeSeries > 0) {
      // Time series is typically hourly data, so we take the average
      const avgDemand = demandFromTimeSeries / 8760; // Assuming 8760 hourly records
      totalDemand = Math.max(totalDemand, avgDemand);
    }
    
    // Calculate transmission costs
    links?.forEach(link => {
      const linkCapex = parseFloat(link.costs?.monetary?.energy_cap) || 
                       parseFloat(link.costs?.energy_cap) || 0;
      const linkCapacity = parseFloat(link.constraints?.energy_cap_max) || 0;
      const linkCost = linkCapex * linkCapacity;
      totalCosts += linkCost;
      costBreakdown.transmission += linkCost;
    });

    // Sort tech capacities for charts with colors
    techCapacitiesWithColors = Object.entries(techCapacities)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({
        name,
        value: Math.round(value),
        color: getTechColor(name)
      }));

    // Energy mix with colors
    const energyMix = Object.entries(energyMixData)
      .map(([name, data]) => ({
        name,
        value: Math.round(data.value),
        color: data.color
      }))
      .sort((a, b) => b.value - a.value);

    console.log('📊 FINAL Energy Mix with colors:', energyMix);
    console.log('🎨 FINAL Tech Capacities with colors:', techCapacitiesWithColors);

    const totalTimeSeries = Object.keys(timeSeries || {}).length;
    const totalTemplates = Object.keys(technologies || {}).length;

    return {
      totalLocations,
      totalLinks,
      totalDemand: Math.round(totalDemand),
      activeTechnologies: activeTechnologies.size,
      totalCosts: Math.round(totalCosts),
      totalEmissions: Math.round(totalEmissions / 1000),
      totalCapacity: Math.round(totalCapacity),
      totalTimeSeries,
      totalTemplates,
      demandByLocation: demandByLocation.sort((a, b) => b.demand - a.demand).slice(0, 10),
      techCapacities: techCapacitiesWithColors,
      costBreakdown,
      energyMix
    };
  }, [locations, links, technologies, timeSeries, techMap, getTechColor]);

  // ECharts options with technology colors
  const pieChartOption = useMemo(() => ({
    title: {
      text: 'Energy Mix by Technology',
      left: 'center',
      top: 10,
      textStyle: { color: '#374151', fontSize: 14, fontWeight: 'bold' }
    },
    tooltip: { 
      trigger: 'item', 
      formatter: (params) => {
        const formatted = formatPower(params.value);
        return `${params.name}: ${formatted.value} ${formatted.unit} (${params.percent}%)`;
      }
    },
    legend: { 
      orient: 'vertical', 
      left: 'left', 
      top: 'middle', 
      textStyle: { color: '#6B7280', fontSize: 11 },
      formatter: (name) => {
        const item = stats.energyMix.find(i => i.name === name);
        if (item) {
          const formatted = formatPower(item.value);
          return `${name} (${formatted.value} ${formatted.unit})`;
        }
        return name;
      }
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['60%', '50%'],
      data: stats.energyMix.map(item => ({
        name: item.name,
        value: item.value,
        itemStyle: { color: item.color }
      })),
      //roseType: 'area',
      label: { show: false },
      emphasis: {
        label: { 
          show: true, 
          fontSize: 14, 
          fontWeight: 'bold', 
          color: '#111827',
          formatter: (params) => {
            const formatted = formatPower(params.value);
            return `${params.name}\n${formatted.value} ${formatted.unit}`;
          }
        }
      }
    }]
  }), [stats.energyMix]);

  const barChartOption = useMemo(() => ({
    title: { 
      text: 'Top 10 Technologies by Capacity (MW)', 
      left: 'center', 
      top: 10, 
      textStyle: { color: '#374151', fontSize: 14, fontWeight: 'bold' } 
    },
    tooltip: { 
      trigger: 'axis', 
      axisPointer: { type: 'shadow' }, 
      formatter: (params) => {
        if (params && params[0]) {
          const formatted = formatPower(params[0].value);
          return `${params[0].name}: ${formatted.value} ${formatted.unit}`;
        }
        return '';
      }
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '50px', containLabel: true },
    xAxis: { 
      type: 'value', 
      name: 'Capacity (MW)',
      nameTextStyle: { color: '#6B7280' },
      axisLabel: { color: '#6B7280' }, 
      axisLine: { lineStyle: { color: '#D1D5DB' } } 
    },
    yAxis: {
      type: 'category',
      data: stats.techCapacities.map(item => item.name),
      axisLabel: { color: '#6B7280', fontSize: 11 },
      axisLine: { lineStyle: { color: '#D1D5DB' } }
    },
    series: [{
      type: 'bar',
      data: stats.techCapacities.map(item => ({
        value: item.value,
        itemStyle: { color: item.color }
      })),
      barWidth: '60%',
      label: {
        show: true,
        position: 'right',
        formatter: (params) => {
          const formatted = formatPower(params.value);
          return `${formatted.value} ${formatted.unit}`;
        },
        color: '#374151',
        fontSize: 10
      }
    }]
  }), [stats.techCapacities]);

  const demandChartOption = useMemo(() => ({
    title: { 
      text: 'Demand by Location (MW)', 
      left: 'center', 
      top: 10, 
      textStyle: { color: '#374151', fontSize: 14, fontWeight: 'bold' } 
    },
    tooltip: { 
      trigger: 'axis', 
      formatter: (params) => {
        if (params && params[0]) {
          const formatted = formatPower(params[0].value);
          return `${params[0].name}: ${formatted.value} ${formatted.unit}`;
        }
        return '';
      }
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '50px', containLabel: true },
    xAxis: {
      type: 'category',
      data: stats.demandByLocation.map(d => d.name),
      axisLabel: { color: '#6B7280', rotate: 45, fontSize: 10 },
      axisLine: { lineStyle: { color: '#D1D5DB' } }
    },
    yAxis: {
      type: 'value',
      name: 'Power',
      nameTextStyle: { color: '#6B7280' },
      axisLabel: { 
        color: '#6B7280', 
        formatter: (value) => {
          const formatted = formatPower(value);
          return `${formatted.value} ${formatted.unit}`;
        }
      },
      axisLine: { lineStyle: { color: '#D1D5DB' } },
      splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } }
    },
    series: [{
      type: 'line',
      data: stats.demandByLocation.map(d => d.demand),
      smooth: true,
      lineStyle: { color: '#374151', width: 3 },
      itemStyle: { color: '#1F2937', borderColor: '#fff', borderWidth: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(55, 65, 81, 0.3)' },
          { offset: 1, color: 'rgba(55, 65, 81, 0.05)' }
        ])
      }
    }]
  }), [stats.demandByLocation]);

  const costBreakdownOption = useMemo(() => ({
    title: { 
      text: 'Cost Distribution ($)', 
      left: 'center', 
      top: 10, 
      textStyle: { color: '#374151', fontSize: 14, fontWeight: 'bold' } 
    },
    tooltip: { 
      trigger: 'item', 
      formatter: '{b}: ${c:,.0f} ({d}%)' 
    },
    legend: { 
      orient: 'horizontal', 
      bottom: 10, 
      textStyle: { color: '#6B7280' } 
    },
    series: [{
      type: 'pie',
      radius: '60%',
      center: ['50%', '45%'],
      data: [
        { value: Math.round(stats.costBreakdown.capital), name: 'Capital (CAPEX)' },
        { value: Math.round(stats.costBreakdown.operational), name: 'Operational (OPEX)' },
        { value: Math.round(stats.costBreakdown.transmission), name: 'Transmission' }
      ],
      itemStyle: {
        color: (params) => ['#1F2937', '#4B5563', '#9CA3AF'][params.dataIndex]
      },
      label: { 
        color: '#374151', 
        fontSize: 12,
        formatter: '{b}\n${c:,.0f}'
      }
    }]
  }), [stats.costBreakdown]);

  // Time series demand chart
  const timeSeriesDemandOption = useMemo(() => {
    // Extract demand time series data
    const seriesData = [];
    const categories = [];
    
    if (timeSeries && typeof timeSeries === 'object') {
      Object.entries(timeSeries).forEach(([filename, data]) => {
        if (Array.isArray(data) && data.length > 0 && filename.toLowerCase().includes('demand')) {
          // Take first 24 hours as sample (or all data if less than 24)
          const sampleSize = Math.min(24, data.length);
          const sampleData = data.slice(0, sampleSize);
          
          // Extract time categories (first column usually timestamp)
          const firstKey = Object.keys(sampleData[0])[0];
          if (!categories.length) {
            categories.push(...sampleData.map((row, idx) => row[firstKey] || `H${idx + 1}`));
          }
          
          // Extract demand values for each location
          const locationColumns = Object.keys(sampleData[0]).filter(
            key => key.toLowerCase() !== 'timestamp' && key.toLowerCase() !== 'date'
          );
          
          // For dashboard, show total demand over time
          const totalDemandOverTime = sampleData.map(row => {
            let sum = 0;
            locationColumns.forEach(col => {
              sum += parseFloat(row[col]) || 0;
            });
            return sum.toFixed(2);
          });
          
          seriesData.push({
            name: 'Total Demand',
            type: 'line',
            data: totalDemandOverTime,
            smooth: true,
            lineStyle: { color: '#072486', width: 2 },
            itemStyle: { color: '#072486' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(7, 36, 134, 0.3)' },
                { offset: 1, color: 'rgba(7, 36, 134, 0.05)' }
              ])
            }
          });
        }
      });
    }
    
    if (seriesData.length === 0) {
      return null;
    }
    
    return {
      title: { 
        text: 'Demand Over Time', 
        left: 'center', 
        top: 10, 
        textStyle: { color: '#374151', fontSize: 14, fontWeight: 'bold' } 
      },
      tooltip: { 
        trigger: 'axis',
        formatter: (params) => {
          if (params && params[0]) {
            const formatted = formatPower(parseFloat(params[0].value));
            return `${params[0].name}: ${formatted.value} ${formatted.unit}`;
          }
          return '';
        }
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '50px', containLabel: true },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { color: '#6B7280', rotate: 45, fontSize: 10 },
        axisLine: { lineStyle: { color: '#D1D5DB' } }
      },
      yAxis: {
        type: 'value',
        name: 'Power',
        axisLabel: { 
          color: '#6B7280', 
          fontSize: 10, 
          formatter: (value) => {
            const formatted = formatPower(value);
            return `${formatted.value}${formatted.unit}`;
          }
        },
        axisLine: { lineStyle: { color: '#D1D5DB' } },
        splitLine: { lineStyle: { color: '#F3F4F6' } }
      },
      series: seriesData
    };
  }, [timeSeries]);

  return (
    <div className="flex-1 p-8 bg-gray-50">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
            <p className="text-gray-600">Energy System Performance Overview</p>
            {currentModel && (
              <p className="text-sm text-gray-600 mt-1 font-semibold">Active Model: {currentModel.name}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ModelSelector />
          </div>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="hover:shadow-xl transition-all border-2 border-gray-300">
          <div className="text-center p-4">
            <div className="mx-auto w-16 h-16 bg-gray-900 rounded-xl flex items-center justify-center mb-3">
              <FiPower className="text-white" size={28} />
            </div>
            <p className="text-sm text-gray-600 mb-2 font-medium">Total Demand</p>
            <h3 className="text-4xl font-bold text-gray-900">{stats.totalDemand.toLocaleString()}</h3>
            <p className="text-xs text-gray-500 mt-1">MW</p>
          </div>
        </Card>

        <Card className="hover:shadow-xl transition-all border-2 border-gray-300">
          <div className="text-center p-4">
            <div className="mx-auto w-16 h-16 bg-gray-800 rounded-xl flex items-center justify-center mb-3">
              <FiZap className="text-white" size={28} />
            </div>
            <p className="text-sm text-gray-600 mb-2 font-medium">Generation Capacity</p>
            <h3 className="text-4xl font-bold text-gray-900">
              {(() => {
                const formatted = formatPower(stats.totalCapacity);
                return formatted.value;
              })()}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {(() => {
                const formatted = formatPower(stats.totalCapacity);
                return `${formatted.unit} installed`;
              })()}
            </p>
          </div>
        </Card>

        <Card className="hover:shadow-xl transition-all border-2 border-gray-300">
          <div className="text-center p-4">
            <div className="mx-auto w-16 h-16 bg-gray-700 rounded-xl flex items-center justify-center mb-3">
              <FiDollarSign className="text-white" size={28} />
            </div>
            <p className="text-sm text-gray-600 mb-2 font-medium">Total System Cost</p>
            <h3 className="text-4xl font-bold text-gray-900">
              ${(stats.totalCosts / 1000000).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}M
            </h3>
            <p className="text-xs text-gray-500 mt-1">CAPEX + OPEX</p>
          </div>
        </Card>

        <Card className="hover:shadow-xl transition-all border-2 border-gray-300">
          <div className="text-center p-4">
            <div className="mx-auto w-16 h-16 bg-gray-600 rounded-xl flex items-center justify-center mb-3">
              <FiCloud className="text-white" size={28} />
            </div>
            <p className="text-sm text-gray-600 mb-2 font-medium">CO₂ Emissions</p>
            <h3 className="text-4xl font-bold text-gray-900">{stats.totalEmissions.toLocaleString()}</h3>
            <p className="text-xs text-gray-500 mt-1">tonnes/year</p>
          </div>
        </Card>
      </div>

      {/* System Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="border-2 border-gray-200">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FiActivity className="text-gray-700" size={20} />
              </div>
              <h3 className="font-semibold text-gray-900">System Efficiency</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Capacity Factor</span>
                <span className="text-lg font-bold text-gray-900">
                  {((stats.totalDemand / Math.max(1, stats.totalCapacity)) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Active Technologies</span>
                <span className="text-lg font-bold text-gray-900">{stats.activeTechnologies}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Network Nodes</span>
                <span className="text-lg font-bold text-gray-900">{stats.totalLocations}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-2 border-gray-200">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FiDollarSign className="text-gray-700" size={20} />
              </div>
              <h3 className="font-semibold text-gray-900">Cost Breakdown</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">CAPEX</span>
                <span className="text-lg font-bold text-gray-900">
                  ${(stats.costBreakdown.capital / 1000000).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}M
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">OPEX</span>
                <span className="text-lg font-bold text-gray-900">
                  ${(stats.costBreakdown.operational / 1000000).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}M
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Transmission</span>
                <span className="text-lg font-bold text-gray-900">
                  ${(stats.costBreakdown.transmission / 1000000).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}M
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-2 border-gray-200">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FiBarChart2 className="text-gray-700" size={20} />
              </div>
              <h3 className="font-semibold text-gray-900">Model Stats</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Transmission Links</span>
                <span className="text-lg font-bold text-gray-900">{stats.totalLinks}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Tech Templates</span>
                <span className="text-lg font-bold text-gray-900">{stats.totalTemplates}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Time Series</span>
                <span className="text-lg font-bold text-gray-900">{stats.totalTimeSeries}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="border-2 border-gray-200">
          <ReactECharts option={pieChartOption} style={{ height: '350px' }} notMerge={true} lazyUpdate={true} />
        </Card>
        <Card className="border-2 border-gray-200">
          <ReactECharts option={barChartOption} style={{ height: '350px' }} notMerge={true} lazyUpdate={true} />
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="border-2 border-gray-200">
          <ReactECharts option={demandChartOption} style={{ height: '350px' }} notMerge={true} lazyUpdate={true} />
        </Card>
        <Card className="border-2 border-gray-200">
          <ReactECharts option={costBreakdownOption} style={{ height: '350px' }} notMerge={true} lazyUpdate={true} />
        </Card>
      </div>

      {/* Time Series Chart */}
      {timeSeriesDemandOption && (
        <div className="mb-8">
          <Card className="border-2 border-gray-200">
            <ReactECharts option={timeSeriesDemandOption} style={{ height: '350px' }} notMerge={true} lazyUpdate={true} />
          </Card>
        </div>
      )}

      {/* Mini Flow Diagram */}
      <div className="mb-8">
        <Card className="border-2 border-gray-200">
          <div className="p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-6 text-center">Energy System Flow</h3>
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="mx-auto w-20 h-20 bg-gray-900 rounded-full flex items-center justify-center mb-3">
                  <FiZap className="text-white" size={32} />
                </div>
                <p className="font-semibold text-gray-900 text-sm">Generation</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {(() => {
                    const formatted = formatPower(stats.totalCapacity);
                    return formatted.value;
                  })()}
                </p>
                <p className="text-xs text-gray-500">
                  {(() => {
                    const formatted = formatPower(stats.totalCapacity);
                    return formatted.unit;
                  })()}
                </p>
              </div>
              <div className="flex-1 flex items-center justify-center px-4">
                <div className="h-1 w-full bg-gradient-to-r from-gray-900 to-gray-600"></div>
                <svg className="w-6 h-6 text-gray-600 -ml-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="text-center flex-1">
                <div className="mx-auto w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mb-3">
                  <FiLink className="text-white" size={32} />
                </div>
                <p className="font-semibold text-gray-900 text-sm">Transmission</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.totalLinks}</p>
                <p className="text-xs text-gray-500">Links</p>
              </div>
              <div className="flex-1 flex items-center justify-center px-4">
                <div className="h-1 w-full bg-gradient-to-r from-gray-700 to-gray-500"></div>
                <svg className="w-6 h-6 text-gray-500 -ml-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="text-center flex-1">
                <div className="mx-auto w-20 h-20 bg-gray-500 rounded-full flex items-center justify-center mb-3">
                  <FiPower className="text-white" size={32} />
                </div>
                <p className="font-semibold text-gray-900 text-sm">Demand</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {(() => {
                    const formatted = formatPower(stats.totalDemand);
                    return formatted.value;
                  })()}
                </p>
                <p className="text-xs text-gray-500">
                  {(() => {
                    const formatted = formatPower(stats.totalDemand);
                    return formatted.unit;
                  })()}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;

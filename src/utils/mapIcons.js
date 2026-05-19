import { getTechColor } from './techUtils';

export const createPieChartPaths = (technologies, techMap) => {
  if (!technologies || Object.keys(technologies).length === 0) {
    return [];
  }

  const techNames = Object.keys(technologies);
  const count = techNames.length;

  if (count === 1) {
    return null;
  }

  const paths = [];
  const centerX = 12;
  const centerY = 12;
  const radius = 10;
  const anglePerSlice = (2 * Math.PI) / count;

  techNames.forEach((techName, index) => {
    const startAngle = index * anglePerSlice - Math.PI / 2;
    const endAngle = (index + 1) * anglePerSlice - Math.PI / 2;

    const x1 = centerX + radius * Math.cos(startAngle);
    const y1 = centerY + radius * Math.sin(startAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);

    const largeArcFlag = anglePerSlice > Math.PI ? 1 : 0;

    const pathData = [
      `M ${centerX} ${centerY}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      'Z'
    ].join(' ');

    const tech = technologies[techName];
    const color = getTechColor(tech || techName, techMap);
    const colorHex = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

    paths.push({ path: pathData, color: colorHex });
  });

  return paths;
};

export const createLocationIcon = (location, techMap, cache) => {
  if (!location) {
    const cacheKey = 'fallback';
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const icon = {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" shape-rendering="geometricPrecision">
          <circle cx="12" cy="12" r="10" fill="rgb(158, 158, 158)" stroke="#000000" stroke-width="2"/>
        </svg>
      `)}`,
      width: 32,
      height: 32,
      anchorX: 16,
      anchorY: 16
    };
    cache.set(cacheKey, icon);
    return icon;
  }

  const techKeys = Object.keys(location.techs || {}).sort().join(',');
  const cacheKey = `${location.id}-${location.isNode}-${techKeys}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  if (location.isNode) {
    const techs = location.techs || {};
    const hasDemand = Object.keys(techs).some(t => t.toLowerCase().includes('demand')) ||
                      location.demandProfile || location.totalDemandMWh;
    const color = hasDemand ? 'rgb(244, 67, 54)' : 'rgb(33, 33, 33)';

    const icon = {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" shape-rendering="geometricPrecision">
          <path d="M12 4 L20 18 L4 18 Z" fill="${color}" stroke="#000000" stroke-width="1.5"/>
        </svg>
      `)}`,
      width: 32,
      height: 32,
      anchorX: 16,
      anchorY: 16
    };
    cache.set(cacheKey, icon);
    return icon;
  }

  const techs = location.techs || {};
  const techNames = Object.keys(techs);

  if (techNames.length <= 1) {
    const color = techNames.length > 0 ? getTechColor(techNames[0], techMap) : [148, 163, 184, 200];
    const colorHex = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

    const icon = {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" shape-rendering="geometricPrecision">
          <circle cx="12" cy="12" r="10" fill="${colorHex}" stroke="#000000" stroke-width="2"/>
        </svg>
      `)}`,
      width: 32,
      height: 32,
      anchorX: 16,
      anchorY: 16
    };
    cache.set(cacheKey, icon);
    return icon;
  }

  const piePaths = createPieChartPaths(techs, techMap);

  if (!piePaths || piePaths.length === 0) {
    const color = getTechColor(techNames[0], techMap);
    const colorHex = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

    const icon = {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" shape-rendering="geometricPrecision">
          <circle cx="12" cy="12" r="10" fill="${colorHex}" stroke="#000000" stroke-width="2"/>
        </svg>
      `)}`,
      width: 32,
      height: 32,
      anchorX: 16,
      anchorY: 16
    };
    cache.set(cacheKey, icon);
    return icon;
  }

  const pathsStr = piePaths.map(p => `<path d="${p.path}" fill="${p.color}"/>`).join('');

  const icon = {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" shape-rendering="geometricPrecision">
        <circle cx="12" cy="12" r="11" fill="white" stroke="white" stroke-width="1"/>
        ${pathsStr}
        <circle cx="12" cy="12" r="10" fill="none" stroke="#000000" stroke-width="2"/>
      </svg>
    `)}`,
    width: 32,
    height: 32,
    anchorX: 16,
    anchorY: 16
  };
  cache.set(cacheKey, icon);
  return icon;
};

export const substationIconCache = {};

export const getSubstationIcon = (type) => {
  if (substationIconCache[type]) {
    return substationIconCache[type];
  }

  const colors = {
    transmission: [220, 20, 60],
    distribution: [255, 69, 0],
    converter: [255, 0, 0],
    traction: [178, 34, 34],
    other: [139, 0, 0]
  };

  const color = colors[type] || colors.other;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const rectSize = 50;
  const x = (64 - rectSize) / 2;
  const y = (64 - rectSize) / 2;

  ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.75)`;
  ctx.fillRect(x, y, rectSize, rectSize);

  ctx.strokeStyle = `rgba(${Math.max(0, color[0] - 50)}, ${Math.max(0, color[1] - 20)}, ${Math.max(0, color[2] - 20)}, 0.9)`;
  ctx.lineWidth = 1.5;

  for (let i = -rectSize; i < rectSize * 2; i += 8) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + rectSize, y + rectSize);
    ctx.stroke();
  }

  ctx.strokeStyle = `rgba(${Math.max(0, color[0] - 30)}, ${Math.max(0, color[1] - 10)}, ${Math.max(0, color[2] - 10)}, 1)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, rectSize, rectSize);

  const iconData = {
    url: canvas.toDataURL(),
    width: 64,
    height: 64,
    anchorY: 32
  };

  substationIconCache[type] = iconData;
  return iconData;
};

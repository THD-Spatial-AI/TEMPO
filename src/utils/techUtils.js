import { FiSun, FiWind, FiBattery, FiZap, FiActivity, FiDroplet, FiHome, FiCircle } from "react-icons/fi";

export const getTechColor = (techNameOrObject, techMap = null) => {
  let colorHex = null;
  let techName = '';

  if (typeof techNameOrObject === 'object' && techNameOrObject !== null) {
    colorHex = techNameOrObject.essentials?.color || techNameOrObject.color;
    techName = techNameOrObject.essentials?.name || techNameOrObject.name || '';
  } else {
    techName = techNameOrObject;
  }

  if (techMap && techName && techMap[techName]) {
    const techDef = techMap[techName];
    const techColor = techDef.essentials?.color || techDef.color;
    if (techColor && techColor.startsWith('#')) {
      const r = parseInt(techColor.slice(1, 3), 16);
      const g = parseInt(techColor.slice(3, 5), 16);
      const b = parseInt(techColor.slice(5, 7), 16);
      return [r, g, b, 220];
    }
  }

  if (colorHex && colorHex.startsWith('#')) {
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    return [r, g, b, 220];
  }

  const name = techName.toLowerCase();
  if (name.includes('wind')) return [76, 175, 80, 220];
  if (name.includes('solar') || name.includes('pv')) return [255, 235, 59, 220];
  if (name.includes('hydro')) return [33, 150, 243, 220];
  if (name.includes('coal')) return [96, 57, 19, 220];
  if (name.includes('gas') || name.includes('ccgt')) return [255, 152, 0, 220];
  if (name.includes('nuclear')) return [156, 39, 176, 220];
  if (name.includes('oil') || name.includes('diesel')) return [66, 66, 66, 220];
  if (name.includes('battery') || name.includes('storage')) return [168, 85, 247, 220];
  if (name.includes('demand')) return [244, 67, 54, 220];

  return [158, 158, 158, 200];
};

export const getTechIcon = (techName) => {
  const name = techName.toLowerCase();
  if (name.includes('solar') || name.includes('pv')) return { icon: FiSun, color: '#ca8a04' };
  if (name.includes('wind')) return { icon: FiWind, color: '#2563eb' };
  if (name.includes('battery') || name.includes('storage')) return { icon: FiBattery, color: '#9333ea' };
  if (name.includes('gas') || name.includes('ccgt')) return { icon: FiZap, color: '#ea580c' };
  if (name.includes('coal')) return { icon: FiActivity, color: '#374151' };
  if (name.includes('biomass')) return { icon: FiDroplet, color: '#16a34a' };
  if (name.includes('demand')) return { icon: FiHome, color: '#dc2626' };
  return { icon: FiCircle, color: '#64748b' };
};

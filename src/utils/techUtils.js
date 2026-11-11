import { FiSun, FiWind, FiBattery, FiZap, FiActivity, FiDroplet, FiHome, FiCircle } from "../components/ui/icons";

// Single source of tech colours (shared by Creation, Map view and legends).
export { getTechColor } from './mapVisuals';

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

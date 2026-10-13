import {
  FiTrendingUp, FiCloud, FiZap, FiSliders, FiSun, FiMapPin, FiWind,
  FiActivity, FiLayers, FiGitMerge,
} from 'react-icons/fi';

const ICONS = { FiTrendingUp, FiCloud, FiZap, FiSliders, FiSun, FiMapPin, FiWind, FiActivity, FiLayers, FiGitMerge };

export default function CategoryTile({ meta, size = 'md' }) {
  const Icon = ICONS[meta?.icon] || FiSliders;
  const box = size === 'lg' ? 'h-9 w-9 rounded-xl' : size === 'sm' ? 'h-6 w-6 rounded-md' : 'h-8 w-8 rounded-lg';
  const iconSize = size === 'lg' ? 17 : size === 'sm' ? 12 : 15;
  return (
    <span className={`grid shrink-0 place-items-center bg-gradient-to-br text-white shadow-sm ${box} ${meta?.color || 'from-slate-500 to-slate-600'}`}>
      <Icon size={iconSize} />
    </span>
  );
}

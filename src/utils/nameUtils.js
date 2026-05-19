export const normalizeFolderName = (name) => {
  if (!name) return '';
  return name
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/ü/g, 'ue')
    .replace(/ö/g, 'oe')
    .replace(/ä/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/'/g, '')
    .replace(/"/g, '');
};

export const formatTechName = (techName) => {
  if (!techName) return '';
  const formatted = techName
    .replace(/_/g, ' ')
    .replace(/-/g, ' ');
  return formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase();
};

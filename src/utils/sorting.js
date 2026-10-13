// Sort state for table headers: a new column sorts ascending, the same column toggles.
export function nextSort(sort, key) {
  return sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
}

// Numbers compare numerically, everything else as text; empty values sort last.
export function compareValues(a, b) {
  const na = typeof a === 'number' ? a : parseFloat(a);
  const nb = typeof b === 'number' ? b : parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  if (a == null || a === '') return 1;
  if (b == null || b === '') return -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

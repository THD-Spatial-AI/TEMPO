// Converts the Creation draft (temp locations/links keyed by id) into the internal
// model shape that createModel stores and the readiness checker reads.
import { LINK_TYPES } from '../../config/linkTypes';

export function buildDraftModel({ tempLocations, tempLinks }, techMap, { timeSeries, currentModelId }) {
  const locations = tempLocations.map(loc => ({
    name: loc.name,
    latitude: loc.latitude,
    longitude: loc.longitude,
    type: loc.isNode ? 'node' : 'site',
    isNode: loc.isNode,
    // Keep metadata (kind: substation/plant/transmission_node) so the Map View
    // renders these with the same palette/shape as the Creation OSM overlay.
    metadata: loc.metadata || {},
    coordinates: {
      lat: loc.latitude,
      lon: loc.longitude
    },
    techs: loc.techs || {},
    available_techs: Object.keys(loc.techs || {}).join(',')
  }));

  // A link end whose location was deleted keeps its raw id so the checker can report it.
  const nameById = new Map(tempLocations.map(l => [l.id, l.name]));
  const nameOf = (id) => nameById.get(id) ?? String(id);
  const links = tempLinks.map(link => {
    const lt = link.linkType ? LINK_TYPES[link.linkType] : null;
    return {
      from: nameOf(link.from),
      to: nameOf(link.to),
      distance: link.distance,
      // Per-link transmission capacity (MW) → energy_cap_max on Calliope export.
      capacity: link.capacity ?? null,
      linkType: link.linkType || null,
      carrier: link.carrier || lt?.carrier || 'electricity',
      // Calliope tech key used in techs.yaml and links section
      tech: lt?.calliopeTech || link.tech || link.linkType || 'ac_transmission',
    };
  });

  // Collect all unique technologies from locations
  const technologies = [];
  tempLocations.forEach(loc => {
    if (loc.techs) {
      Object.entries(loc.techs).forEach(([techName, techData]) => {
        if (!technologies.find(t => t.name === techName)) {
          const template = techMap[techName];
          if (template) {
            technologies.push({
              ...template,
              name: techName,
              constraints: { ...template.constraints, ...techData?.constraints },
              costs: { ...template.costs, ...techData?.costs },
              essentials: { ...template.essentials, ...techData?.essentials }
            });
          }
        }
      });
    }
  });

  // Auto-add transmission tech definitions for each unique link type used
  const seenTechs = new Set(technologies.map(t => t.name));
  tempLinks.forEach(link => {
    if (!link.linkType) return;
    const lt = LINK_TYPES[link.linkType];
    if (!lt) return;
    const techId = lt.calliopeTech;
    if (seenTechs.has(techId)) return;
    seenTechs.add(techId);
    technologies.push({
      name: techId,
      parent: 'transmission',
      essentials: { name: lt.label, parent: 'transmission', carrier: lt.carrier, color: '#94A3B8' },
      constraints: {
        energy_cap_max: 'inf',
        energy_eff: lt.defaults.energy_eff ?? 0.98,
        lifetime: lt.defaults.lifetime ?? 40,
      },
      costs: {
        monetary: {
          interest_rate: 0.05,
          ...(lt.defaults.energy_cap_per_distance != null
            ? { energy_cap_per_distance: lt.defaults.energy_cap_per_distance }
            : {}),
        },
      },
    });
  });

  // Carry forward any generated/session timeSeries (e.g. the OSM substation
  // demand CSV). createModel does setTimeSeries(newModel.timeSeries), so if we
  // pass [] here the demand entry is WIPED from context on save. Strip modelId
  // so createModel assigns the new model's id.
  const draftTimeSeries = (timeSeries || [])
    .filter(ts => ts && ts.columns && ts.data && (ts.source === 'osm-demand' || !ts.modelId || ts.modelId === currentModelId))
    // eslint-disable-next-line no-unused-vars
    .map(({ modelId, ...rest }) => rest);

  return { locations, links, technologies, timeSeries: draftTimeSeries };
}

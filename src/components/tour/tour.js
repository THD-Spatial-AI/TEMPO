// Guided tours: one app-wide tour plus one per sidebar view, each with its own
// "seen" flag, and a tiny event bus to (re)start a tour.
const doneKey = (id) => (id === 'app' ? 'tempo:tourCompleted' : `tempo:tourCompleted:${id.toLowerCase().replace(/\s+/g, '-')}`);
let listener = null;

export function hasSeenTour(id = 'app') {
  try { return localStorage.getItem(doneKey(id)) === '1'; } catch { return true; }
}

export function markTourSeen(id = 'app') {
  try { localStorage.setItem(doneKey(id), '1'); } catch { /* storage blocked */ }
}

export function startTour(id = 'app') {
  listener?.(id);
}

export function onTourStart(fn) {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

// ── Target helpers (resolve lazily, when the step is shown) ──────────────────
const clean = (el) => el.textContent.trim().replace(/^[a-z_0-9]+\s*(?=[A-Z0-9⚡+])/, '').trim();
const find = (sel, re) => [...document.querySelectorAll(sel)].find((el) => el.offsetParent !== null && re.test(clean(el)));
const MAIN = '#main-content';
// a main-area button whose label matches
const button = (re) => () => find(`${MAIN} button`, re);
// the row/group that holds a matching button (tab bars, segmented controls)
const group = (re) => () => find(`${MAIN} button`, re)?.parentElement;
// the card/section that holds a matching heading or label
const section = (re, sel = 'h1,h2,h3,span,p') => () => {
  const el = find(sel.split(',').map((s) => `${MAIN} ${s}`).join(','), re);
  return el?.closest('section') || el?.closest('.bg-white') || el?.parentElement;
};
const nav = (label) => `nav [aria-label="${label}"]`;

const APP_STEPS = [
  { title: 'Welcome to TEMPO', text: 'TEMPO helps you build an energy system model, optimise it with an open-source engine and explore the results. This short tour shows where everything lives.' },
  { target: nav('Dashboard'), title: 'Dashboard', text: 'An overview of the active model: locations, links, capacities, costs and time series at a glance.' },
  { target: nav('Tutorial'), title: 'Tutorial', text: 'Step-by-step guides on modelling concepts and how to use each part of the app.' },
  { target: nav('Creation'), title: 'Creation', text: 'Draw your system on the map: drop locations, connect them with links, assign technologies and save it as a model.', visual: ['model'] },
  { target: nav('Structure'), title: 'Model structure', text: 'Review and edit a saved model: models, map view, locations, links, time series and scenarios.' },
  { target: nav('Tech Database'), title: 'Tech Database', text: 'Browse technology parameters (costs, efficiencies, lifetimes) from the OpenTech catalogue and add them to your model.' },
  { target: nav('Export'), title: 'Export', text: 'Export a model as engine-ready files (e.g. Calliope YAML) to share or run elsewhere.' },
  { target: nav('Run'), title: 'Run', text: 'Choose an engine (Calliope, PyPSA, OSeMOSYS, AdOpT-NET0), a time range and a solver, then start the optimisation.' },
  { target: nav('Results'), title: 'Results', text: 'Explore a finished run: maps, energy flows, dispatch, costs and the AI model advisor.' },
  { target: nav('Settings'), title: 'Settings', text: 'Default view, AI provider and other preferences.' },
  { target: '[data-tour="version"]', title: "What's new", text: 'Release notes for the current version, loaded from GitHub.' },
  { target: '[data-tour="restart-tour"]', title: 'Replay any time', text: 'Each page has its own short tour the first time you open it. Use this button to replay the tour of the page you are on.' },
];

const VIEW_TOURS = {
  Dashboard: [
    { title: 'Model dashboard', text: 'A summary of the input data of the active model, before you run it.' },
    { target: '[data-tour="model-selector"]', title: 'Active model', text: 'Switch, rename or delete models here. Every page works on the model selected here.' },
    { target: group(/^Overview$/), title: 'Dashboard tabs', text: 'Generation, demand, network, cost and time series views of the same model.' },
    { target: () => find(`${MAIN} p`, /^Locations$/)?.closest('.grid'), title: 'Key figures', text: 'Counts of locations, links and technologies, plus capacity and cost estimates.' },
    { target: section(/^Location Map$/), title: 'Location map', text: 'Every location coloured by its main technology and sized by capacity. Click a marker for details.' },
    { target: section(/^Technology Categories$/), title: 'Technology categories', text: 'How the model’s technologies split into supply, storage, conversion and demand. Click a category to list its technologies.' },
  ],
  Creation: [
    { title: 'Build a model on the map', text: 'Creation is where you draw your energy system: locations, links between them, technologies, then save. This tour walks through the tools.', visual: ['model'] },
    { target: '[data-tour="creation-modes"]', title: 'Drawing modes', text: 'Location drops a node, Link connects two nodes, Polyline draws a chain of linked points. Click a mode again to leave it.', visual: ['location', 'link', 'polyline'] },
    { target: '[data-tour="mode-guide"]', title: 'What each mode means', text: 'Open this any time for a short explanation of locations, links and polylines.' },
    { target: '[data-tour="creation-map"]', title: 'The map', text: 'With a mode active, click here to place locations or connect them. Click an existing location to edit its name and technologies.' },
    { target: '[data-tour="tech-library"]', title: 'Tech Library', text: 'Technologies from the OpenTech catalogue. Add them to locations to define generation, storage and demand.' },
    { target: '[data-tour="map-layers"]', title: 'Basemap', text: 'Switch between street, satellite and topographic maps.' },
    { target: '[data-tour="entity-locations"]', title: 'Locations list', text: 'Every location you place appears here. Select one to zoom to it, edit it, or clear the list.' },
    { target: '[data-tour="link-type"]', title: 'Link type', text: 'Choose what new links represent, e.g. an HVAC overhead line, HVDC cable or gas pipeline. It sets the transmission technology.' },
    { target: '[data-tour="entity-links"]', title: 'Links list', text: 'All connections between locations, with their type and length.' },
    { target: '[data-tour="osm-panel"]', title: 'OSM infrastructure', text: 'Open this panel to search a country or region and load the real transmission grid, power plants and substations as a reference while you draw.' },
    { target: '[data-tour="save-model"]', title: 'Save the model', text: 'When your system is ready, save it as a model. The Save button appears in the bottom-right corner once you have placed a location.' },
  ],
  Models: [
    { title: 'Your models', text: 'Create, import, load and manage energy system models.' },
    { target: section(/^Import a model$/), title: 'Import a model', text: 'Import existing model files: Calliope today, more formats soon. To build a new model from scratch, use Creation.' },
    { target: section(/^Your Models/), title: 'Saved models', text: 'Models stored on this device. Load one to make it active, edit its details, or delete it. Tick several for bulk actions.' },
    { target: section(/^Template Models/), title: 'Templates', text: 'Ready-made example systems (Germany, Europe, Chile) to explore or use as a starting point.' },
  ],
  'Map View': [
    { title: 'Map view', text: 'The saved model on a map. Edit locations and links directly here.' },
    { target: group(/^Polyline$/), title: 'Editing modes', text: 'Add locations, connect them or draw polylines, as in Creation.' },
    { target: () => find(`${MAIN} button`, /^Locations\d*$/)?.closest('section') || find(`${MAIN} button`, /^Locations\d*$/)?.parentElement, title: 'Locations and links', text: 'Lists of everything in the model. Use the pencil to edit and the bin to delete.' },
  ],
  Locations: [
    { title: 'Locations', text: 'All nodes of the model in one table, with their technologies and coordinates.' },
    { target: button(/Add location$/), title: 'Add a location', text: 'Create a location by name and coordinates without using the map.' },
    { target: () => { const el = find(`${MAIN} button`, /^Name/); return el?.closest('table') || el?.closest('.bg-white'); }, title: 'Location table', text: 'Sort by any column. Expand a row to see and edit the technologies at that location.' },
  ],
  Links: [
    { title: 'Links', text: 'All transmission connections of the model: routes, carriers, capacities and distances.' },
    { target: button(/Add link$/), title: 'Add a link', text: 'Connect two existing locations and choose the link technology.' },
    { target: group(/^All\d+$/), title: 'Filter by carrier', text: 'Show only electricity, gas, hydrogen or heat links.' },
    { target: () => find(`${MAIN} button`, /^Route/)?.closest('table'), title: 'Link table', text: 'Sort by route, type, capacity or distance, and edit or delete individual links.' },
  ],
  TimeSeries: [
    { title: 'Time series', text: 'Hourly profiles such as demand and solar or wind availability used by the model.' },
    { target: button(/File format$/), title: 'File format', text: 'The CSV structure TEMPO expects, with downloadable examples.' },
    { target: section(/^Time Series$/, 'h1'), title: 'Your files', text: 'Uploaded files with their columns. Select one to chart it, download it or delete it.' },
  ],
  Scenarios: [
    { title: 'Scenario Studio', text: 'Build variants of your model as cards, place them in years, chain the years into a timeline and run them together.', visual: ['scn-add', 'scn-nest', 'scn-link', 'scn-run'] },
    { target: button(/Add card$/), title: 'Add a config card', text: 'Pick a category such as demand, emissions or renewables. A card on the canvas applies to all years.', visual: ['scn-add'] },
    { target: '.react-flow__node-year', title: 'Year boxes', text: 'Each year is one run. Drop cards into a year to change only that year, or use “+ Card” on the year.', visual: ['scn-nest'] },
    { target: '.react-flow__node-year .react-flow__handle-right', title: 'Chain years', text: 'Drag from this dot to the next year’s left dot to link them into a timeline.', visual: ['scn-link'] },
    { target: button(/^Templates/), title: 'Templates', text: 'Start from a ready-made pathway such as demand growth, a carbon cap or a renewable transition.' },
    { target: () => find(`${MAIN} p, ${MAIN} div`, /^No card selected$/)?.closest('aside') || find(`${MAIN} p, ${MAIN} div`, /^No card selected$/)?.parentElement, title: 'Card settings', text: 'Select a card to configure it here. Below are key figures of the model the scenarios are based on.' },
    { target: group(/^Sequential$/), title: 'Parallel or sequential', text: 'Run all years at once, or one after another in year order.', visual: ['scn-run'] },
    { target: button(/Run scenario$/), title: 'Run', text: 'Start every run. Results appear in the panel below; open Compare to put them side by side.' },
  ],
  'Tech Database': [
    { title: 'Technology library', text: 'Technology parameters from the OpenTech catalogue: costs, efficiencies, lifetimes and more.' },
    { target: group(/^All technologies\d*$/), title: 'Categories', text: 'Filter by renewables, dispatchable generation, storage, distribution or demand.' },
    { target: button(/^My Technologies\d*$/), title: 'My technologies', text: 'Technologies already in your model. Edit them or add new ones from the catalogue.' },
    { target: button(/^Filters$/), title: 'Filters', text: 'Narrow the list by carrier or type.' },
  ],
  Export: [
    { title: 'Export', text: 'Download a model or run results as files for another tool.' },
    { target: group(/^Results$/), title: 'What to export', text: 'Export the model definition or the results of a run.' },
    { target: section(/^Export format$/), title: 'Format', text: 'Pick the target engine; the files are written in its native layout.' },
    { target: button(/^Export as /), title: 'Download', text: 'Creates a ZIP with everything the engine needs.' },
  ],
  Run: [
    { title: 'Run a model', text: 'Set up and start an optimisation of the active model.' },
    { target: section(/^Model & mode$/), title: 'Model and mode', text: 'The model to run and the mode, e.g. Plan (optimise capacities) or Operate (dispatch only).' },
    { target: section(/^Framework$/), title: 'Engine', text: 'Choose Calliope, PyPSA, OSeMOSYS or AdOpT-NET0.' },
    { target: section(/^Time horizon$/), title: 'Time horizon', text: 'Pick a preset or a start and end date. Shorter periods solve faster.' },
    { target: section(/^Solver options$/), title: 'Solver', text: 'The solver (e.g. HiGHS) and its settings.' },
    { target: button(/^Run Model$/), title: 'Start the run', text: 'Progress and logs appear below; finished runs open in Results.' },
    { target: section(/^Completed Runs/), title: 'Completed runs', text: 'Open results, read logs, download JSON or delete old runs.' },
  ],
  Results: [
    { title: 'Results dashboard', text: 'Explore the outcome of an optimisation run.' },
    { target: group(/^Delete run$/), title: 'Choose a run', text: 'Pick a completed run. The badge shows the engine; Delete run removes the run (not the model).' },
    { target: group(/^Compare Scenarios$/), title: 'Single run or comparison', text: 'Switch to Compare Scenarios to put several runs side by side.' },
    { target: group(/^Energy Flow$/), title: 'Result tabs', text: 'Overview, energy flow (Sankey), hourly dispatch, costs, deeper analysis, the AI model advisor and the solver log.' },
    { target: button(/^Filters$/), title: 'Technology filter', text: 'Hide or show technologies in every chart.' },
    { target: group(/^Tech Mix$/), title: 'Map views', text: 'Show capacity, technology mix, regions, generation heatmap or transmission flows on the map.' },
    { target: section(/^Installed Capacity by Technology$/), title: 'Charts', text: 'Capacity, generation mix and capacity per location. Hover for exact values.' },
    { target: button(/^Download/), title: 'Download', text: 'Export the results as CSV, JSON or images.' },
  ],
  Settings: [
    { title: 'Settings', text: 'Preferences, engines and integrations.' },
    { target: section(/^General/, 'button,h2,h3'), title: 'General', text: 'Default start page and saving behaviour.' },
    { target: section(/Model Advisor/), title: 'Model Advisor', text: 'Connect an AI provider with your own key for the Results advisor.' },
    { target: section(/^Privacy & Data$/), title: 'Privacy and data', text: 'Everything is stored on this device. Clear all data here if needed.' },
  ],
};

export const TOURS = { app: APP_STEPS, ...VIEW_TOURS };

// Sidebar view name → tour id (views without their own tour use the app tour)
export const tourForView = (view) => (VIEW_TOURS[view] ? view : 'app');

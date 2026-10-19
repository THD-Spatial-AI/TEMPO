import { tr, toEnglish } from '../../i18n';
// Guided tours: one app-wide tour plus one per sidebar view, each with its own
// "seen" flag, and a tiny event bus to (re)start a tour.
const doneKey = (id) => (id === 'app' ? 'tempo:tourCompleted' : `tempo:tourCompleted:${id.toLowerCase().replace(/\s+/g, '-')}`);
let listener = null;
let pendingTour = null;

export function hasSeenTour(id = 'app') {
  try { return localStorage.getItem(doneKey(id)) === '1'; } catch { return true; }
}

export function markTourSeen(id = 'app') {
  try { localStorage.setItem(doneKey(id), '1'); } catch { /* storage blocked */ }
}

export function startTour(id = 'app') {
  if (listener) listener(id);
  else pendingTour = id;
}

export function onTourStart(fn) {
  listener = fn;
  if (pendingTour !== null) {
    const id = pendingTour;
    pendingTour = null;
    fn(id);
  }
  return () => { if (listener === fn) listener = null; };
}

// ── Target helpers (resolve lazily, when the step is shown) ──────────────────
const clean = (el) => el.textContent.trim().replace(/^[a-z_0-9]+\s*(?=[A-ZÄÖÜ0-9⚡+])/, '').trim();
const find = (sel, re) => [...document.querySelectorAll(sel)].find((el) => el.offsetParent !== null && (re.test(clean(el)) || re.test(toEnglish(clean(el)))));
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
const nav = (label) => `nav [data-nav="${label}"]`;

const APP_STEPS = [
  { title: tr("Welcome to TEMPO"), text: tr("TEMPO helps you build an energy system model, optimise it with an open-source engine and explore the results. This short tour shows where everything lives.") },
  { target: nav('Dashboard'), title: tr("Dashboard"), text: tr("An overview of the active model: locations, links, capacities, costs and time series at a glance.") },
  { target: nav('Tutorial'), title: tr("Tutorial"), text: tr("Step-by-step guides on modelling concepts and how to use each part of the app.") },
  { target: nav('Creation'), title: tr("Creation"), text: tr("Draw your system on the map: drop locations, connect them with links, assign technologies and save it as a model."), visual: ['model'] },
  { target: nav('Structure'), title: tr("Model structure"), text: tr("Review and edit a saved model: models, map view, locations, links, time series and scenarios.") },
  { target: nav('Tech Database'), title: tr("Tech Database"), text: tr("Browse technology parameters (costs, efficiencies, lifetimes) from the OpenTech catalogue and add them to your model.") },
  { target: nav('Export'), title: tr("Export"), text: tr("Export a model as engine-ready files (e.g. Calliope YAML) to share or run elsewhere.") },
  { target: nav('Run'), title: tr("Run"), text: tr("Choose an engine (Calliope, PyPSA, OSeMOSYS, AdOpT-NET0), a time range and a solver, then start the optimisation.") },
  { target: nav('Results'), title: tr("Results"), text: tr("Explore a finished run: maps, energy flows, dispatch, costs and the AI model advisor.") },
  { target: nav('Settings'), title: tr("Settings"), text: tr("Default view, AI provider and other preferences.") },
  { target: '[data-tour="version"]', title: tr("What's new"), text: tr("Release notes for the current version, loaded from GitHub.") },
  { target: '[data-tour="restart-tour"]', title: tr("Replay any time"), text: tr("Each page has its own short tour the first time you open it. Use this button to replay the tour of the page you are on.") },
];

const VIEW_TOURS = {
  Dashboard: [
    { title: tr("Model dashboard"), text: tr("A summary of the input data of the active model, before you run it.") },
    { target: () => document.querySelector('nav button[aria-haspopup="listbox"]') || document.querySelector('[data-tour="model-selector"]'), title: tr("Active model"), text: tr("Switch between your models here. Every page works on the active model; manage models from the Models page.") },
    { target: group(/^Overview$/), title: tr("Dashboard tabs"), text: tr("Generation, demand, network, cost and time series views of the same model.") },
    { target: () => find(`${MAIN} p`, /^Locations$/)?.closest('.grid'), title: tr("Key figures"), text: tr("Counts of locations, links and technologies, plus capacity and cost estimates.") },
    { target: section(/^Location Map$/), title: tr("Location map"), text: tr("Every location coloured by its main technology and sized by capacity. Click a marker for details.") },
    { target: section(/^Technology Categories$/), title: tr("Technology categories"), text: tr("How the model’s technologies split into supply, storage, conversion and demand. Click a category to list its technologies.") },
  ],
  Creation: [
    { title: tr("Build a model on the map"), text: tr("Creation is where you draw your energy system: locations, links between them, technologies, then save. This tour walks through the tools."), visual: ['model'] },
    { target: '[data-tour="creation-modes"]', title: tr("Drawing modes"), text: tr("Location drops a node, Link connects two nodes, Polyline draws a chain of linked points. Click a mode again to leave it."), visual: ['location', 'link', 'polyline'] },
    { target: '[data-tour="mode-guide"]', title: tr("What each mode means"), text: tr("Open this any time for a short explanation of locations, links and polylines.") },
    { target: '[data-tour="creation-map"]', title: tr("The map"), text: tr("With a mode active, click here to place locations or connect them. Click an existing location to edit its name and technologies.") },
    { target: '[data-tour="tech-library"]', title: tr("Tech Library"), text: tr("Technologies from the OpenTech catalogue. Add them to locations to define generation, storage and demand.") },
    { target: '[data-tour="map-layers"]', title: tr("Basemap"), text: tr("Switch between street, satellite and topographic maps.") },
    { target: '[data-tour="entity-locations"]', title: tr("Locations list"), text: tr("Every location you place appears here. Select one to zoom to it, edit it, or clear the list.") },
    { target: '[data-tour="link-type"]', title: tr("Link type"), text: tr("Choose what new links represent, e.g. an HVAC overhead line, HVDC cable or gas pipeline. It sets the transmission technology.") },
    { target: '[data-tour="entity-links"]', title: tr("Links list"), text: tr("All connections between locations, with their type and length.") },
    { target: '[data-tour="osm-panel"]', title: tr("OSM infrastructure"), text: tr("Open this panel to search a country or region and load the real transmission grid, power plants and substations as a reference while you draw.") },
    { target: '[data-tour="save-model"]', title: tr("Save the model"), text: tr("When your system is ready, save it as a model. The Save button appears in the bottom-right corner once you have placed a location.") },
  ],
  Models: [
    { title: tr("Your models"), text: tr("Create, import, load and manage energy system models.") },
    { target: section(/^Import a model$/), title: tr("Import a model"), text: tr("Import existing model files: Calliope today, more formats soon. To build a new model from scratch, use Creation.") },
    { target: section(/^Your Models/), title: tr("Saved models"), text: tr("Models stored on this device. Load one to make it active, edit its details, or delete it. Tick several for bulk actions.") },
    { target: section(/^Template Models/), title: tr("Templates"), text: tr("Ready-made example systems (Germany, Europe, Chile) to explore or use as a starting point.") },
  ],
  'Map View': [
    { title: tr("Map view"), text: tr("The saved model on a map. Edit locations and links directly here.") },
    { target: group(/^Polyline$/), title: tr("Editing modes"), text: tr("Add locations, connect them or draw polylines, as in Creation.") },
    { target: () => find(`${MAIN} button`, /^Locations\d*$/)?.closest('section') || find(`${MAIN} button`, /^Locations\d*$/)?.parentElement, title: tr("Locations and links"), text: tr("Lists of everything in the model. Use the pencil to edit and the bin to delete.") },
  ],
  Locations: [
    { title: tr("Locations"), text: tr("All nodes of the model in one table, with their technologies and coordinates.") },
    { target: button(/Add location$/), title: tr("Add a location"), text: tr("Create a location by name and coordinates without using the map.") },
    { target: () => { const el = find(`${MAIN} button`, /^Name/); return el?.closest('table') || el?.closest('.bg-white'); }, title: tr("Location table"), text: tr("Sort by any column. Expand a row to see and edit the technologies at that location.") },
  ],
  Links: [
    { title: tr("Links"), text: tr("All transmission connections of the model: routes, carriers, capacities and distances.") },
    { target: button(/Add link$/), title: tr("Add a link"), text: tr("Connect two existing locations and choose the link technology.") },
    { target: group(/^All\d+$/), title: tr("Filter by carrier"), text: tr("Show only electricity, gas, hydrogen or heat links.") },
    { target: () => find(`${MAIN} button`, /^Route/)?.closest('table'), title: tr("Link table"), text: tr("Sort by route, type, capacity or distance, and edit or delete individual links.") },
  ],
  TimeSeries: [
    { title: tr("Time series"), text: tr("Hourly profiles such as demand and solar or wind availability used by the model.") },
    { target: button(/File format$/), title: tr("File format"), text: tr("The CSV structure TEMPO expects, with downloadable examples.") },
    { target: section(/^Time Series$/, 'h1'), title: tr("Your files"), text: tr("Uploaded files with their columns. Select one to chart it, download it or delete it.") },
  ],
  Scenarios: [
    { title: tr("Scenario Studio"), text: tr("Build variants of your model as cards, place them in years, chain the years into a timeline and run them together."), visual: ['scn-add', 'scn-nest', 'scn-link', 'scn-run'] },
    { target: button(/Add card$/), title: tr("Add a config card"), text: tr("Pick a category such as demand, emissions or renewables. A card on the canvas applies to all years."), visual: ['scn-add'] },
    { target: '.react-flow__node-year', title: tr("Year boxes"), text: tr("Each year is one run. Drop cards into a year to change only that year, or use “+ Card” on the year."), visual: ['scn-nest'] },
    { target: '.react-flow__node-year .react-flow__handle-right', title: tr("Chain years"), text: tr("Drag from this dot to the next year’s left dot to link them into a timeline."), visual: ['scn-link'] },
    { target: button(/^Templates/), title: tr("Templates"), text: tr("Start from a ready-made pathway such as demand growth, a carbon cap or a renewable transition.") },
    { target: () => find(`${MAIN} p, ${MAIN} div`, /^No card selected$/)?.closest('aside') || find(`${MAIN} p, ${MAIN} div`, /^No card selected$/)?.parentElement, title: tr("Card settings"), text: tr("Select a card to configure it here. Below are key figures of the model the scenarios are based on.") },
    { target: group(/^Sequential$/), title: tr("Parallel or sequential"), text: tr("Run all years at once, or one after another in year order."), visual: ['scn-run'] },
    { target: button(/Run scenario$/), title: tr("Run"), text: tr("Start every run. Results appear in the panel below; open Compare to put them side by side.") },
  ],
  'Tech Database': [
    { title: tr("Technology library"), text: tr("Technology parameters from the OpenTech catalogue: costs, efficiencies, lifetimes and more.") },
    { target: group(/^All technologies\d*$/), title: tr("Categories"), text: tr("Filter by renewables, dispatchable generation, storage, distribution or demand.") },
    { target: button(/^My Technologies\d*$/), title: tr("My technologies"), text: tr("Technologies already in your model. Edit them or add new ones from the catalogue.") },
    { target: button(/^Filters$/), title: tr("Filters"), text: tr("Narrow the list by carrier or type.") },
  ],
  Export: [
    { title: tr("Export"), text: tr("Download a model or run results as files for another tool.") },
    { target: group(/^Results$/), title: tr("What to export"), text: tr("Export the model definition or the results of a run.") },
    { target: section(/^Export format$/), title: tr("Format"), text: tr("Pick the target engine; the files are written in its native layout.") },
    { target: button(/^Export as /), title: tr("Download"), text: tr("Creates a ZIP with everything the engine needs.") },
  ],
  Run: [
    { title: tr("Run a model"), text: tr("Set up and start an optimisation of the active model.") },
    { target: section(/^Model & mode$/), title: tr("Model and mode"), text: tr("The model to run and the mode, e.g. Plan (optimise capacities) or Operate (dispatch only).") },
    { target: section(/^Framework$/), title: tr("Engine"), text: tr("Choose Calliope, PyPSA, OSeMOSYS or AdOpT-NET0.") },
    { target: section(/^Time horizon$/), title: tr("Time horizon"), text: tr("Pick a preset or a start and end date. Shorter periods solve faster.") },
    { target: section(/^Solver options$/), title: tr("Solver"), text: tr("The solver (e.g. HiGHS) and its settings.") },
    { target: button(/^Run Model$/), title: tr("Start the run"), text: tr("Progress and logs appear below; finished runs open in Results.") },
    { target: section(/^Completed Runs/), title: tr("Completed runs"), text: tr("Open results, read logs, download JSON or delete old runs.") },
  ],
  Results: [
    { title: tr("Results dashboard"), text: tr("Explore the outcome of an optimisation run.") },
    { target: group(/^Delete run$/), title: tr("Choose a run"), text: tr("Pick a completed run. The badge shows the engine; Delete run removes the run (not the model).") },
    { target: group(/^Compare Scenarios$/), title: tr("Single run or comparison"), text: tr("Switch to Compare Scenarios to put several runs side by side.") },
    { target: group(/^Energy Flow$/), title: tr("Result tabs"), text: tr("Overview, energy flow (Sankey), hourly dispatch, costs, deeper analysis, the AI model advisor and the solver log.") },
    { target: button(/^Filters$/), title: tr("Technology filter"), text: tr("Hide or show technologies in every chart.") },
    { target: group(/^Tech Mix$/), title: tr("Map views"), text: tr("Show capacity, technology mix, regions, generation heatmap or transmission flows on the map.") },
    { target: section(/^Installed Capacity by Technology$/), title: tr("Charts"), text: tr("Capacity, generation mix and capacity per location. Hover for exact values.") },
    { target: button(/^Download/), title: tr("Download"), text: tr("Export the results as CSV, JSON or images.") },
  ],
  Settings: [
    { title: tr("Settings"), text: tr("Preferences, engines and integrations.") },
    { target: section(/^General/, 'button,h2,h3'), title: tr("General"), text: tr("Default start page and saving behaviour.") },
    { target: section(/Model Advisor/), title: tr("Model Advisor"), text: tr("Connect an AI provider with your own key for the Results advisor.") },
    { target: section(/^Privacy & Data$/), title: tr("Privacy and data"), text: tr("Everything is stored on this device. Clear all data here if needed.") },
  ],
};

export const TOURS = { app: APP_STEPS, ...VIEW_TOURS };

// Sidebar view name → tour id (views without their own tour use the app tour)
export const tourForView = (view) => (VIEW_TOURS[view] ? view : 'app');

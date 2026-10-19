// English strings (source language)
export default {
  // Navigation
  'nav.Dashboard': 'Dashboard',
  'nav.Tutorial': 'Tutorial',
  'nav.Creation': 'Creation',
  'nav.Structure': 'Structure',
  'nav.Models': 'Models',
  'nav.Map View': 'Map View',
  'nav.Locations': 'Locations',
  'nav.Links': 'Links',
  'nav.TimeSeries': 'Time Series',
  'nav.Scenarios': 'Scenarios',
  'nav.Tech Database': 'Tech Database',
  'nav.Export': 'Export',
  'nav.Run': 'Run',
  'nav.Results': 'Results',
  'nav.Settings': 'Settings',

  // Sidebar
  'sidebar.activeModel': 'Active model',
  'sidebar.activeModelTip': 'Active model: {name}',
  'sidebar.noModel': 'No model loaded',
  'sidebar.selectModel': 'Select a model',
  'sidebar.switchModel': 'Switch model',
  'sidebar.noModels': 'No models yet',
  'sidebar.manageModels': 'Manage models…',
  'sidebar.counts': '{locations} locations · {links} links',
  'sidebar.restartTour': 'Restart tour',
  'sidebar.restartScopedTour': 'Restart {scope} tour',
  'sidebar.whatsNew': "What's new",
  'sidebar.hide': 'Hide',
  'sidebar.expand': 'Expand sidebar',
  'sidebar.collapse': 'Collapse sidebar',

  // Title bar
  'titlebar.caption': 'Energy System Modeling',
  'menu.File': 'File', 'menu.Edit': 'Edit', 'menu.View': 'View', 'menu.Window': 'Window', 'menu.Help': 'Help',
  'menu.newModel': 'New model', 'menu.models': 'Models', 'menu.settings': 'Settings', 'menu.quit': 'Exit',
  'menu.undo': 'Undo', 'menu.redo': 'Redo', 'menu.cut': 'Cut', 'menu.copy': 'Copy', 'menu.paste': 'Paste', 'menu.selectAll': 'Select all',
  'menu.reload': 'Reload', 'menu.devtools': 'Developer tools', 'menu.zoomReset': 'Actual size', 'menu.zoomIn': 'Zoom in', 'menu.zoomOut': 'Zoom out', 'menu.fullscreen': 'Full screen',
  'menu.minimize': 'Minimize', 'menu.maximize': 'Maximize / restore', 'menu.close': 'Close',
  'menu.tour': 'Guided tour of this page', 'menu.tutorial': 'Tutorial', 'menu.whatsNew': "What's new", 'menu.checkUpdates': 'Check for updates…', 'menu.releaseNotes': 'Release notes on GitHub',
  'window.minimize': 'Minimize', 'window.maximize': 'Maximize', 'window.restore': 'Restore', 'window.close': 'Close',

  // Settings › General
  'settings.title': 'Settings',
  'settings.subtitle': 'Application configuration and preferences',
  'settings.section.general': 'General', 'settings.section.generalHint': 'Startup, language and saving',
  'settings.language': 'Language',
  'settings.languageDesc': 'Language of the TEMPO interface. Pages are being translated step by step; untranslated text stays in English.',
  'settings.defaultView': 'Default view',
  'settings.defaultViewDesc': 'The page TEMPO opens on. Takes effect the next time TEMPO starts.',
  'settings.opensOn': 'Opens on {view} next time',
  'settings.restartNotice': 'TEMPO will open on {view} next time. Restart now to apply.',
  'settings.restartNow': 'Restart now',
  'settings.autoSave': 'Auto-save',
  'settings.autoSaveDesc': 'Save model changes 1.5 s after you stop editing. When off, save with Ctrl+S — TEMPO still asks before you leave unsaved changes.',
  'settings.autoUpdate': 'Check for updates automatically',
  'settings.autoUpdateDesc': 'Ask GitHub for a newer TEMPO release at startup and every 6 hours. You can always check manually in About.',

  // Page headers
  'page.dashboard.title': 'Model Dashboard',
  'page.dashboard.subtitle': 'Input data of the active model',
  'page.models.title': 'Models',
  'page.models.subtitle': 'Import, manage and switch between your energy system models.',
  'page.locations.title': 'Locations',
  'page.locations.subtitle': 'Nodes of the energy system and the technologies at each one.',
  'page.links.title': 'Links',
  'page.links.subtitle': 'Connections between locations, each carrying an energy carrier such as electricity, heat, hydrogen or gas.',
  'page.timeseries.title': 'Time Series',
  'page.timeseries.subtitle': 'Demand profiles and resource availability used by your model',
  'page.export.title': 'Export',
  'page.run.title': 'Run Model',
  'page.results.title': 'Results Dashboard',
  'page.results.subtitle': 'Optimisation results · interactive analysis',

  // Dashboard tabs
  'dash.tab.overview': 'Overview', 'dash.tab.generation': 'Generation', 'dash.tab.demand': 'Demand',
  'dash.tab.network': 'Network', 'dash.tab.cost': 'Cost', 'dash.tab.timeseries': 'Time Series',

  // Save status
  'save.save': 'Save', 'save.saving': 'Saving…', 'save.saved': 'Saved', 'save.savedAt': 'Saved {time}',
  'save.allSaved': 'All changes saved', 'save.unsaved': 'Unsaved changes', 'save.tooltip': 'Save model now (Ctrl+S)',
  'save.savedNotice': '{label} saved successfully.',

  // Confirm dialog
  'confirm.title': 'Are you sure?', 'confirm.delete': 'Delete', 'confirm.cancel': 'Cancel', 'confirm.close': 'Close',

  // Notifications
  'notify.success': 'Success', 'notify.error': 'Error', 'notify.warning': 'Warning', 'notify.info': 'Info', 'notify.dismiss': 'Dismiss notification',
};

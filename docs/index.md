# Calliope Visualizator

**Calliope Visualizator** is a desktop application developed at the [Deggendorf Institute of Technology](https://www.th-deg.de) that makes it easy to build, run, and visualize [Calliope](https://callio.pe/) energy system optimization models — without writing YAML by hand.

---

## What it does

Calliope Visualizator takes you through the entire modelling workflow in one place:

1. **Define your energy system** — add locations, transmission links, and technologies using form-based screens.
2. **Visualize it on a map** — see your model topology overlaid on real geographic data, including OpenStreetMap power infrastructure (substations, power plants, transmission lines).
3. **Run the optimizer** — submit the model to the Calliope solver and watch the log stream live.
4. **Inspect results** — explore the optimization output in the built-in results view.
5. **Export** — download a fully Calliope-compliant YAML package ready for independent use on the command line.

---

## Key features

| Feature | Description |
|---|---|
| Interactive map | MapLibre GL + Deck.gl rendering of model topology and real OSM infrastructure |
| Technology library | Pre-built YAML templates for solar, wind, storage, hydrogen, conventional, and transmission technologies |
| Bulk import | Import locations and links from CSV in one step |
| Live solver log | Real-time log output from the Calliope Python process |
| Multi-model management | Create, switch between, and compare multiple models and scenarios |
| YAML / ZIP export | Export clean, Calliope-ready files at any time |
| GeoServer integration | Optional vector tile layers from a local GeoServer instance |

---

## Architecture overview

```
┌─────────────────────┐    HTTP (localhost:8082)    ┌──────────────────┐
│  React 19 frontend  │ ─────────────────────────▶  │   Go REST API    │
│  (Vite + MapLibre)  │                             │   + SQLite DB    │
└─────────────────────┘                             └──────────────────┘
          │                                                  │
     Electron shell                                  spawns Python
     (desktop app)                                   calliope_runner.py
```

- **Frontend**: React 19 · Vite · Tailwind CSS · MapLibre GL · Deck.gl · MUI
- **Backend**: Go · Gin · SQLite
- **Desktop**: Electron + NSIS installer (Windows)
- **Solver runner**: Python · Calliope 0.7

---

## Quick navigation

<div class="grid cards" markdown>

- :material-download: **[Installation](getting-started/installation.md)**  
  Install on Windows using the desktop installer or run in dev mode.

- :material-rocket-launch: **[Quick Start](getting-started/quick-start.md)**  
  Build and run your first energy model in minutes.

- :material-map: **[Map Interface](map/map-interface.md)**  
  Explore the geographic view and OSM infrastructure layers.

- :material-code-braces: **[Development Setup](development/setup.md)**  
  Set up the full development environment.

</div>

---

!!! info "Calliope documentation"
    This documentation covers the Calliope Visualizator application. For the underlying Calliope framework, see the [official Calliope documentation](https://callio.pe/docs/).

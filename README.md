# TEMPO — Tool for Energy Model Planning and Optimization

Desktop and web application for building, running, and visualizing Calliope energy system models. Built with React + Go + Python + Electron at [TH Deggendorf](https://www.th-deg.de).

> **Just want the app?** Download the installer from the project website or directly from [GitHub Releases](https://github.com/THD-Spatial-AI/TEMPO/releases):
> - **Windows** → `TEMPO-Setup-x.x.x.exe`
> - **Linux** → `TEMPO-x.x.x.AppImage`

---

## What it does

- Build multi-node energy system models visually on a map (MapLibre GL / Deck.gl)
- Configure technologies from a built-in library (renewable, conventional, storage, H₂, CCS)
- Run Calliope optimizations and stream solver logs in real time
- Import locations/links from CSV; export full models as Calliope YAML or ZIP
- Optionally load pre-processed OSM power infrastructure via GeoServer (PostGIS)

---

## Installation (development)

**Prerequisites:** Node.js ≥ 16, Go ≥ 1.21, Python ≥ 3.9

### 1. Frontend

```bash
npm install
npm run dev          # → http://localhost:5173
```

### 2. Go backend

```bash
cd backend-go
go run .             # → http://localhost:8082
```

### 3. Calliope runner service

```bash
# Option A – local
uvicorn python.calliope_service:app --host 0.0.0.0 --port 5000

# Option B – Docker
docker compose up calliope-runner
```

### 4. Desktop (Electron)

```bash
npm run dev:electron     # starts Vite + Electron together
```

---

## Building a release

```bash
npm run dist            # Windows  → release/TEMPO-Setup-x.x.x.exe
npm run dist:linux       # Linux    → release/TEMPO-x.x.x.AppImage
npm run dist:all         # both
```

---

## GeoServer (optional)

Provides cached OSM power infrastructure layers. Without it, the app falls back to the Overpass API automatically.

```powershell
# Start containers (PostGIS + GeoServer)
.\scripts\setup_geoserver_docker.ps1

# Load a region
.\scripts\setup_geoserver_docker.ps1 -LoadRegion "Europe/Germany/Bayern"
```

GeoServer web UI: `http://localhost:8080/geoserver/web` (admin / geoserver)

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, MapLibre GL, Deck.gl |
| Backend | Go + Gin, SQLite (port 8082) |
| Runner | Python 3, FastAPI, Calliope 0.7 (port 5000) |
| Desktop | Electron + electron-builder |
| Map data | OpenStreetMap via GeoServer/PostGIS or Overpass API |

---

## Links

- Project website & download: [https://github.com/THD-Spatial-AI/TEMPO](https://github.com/THD-Spatial-AI/TEMPO)
- Documentation: `docs/` (run `mkdocs serve` to browse locally)
- Architecture: `documentation/` (arc42 LaTeX)
- Full setup guide for a new machine: [SETUP_NEW_COMPUTER.md](SETUP_NEW_COMPUTER.md)
- Contact: tempo@th-deg.de


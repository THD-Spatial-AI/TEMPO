# Development Setup

This guide covers everything needed to run the full stack in development mode.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 16 | Frontend runtime and package manager |
| Go | ≥ 1.22 | Backend compilation |
| Python | ≥ 3.9 | Calliope runner and OSM processing |
| Git | any | Version control |
| Docker Desktop | any | Optional, for GeoServer/PostGIS |

---

## Clone the repository

```bash
git clone https://github.com/THD-Spatial/TEMPO.git
cd TEMPO
```

---

## Frontend

Install Node dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

The frontend is served at `http://localhost:5173` with hot module replacement enabled.

---

## Backend

Build and run the Go backend:

```bash
cd backend-go
go build -o backend.exe .
./backend.exe --port 8082 --db ./dev.db
```

The backend starts on port 8082. The SQLite database is created at the path specified by `--db`. Leave this terminal running while developing.

To run in watch mode (auto-rebuild on code changes), install `air`:

```bash
go install github.com/air-verse/air@latest
air
```

---

## Running frontend + Electron together

```bash
npm run dev:electron
```

This uses `concurrently` to start the Vite server and wait for it to be ready, then launches Electron pointing at `http://localhost:5173`.

---

## Python environment

Set up a conda environment for the Calliope runner:

```bash
conda create -n calliope python=3.10
conda activate calliope
pip install calliope
```

The development frontend picks up the conda environment you configure in the Settings screen.

---

## Calliope runner service

The Go backend calls the Calliope optimization engine through an HTTP service (`python/calliope_service.py`) rather than spawning a subprocess directly. The service must be running before you can submit solver jobs.

### Option A — run locally

```bash
cd python
pip install -r requirements.service.txt
uvicorn calliope_service:app --host 0.0.0.0 --port 5000 --reload
```

The service starts at `http://localhost:5000`. Verify it is up:

```bash
curl http://localhost:5000/health
# { "status": "ok" }
```

### Option B — run with Docker

```bash
docker compose up calliope-runner
```

The `docker-compose.yml` at the project root builds the container and maps it to host port 5000. The Go backend's `config.yaml` points to `http://localhost:5000`.

!!! tip "Hot reload"
    The Docker volume mounts `python/` as read-only into the container. Restart the container after editing the runner scripts.

---

## Linting

```bash
npm run lint
```

ESLint is configured via `eslint.config.js`. The project uses `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh`.

---

## Environment variables

There are no required `.env` variables for the basic development setup. The backend URL is hardcoded to `localhost:8082` in the frontend services layer. To override it, create `src/config/env.js` with:

```js
export const BACKEND_URL = 'http://localhost:8082';
```

---

## Port conflicts

If port 8082 is in use, start the backend on a different port:

```bash
./backend.exe --port 8083 --db ./dev.db
```

Then update the backend URL in `src/config/` accordingly.

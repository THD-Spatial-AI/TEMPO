# Installation

TEMPO runs as a desktop application on Windows. The frontend can also be served as a web application in development mode.

---

## Prerequisites

### Required for the application

- **Windows 10 or 11 (x64)** — the desktop installer targets this platform.
- **Python 3.9 or newer** — required to run the Calliope optimizer. Anaconda or Miniconda is recommended.
- **Calliope** — the energy system modelling framework. The application auto-detects your conda environment.

### Required for development

- **Node.js ≥ 16**
- **Go ≥ 1.22**
- **Git**

---

## Desktop Installation (Windows)

### 1. Install Calliope

If you do not already have Calliope installed, create a dedicated conda environment:

```bash
conda create -n calliope python=3.10
conda activate calliope
pip install calliope
```

!!! tip "Solver"
    Calliope uses [GLPK](https://www.gnu.org/software/glpk/) by default, which is bundled with its Python package. For larger models, consider installing [Gurobi](https://www.gurobi.com/) or [CPLEX](https://www.ibm.com/products/ilog-cplex-optimization-studio) and configuring Calliope to use them.

### 2. Download and run the installer

1. Go to the [Releases page](https://github.com/THD-Spatial/TEMPO/releases) on GitHub.
2. Download the latest `Calliope-Visualizator-Setup-x.x.x.exe`.
3. Run the installer. You can choose the installation directory and whether to create desktop and start menu shortcuts.
4. Launch **TEMPO**.

### 3. First launch — environment setup

On first launch the Setup Screen appears. The application searches for a conda executable automatically in common installation paths. If it finds one it lists the available environments.

- Select the environment that has Calliope installed (e.g. `calliope`).
- Click **Confirm**. The application stores this choice and will use it for all future solver runs.

If conda is not detected automatically, click **Set manually** and browse to your `conda.exe` (typically at `%UserProfile%\Anaconda3\Scripts\conda.exe` or `%UserProfile%\miniconda3\Scripts\conda.exe`).

---

## Development Mode

### Clone and install dependencies

```bash
git clone https://github.com/THD-Spatial/TEMPO.git
cd TEMPO
npm install
```

### Start the Go backend

```bash
cd backend-go
go run .
```

The backend starts on port 8082. Leave this terminal running. If port 8082 is already in use, find and kill the old process:

```powershell
netstat -ano | findstr ":8082"
taskkill /PID <pid> /F
```

### Start the frontend

```bash
npm run dev
```

The application opens at `http://localhost:5173`.

### Run with Electron (dev mode)

To run both Vite and Electron together:

```bash
npm run dev:electron
```

---

## OSM Processing environment (`.venv-calliope`)

The **Download GIS Data** feature and the OSM processing CLI scripts run inside a dedicated Python virtual environment at `.venv-calliope/` in the project root. The Go backend always uses this venv automatically.

Set it up once:

```powershell
# Create the venv
python -m venv .venv-calliope

# Activate it
.\.venv-calliope\Scripts\Activate.ps1

# Install Calliope + OSM processing dependencies
pip install calliope
pip install -r osm_processing/requirements.txt
```

You can also use the provided setup script:

```powershell
python setup_calliope_venv.py
```

---

## GeoServer & PostGIS (for map data)

The OSM infrastructure map layers are served from a local GeoServer instance backed by PostGIS. Both run in Docker:

```powershell
# Pull and configure containers (run once)
cd scripts
.\setup_geoserver_docker.ps1

# Start containers for a session
docker start calliope-postgis calliope-geoserver
```

GeoServer web UI: `http://localhost:8080/geoserver` (admin / geoserver)  
The Go backend connects to GeoServer on port 8081 (configured in `backend-go/config.yaml`).

Once the stack is running, use the **Download GIS Data** panel in the Creation view to load any country or region — no terminal required.

---

## Verifying the installation

Open the application and check the status indicator in the Settings screen:

- **Backend**: shows the Go backend connection status (green = connected on port 8082).
- **Python**: shows the detected conda/Python executable path.
- **Calliope**: shows whether `import calliope` succeeds in the selected environment.

---

## Uninstalling

Use **Add or remove programs** in Windows settings and search for **TEMPO**. The uninstaller removes the application files. Your model database (`%AppData%\TEMPO\calliope.db`) is preserved and must be deleted manually if you want a clean removal.

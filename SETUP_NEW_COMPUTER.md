# 🚀 Setup Guide - New Computer Installation

This guide walks you through setting up the complete TEMPO development environment on a fresh Windows machine, including GeoServer for OSM data.

---

## 📋 Prerequisites Checklist

Before starting, install these tools:

### 1. **Node.js** (≥ 16)
- Download: https://nodejs.org/
- Verify: `node --version` and `npm --version`

### 2. **Go** (≥ 1.21)
- Download: https://go.dev/dl/
- Verify: `go version`

### 3. **Python** (≥ 3.9)
- Download: https://www.python.org/downloads/
- ✅ Check "Add Python to PATH" during installation
- Verify: `python --version`

### 4. **Docker Desktop** (for GeoServer)
- Download: https://www.docker.com/products/docker-desktop
- Start Docker Desktop after installation
- Verify: `docker --version` and `docker ps`

### 5. **Git** (for version control)
- Download: https://git-scm.com/downloads
- Verify: `git --version`

---

## 📥 Step 1: Clone Repository

```powershell
cd C:\Users\<YourUsername>\Desktop
git clone <repository-url> TEMPO
cd TEMPO\calliope_editiontool
```

---

## 🎨 Step 2: Install Frontend Dependencies

```powershell
npm install
```

This installs all React, Vite, and UI library dependencies.

**Expected time:** 2-5 minutes

---

## 🔧 Step 3: Build Go Backend

```powershell
cd backend-go
go build -o backend.exe .
cd ..
```

**Expected time:** 30-60 seconds

---

## 🐍 Step 4: Setup Python Environment

### Option A: Create Virtual Environment (Recommended)

```powershell
# Create virtual environment
python -m venv venv

# Activate it
.\venv\Scripts\Activate.ps1

# Install Calliope dependencies
pip install "calliope>=0.6.8"

# Install OSM processing dependencies
cd osm_processing
pip install -r requirements.txt
cd ..
```

### Option B: Global Installation

```powershell
pip install "calliope>=0.7.0"
cd osm_processing
pip install -r requirements.txt
cd ..
```

**Expected time:** 5-10 minutes

---

## 🗺️ Step 5: Setup GeoServer (Optional but Recommended)

GeoServer provides fast access to OSM power infrastructure data. Skip this if you only want to use the public Overpass API.

### 5.1 Setup Containers

```powershell
# Setup GeoServer + PostGIS containers
.\scripts\setup_geoserver_docker.ps1
```

This will:
- ✓ Pull Docker images (first time: ~2 GB download)
- ✓ Create PostGIS database container
- ✓ Create GeoServer application container
- ✓ Configure tables and workspace
- ✓ Set up authentication

**Expected time:** 5-15 minutes (first time)

### 5.2 Verify Installation

Open your browser:
- GeoServer: http://localhost:8080/geoserver/web/
- Login: `admin` / `geoserver`
- Check "Layer Preview" - you should see the `osm` workspace

### 5.3 Load OSM Data for Your Region

```powershell
# Setup data directories
cd osm_processing
python create_folder_structure.py
python create_extract_structure.py

# Load a region (downloads, extracts, and uploads in one command)
python add_region_to_geoserver.py Europe Germany Bayern

# Examples for other regions:
# python add_region_to_geoserver.py Europe Spain
# python add_region_to_geoserver.py South_America Chile
# python add_region_to_geoserver.py North_America USA California

cd ..
```

**Expected time:** 10-30 minutes per region (depending on size)

---

## ▶️ Step 6: Run the Application

You need **3 terminals** running simultaneously:

### Terminal 1: Frontend (React + Vite)

```powershell
npm run dev
```

Opens at: http://localhost:5173

### Terminal 2: Backend (Go API)

```powershell
cd backend-go
.\backend.exe --port 8082 --db calliope.db
```

Runs on: http://localhost:8082

### Terminal 3: GeoServer (Docker - if installed)

```powershell
# Containers should auto-start, but if not:
docker start calliope-postgis calliope-geoserver

# Check status:
docker ps
```

GeoServer UI: http://localhost:8080/geoserver

---

## ⚙️ Step 7: Configure TEMPO Settings

1. Open TEMPO at http://localhost:5173
2. Click on **Settings** (gear icon)
3. Configure:
   - **GeoServer URL**: `http://localhost:8080/geoserver` (if using GeoServer)
   - **Workspace**: `osm`
   - **Calliope Python Path**: Path to your Python executable
     - Virtual env: `C:\Users\<You>\Desktop\TEMPO\calliope_editiontool\venv\Scripts\python.exe`
     - Global: `python` or full path
4. Save settings

---

## ✅ Step 8: Verify Everything Works

### Test Frontend
- ✓ Open http://localhost:5173
- ✓ Map loads correctly
- ✓ Can create a new model

### Test Backend
- ✓ Navigate to http://localhost:8082/api/health
- ✓ Should return `{"status":"ok"}`

### Test GeoServer
- ✓ Open OSM Infrastructure Panel in TEMPO
- ✓ Enable "Show Substations"
- ✓ Substations appear on map (if you loaded region data)

### Test Calliope
1. Create a simple model with 1-2 locations
2. Add technologies and time series
3. Click "Run Optimization"
4. Check Results tab

---

## 🔄 Daily Workflow (After Initial Setup)

### Starting Work

```powershell
# 1. Start Docker (if using GeoServer)
docker start calliope-postgis calliope-geoserver

# 2. Start backend
cd backend-go
.\backend.exe --port 8082 --db calliope.db

# 3. Start frontend (in another terminal)
npm run dev

# 4. Activate Python venv if using one (in another terminal)
.\venv\Scripts\Activate.ps1
```

### Stopping Work

```powershell
# Stop frontend: Ctrl+C in terminal
# Stop backend: Ctrl+C in terminal
# Stop Docker containers:
docker stop calliope-geoserver calliope-postgis
```

---

## 🛠️ Troubleshooting

### Frontend won't start
```powershell
# Clear node_modules and reinstall
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

### Backend compilation errors
```powershell
cd backend-go
go clean
go mod tidy
go build -o backend.exe .
```

### GeoServer container won't start
```powershell
# View logs
docker logs calliope-geoserver

# Reset containers
.\scripts\setup_geoserver_docker.ps1 -Reset
```

### Python Calliope errors
```powershell
# Reinstall Calliope
pip uninstall calliope
pip install "calliope>=0.7.0"
```

### Port conflicts (8080, 8082, 5173 already in use)
```powershell
# Find process using port
netstat -ano | findstr :8080

# Kill process (replace PID)
taskkill /PID <PID> /F
```

---

## 📚 Additional Resources

- **Full Documentation**: See `docs/` folder and http://localhost:8000 (after `mkdocs serve`)
- **OSM Processing Guide**: [osm_processing/README.md](osm_processing/README.md)
- **GeoServer Setup**: [docs/map/geoserver.md](docs/map/geoserver.md)
- **API Reference**: [docs/reference/api-endpoints.md](docs/reference/api-endpoints.md)
- **Technology Templates**: [techs/](techs/)

---

## 🎯 Quick Commands Reference

```powershell
# Install dependencies
npm install                                    # Frontend
cd backend-go; go build -o backend.exe .       # Backend
pip install -r osm_processing/requirements.txt  # Python

# Run application
npm run dev                                    # Frontend dev server
cd backend-go; .\backend.exe                   # Backend API
docker start calliope-postgis calliope-geoserver  # GeoServer

# GeoServer setup
.\scripts\setup_geoserver_docker.ps1           # Initial setup
.\scripts\setup_geoserver_docker.ps1 -Reset    # Reset containers

# Load OSM data
python osm_processing/add_region_to_geoserver.py Europe Germany Bayern

# Docker management
docker ps                                      # Check running containers
docker logs calliope-geoserver                 # View logs
docker stop calliope-geoserver calliope-postgis  # Stop containers

# Build for production
npm run build                                  # Build frontend
npm run build:electron                         # Build desktop installer
```

---

## 💡 Tips for Development

1. **Use VS Code** with these extensions:
   - ESLint
   - Prettier
   - Go
   - Python
   - Docker

2. **Keep Docker containers running** during development to avoid startup delays

3. **Use the Python virtual environment** to avoid conflicts with other Python projects

4. **Load only regions you need** to save disk space and loading time

5. **Check logs** when things go wrong:
   - Browser Console (F12) for frontend
   - Terminal output for backend
   - `docker logs` for GeoServer

---

## 🆘 Need Help?

- Check existing issues on GitLab
- Review documentation in `docs/`
- Contact the development team

---

**Last Updated:** March 30, 2026

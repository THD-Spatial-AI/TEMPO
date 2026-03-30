# ⚡ Quick Start Commands - GeoServer Setup

## First Time Setup on New Computer

### 1. Install Prerequisites
- Docker Desktop: https://www.docker.com/products/docker-desktop
- Python ≥ 3.9: https://www.python.org/downloads/
- Node.js ≥ 16: https://nodejs.org/
- Go ≥ 1.21: https://go.dev/dl/

### 2. Clone and Install Dependencies
```powershell
git clone <repo-url> TEMPO
cd TEMPO\calliope_editiontool
npm install
```

### 3. Setup GeoServer with Docker (Fully Automated)
```powershell
# Start Docker Desktop first, then run:
.\scripts\setup_geoserver_docker.ps1
```

This creates:
- PostGIS container (localhost:5432)
- GeoServer container (localhost:8080)
- All tables, indexes, and layers configured

Containers auto-start in ~2 minutes.

### 4. Load OSM Data for Your Region
```powershell
cd osm_processing
pip install -r requirements.txt

# Setup directories
python create_folder_structure.py
python create_extract_structure.py

# Load a region (all-in-one: downloads + extracts + uploads)
python add_region_to_geoserver.py Europe Germany Bayern
```

### 5. Start Application
```powershell
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend (in new terminal)
cd backend-go
go build -o backend.exe .
.\backend.exe

# Terminal 3: Check GeoServer (optional)
docker ps
```

### 6. Configure TEMPO
1. Open http://localhost:5173
2. Go to Settings
3. Set GeoServer URL: `http://localhost:8080/geoserver`
4. Set Workspace: `osm`
5. Save

---

## Daily Usage (After Initial Setup)

### Start Everything
```powershell
# 1. Start Docker containers
docker start calliope-postgis calliope-geoserver

# 2. Start backend
cd backend-go
.\backend.exe

# 3. Start frontend (new terminal)
npm run dev
```

### Stop Everything
```powershell
# Stop frontend: Ctrl+C
# Stop backend: Ctrl+C
# Stop containers:
docker stop calliope-geoserver calliope-postgis
```

---

## Useful Commands

### Check Container Status
```powershell
docker ps                           # Running containers
docker logs calliope-geoserver      # View GeoServer logs
docker logs calliope-postgis        # View PostGIS logs
```

### Restart Containers
```powershell
docker restart calliope-postgis calliope-geoserver
```

### Reset GeoServer (Clean Install)
```powershell
.\scripts\setup_geoserver_docker.ps1 -Reset
```

### Load Additional Regions
```powershell
cd osm_processing

# Add more regions (data is additive, not replaced)
python add_region_to_geoserver.py Europe Spain
python add_region_to_geoserver.py South_America Chile
python add_region_to_geoserver.py North_America USA California
```

### Verify GeoServer
- Web UI: http://localhost:8080/geoserver/web/
- Login: `admin` / `geoserver`
- Check "Layer Preview" → should see `osm:osm_substations`, etc.

---

## Troubleshooting

### GeoServer won't start
```powershell
docker logs calliope-geoserver | Select-Object -Last 50
.\scripts\setup_geoserver_docker.ps1 -Reset
```

### PostGIS connection error
```powershell
# Test connection
docker exec calliope-postgis psql -U postgres -d gis -c "\dt"
```

### Port conflicts (8080, 8082, 5173 in use)
```powershell
# Find what's using port 8080
netstat -ano | findstr :8080

# Kill process (replace <PID>)
taskkill /PID <PID> /F
```

### Frontend build errors
```powershell
Remove-Item -Recurse node_modules, package-lock.json
npm install
```

---

## Architecture Quick Reference

```
Frontend (React)         Backend (Go)           GeoServer (Docker)
http://localhost:5173 ─▶ http://localhost:8082 ─▶ http://localhost:8080
                            │                       │
                            │                       ▼
                            │                   PostGIS (Docker)
                            │                   localhost:5432
                            ▼
                         Calliope (Python)
                         python/calliope_runner.py
```

---

## 📚 Full Documentation

See [SETUP_NEW_COMPUTER.md](SETUP_NEW_COMPUTER.md) for complete setup guide.
See [README.md](README.md) for project overview and details.
See [docs/](docs/) for detailed documentation.

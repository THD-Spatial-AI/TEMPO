# ─────────────────────────────────────────────────────────────────────────────
# TEMPO — install / build / run automation
#
# One-command local install on a fresh machine (Linux or Windows via Git Bash/WSL):
#
#   Docker path (recommended — no Python setup needed):
#     make install     # install Node/Go/Docker if missing, .env, npm deps, Go backend, all images
#     make up          # start every Docker service (optimization engines + sims + db)
#     make dev         # launch the desktop app (Electron)
#
#   Native path (no Docker — Python venvs in .venv-*/):
#     make install-native   # same as above but builds local venvs instead of images
#     make dev              # Electron discovers .venv-calliope/ etc. automatically
#
# Run `make help` for the full target list.
# Docker provides all Python services on fixed ports; the frontend, Go backend
# and Electron shell always run natively on the host.
# ─────────────────────────────────────────────────────────────────────────────

SHELL := bash
.DEFAULT_GOAL := help

# ── Prerequisite versions installed by `make bootstrap` when missing ────────
GO_VERSION := 1.26.5
NODE_MAJOR := 22

# ── OS detection (for the Go backend binary name only; Docker is identical) ──
UNAME_S := $(shell uname -s 2>/dev/null || echo Unknown)
ifneq (,$(filter MINGW% MSYS% CYGWIN%,$(UNAME_S)))
  GO_BIN := backend.exe
  VBIN   := Scripts
else
  GO_BIN := backend
  VBIN   := bin
endif

# ── Python interpreters for native venvs ────────────────────────────────────
# Override on the command line if your interpreter names differ, e.g.:
#   make venv-calliope PY311="py -3.11"    (Windows Python Launcher)
#   make venv-calliope PY311=/opt/bin/python3.11
PY311 ?= python3.11
PY310 ?= python3.10
PY312 ?= python3.12

# ── Docker Compose invocation and file sets ─────────────────────────────────
DC          := docker compose
# In-repo optimization engines share build context "." and merge cleanly.
REPO_FILES  := -f docker-compose.yml -f docker-compose.adoptnet0.yml
GEO_FILE    := -f docker-compose.geoserver.yml

# Sibling repositories (physics simulators + technology catalog). Optional:
# targets skip them with a notice if the directory is absent.
CCSSIM_DIR   := ../ccssim
HYDROSIM_DIR := ../hydrogenmatsim
OPENTECH_DIR := ../opentech-db

.PHONY: help check bootstrap _bootstrap-linux _bootstrap-mac _bootstrap-windows \
        env npm-install go-build frontend-build docker-build install \
        up up-engines up-geoserver up-sims up-opentech \
        down down-engines down-geoserver down-sims down-opentech \
        ps logs dev web backend-run test clean clean-docker \
        venv-calliope venv-calliope07 venv-pypsa venv-osemosys venv-adoptnet0 \
        venv-ccssim venv-hydrogensim venv-osm venvs install-native clean-venvs

# ─────────────────────────────────────────────────────────────────────────────
# Help
# ─────────────────────────────────────────────────────────────────────────────
help: ## Show this help
	@echo "TEMPO make targets:"
	@echo
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "Typical first run:  make install && make up && make dev"

# ─────────────────────────────────────────────────────────────────────────────
# Prerequisites & configuration
# ─────────────────────────────────────────────────────────────────────────────
check: ## Verify required tools (node, npm, go, docker) are installed
	@ok=1; \
	for t in node npm go docker; do \
	  if command -v $$t >/dev/null 2>&1; then \
	    ver=$$($$t --version 2>/dev/null | head -n1); \
	    [ -z "$$ver" ] && ver=$$($$t version 2>/dev/null | head -n1); \
	    printf "  \033[32m✓\033[0m %-8s %s\n" "$$t" "$$ver"; \
	  else \
	    printf "  \033[31m✗\033[0m %-8s NOT FOUND\n" "$$t"; ok=0; \
	  fi; \
	done; \
	if docker compose version >/dev/null 2>&1; then \
	  printf "  \033[32m✓\033[0m %-8s %s\n" "compose" "$$(docker compose version 2>/dev/null | head -n1)"; \
	else \
	  printf "  \033[31m✗\033[0m %-8s docker compose v2 NOT FOUND\n" "compose"; ok=0; \
	fi; \
	if [ $$ok -eq 0 ]; then echo; echo "Missing tools — run 'make bootstrap' (or 'make install') to install them."; exit 1; fi

bootstrap: ## Install any missing prerequisites (Node, Go, Docker) for this OS
	@case "$(UNAME_S)" in \
	  Linux)                 $(MAKE) --no-print-directory _bootstrap-linux ;; \
	  Darwin)                $(MAKE) --no-print-directory _bootstrap-mac ;; \
	  MINGW*|MSYS*|CYGWIN*)  $(MAKE) --no-print-directory _bootstrap-windows ;; \
	  *) echo "Unsupported OS '$(UNAME_S)'. Install Node $(NODE_MAJOR)+, Go $(GO_VERSION)+, and Docker manually."; exit 1 ;; \
	esac

_bootstrap-linux:
	@set -e; \
	if command -v node >/dev/null 2>&1; then echo "✓ node present ($$(node --version))"; else \
	  echo "── Installing Node.js $(NODE_MAJOR).x (NodeSource) ──"; \
	  curl -fsSL https://deb.nodesource.com/setup_$(NODE_MAJOR).x | sudo -E bash -; \
	  sudo apt-get install -y nodejs; \
	fi; \
	if command -v go >/dev/null 2>&1; then echo "✓ go present ($$(go version))"; else \
	  echo "── Installing Go $(GO_VERSION) ──"; \
	  m=$$(uname -m); case "$$m" in x86_64) a=amd64 ;; aarch64|arm64) a=arm64 ;; *) a=amd64 ;; esac; \
	  curl -fsSL https://go.dev/dl/go$(GO_VERSION).linux-$$a.tar.gz -o /tmp/go.tar.gz; \
	  sudo rm -rf /usr/local/go; sudo tar -C /usr/local -xzf /tmp/go.tar.gz; \
	  grep -q '/usr/local/go/bin' $$HOME/.bashrc 2>/dev/null || echo 'export PATH=$$PATH:/usr/local/go/bin' >> $$HOME/.bashrc; \
	  echo "  Added /usr/local/go/bin to ~/.bashrc (open a new shell to pick it up)"; \
	fi; \
	if command -v docker >/dev/null 2>&1; then echo "✓ docker present ($$(docker --version))"; else \
	  echo "── Installing Docker Engine (get.docker.com) ──"; \
	  curl -fsSL https://get.docker.com | sudo sh; \
	  sudo usermod -aG docker $$USER || true; \
	  echo "  ⚠ Log out and back in (or run 'newgrp docker') so Docker works without sudo."; \
	fi

_bootstrap-mac:
	@command -v brew >/dev/null 2>&1 || { echo "Install Homebrew first: https://brew.sh"; exit 1; }
	@command -v node   >/dev/null 2>&1 && echo "✓ node present"   || brew install node@$(NODE_MAJOR)
	@command -v go     >/dev/null 2>&1 && echo "✓ go present"     || brew install go
	@command -v docker >/dev/null 2>&1 && echo "✓ docker present" || brew install --cask docker

_bootstrap-windows:
	@command -v winget >/dev/null 2>&1 || { echo "winget not found — install 'App Installer' from the Microsoft Store, then retry."; exit 1; }
	@command -v node   >/dev/null 2>&1 && echo "✓ node present"   || winget install -e --id OpenJS.NodeJS.LTS      --accept-package-agreements --accept-source-agreements
	@command -v go     >/dev/null 2>&1 && echo "✓ go present"     || winget install -e --id GoLang.Go             --accept-package-agreements --accept-source-agreements
	@command -v docker >/dev/null 2>&1 && echo "✓ docker present" || winget install -e --id Docker.DockerDesktop  --accept-package-agreements --accept-source-agreements
	@echo "⚠ Windows: restart your terminal (and reboot if Docker Desktop was just installed, then start it) before running 'make install' again."

env: ## Create .env from .env.example if missing (defaults target the Docker ports)
	@if [ ! -f .env ]; then \
	  cp .env.example .env && echo "Created .env from .env.example"; \
	else \
	  echo ".env already exists — leaving it untouched"; \
	fi
	@if [ ! -f .env.local ]; then \
	  printf '\nVITE_CALLIOPE_SERVICE_URL=http://localhost:5000\n' > .env.local && \
	  echo "Created .env.local (Calliope service → :5000)"; \
	else \
	  echo ".env.local already exists — leaving it untouched"; \
	fi

# ─────────────────────────────────────────────────────────────────────────────
# Native host build (frontend + Go backend)
# ─────────────────────────────────────────────────────────────────────────────
npm-install: ## Install frontend Node dependencies (npm ci, falls back to npm install)
	@npm ci || npm install

go-build: ## Compile the Go backend into backend-go/$(GO_BIN)
	@echo "Building Go backend → backend-go/$(GO_BIN)"
	@export PATH="$$PATH:/usr/local/go/bin:/c/Program Files/Go/bin"; \
	 GO=$$(command -v go || echo /usr/local/go/bin/go); \
	 cd backend-go && "$$GO" build -o $(GO_BIN) .

frontend-build: ## Build the production frontend bundle into dist/
	@npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Docker image builds
# ─────────────────────────────────────────────────────────────────────────────
docker-build: ## Build all Docker images (engines + geoserver + sibling sims/db)
	@echo "── Building optimization engine images ──"
	$(DC) $(REPO_FILES) build
	@echo "── Building GeoServer/PostGIS images (pulled) ──"
	$(DC) $(GEO_FILE) pull
	@$(MAKE) --no-print-directory _sibling-build DIR=$(CCSSIM_DIR)   NAME="CCS simulator"
	@$(MAKE) --no-print-directory _sibling-build DIR=$(HYDROSIM_DIR) NAME="Hydrogen simulator"
	@$(MAKE) --no-print-directory _sibling-build DIR=$(OPENTECH_DIR) NAME="OpenTech-DB"

_sibling-build:
	@if [ -d "$(DIR)" ]; then \
	  echo "── Building $(NAME) ($(DIR)) ──"; \
	  ( cd "$(DIR)" && $(DC) build ); \
	else \
	  echo "── Skipping $(NAME): $(DIR) not found ──"; \
	fi

# ─────────────────────────────────────────────────────────────────────────────
# One-command install
# ─────────────────────────────────────────────────────────────────────────────
install: bootstrap env npm-install go-build docker-build ## Full install: Node/Go/Docker, .env, deps, backend, all images
	@echo
	@echo "Install complete. Next:"
	@echo "  make up     # start the Docker services"
	@echo "  make dev    # launch the desktop app"

# ─────────────────────────────────────────────────────────────────────────────
# Service lifecycle — start
# ─────────────────────────────────────────────────────────────────────────────
up: up-engines up-geoserver up-sims up-opentech ## Start every Docker service (detached)
	@echo "All available services started. Check with 'make ps'."

up-engines: ## Start optimization engines (calliope 5000/5002, pypsa 5003, osemosys 5004, adoptnet0 5001)
	$(DC) $(REPO_FILES) up -d

up-geoserver: ## Start GeoServer (8081) + PostGIS (5432)
	$(DC) $(GEO_FILE) up -d

up-sims: ## Start CCS (8766) + Hydrogen (8765) simulators (sibling repos)
	@$(MAKE) --no-print-directory _sibling-up DIR=$(CCSSIM_DIR)   NAME="CCS simulator"
	@$(MAKE) --no-print-directory _sibling-up DIR=$(HYDROSIM_DIR) NAME="Hydrogen simulator"

up-opentech: ## Start the OpenTech-DB technology catalog (8000, sibling repo)
	@$(MAKE) --no-print-directory _sibling-up DIR=$(OPENTECH_DIR) NAME="OpenTech-DB"

_sibling-up:
	@if [ -d "$(DIR)" ]; then \
	  echo "── Starting $(NAME) ($(DIR)) ──"; \
	  ( cd "$(DIR)" && $(DC) up -d ); \
	else \
	  echo "── Skipping $(NAME): $(DIR) not found ──"; \
	fi

# ─────────────────────────────────────────────────────────────────────────────
# Service lifecycle — stop
# ─────────────────────────────────────────────────────────────────────────────
down: down-engines down-geoserver down-sims down-opentech ## Stop every Docker service

down-engines: ## Stop the optimization engines
	$(DC) $(REPO_FILES) down

down-geoserver: ## Stop GeoServer + PostGIS
	$(DC) $(GEO_FILE) down

down-sims: ## Stop the CCS + Hydrogen simulators
	@$(MAKE) --no-print-directory _sibling-down DIR=$(CCSSIM_DIR)   NAME="CCS simulator"
	@$(MAKE) --no-print-directory _sibling-down DIR=$(HYDROSIM_DIR) NAME="Hydrogen simulator"

down-opentech: ## Stop the OpenTech-DB catalog
	@$(MAKE) --no-print-directory _sibling-down DIR=$(OPENTECH_DIR) NAME="OpenTech-DB"

_sibling-down:
	@if [ -d "$(DIR)" ]; then \
	  echo "── Stopping $(NAME) ($(DIR)) ──"; \
	  ( cd "$(DIR)" && $(DC) down ); \
	fi

# ─────────────────────────────────────────────────────────────────────────────
# Observability
# ─────────────────────────────────────────────────────────────────────────────
ps: ## List running TEMPO containers
	@docker ps --filter "name=calliope" --filter "name=pypsa" --filter "name=osemosys" \
	  --filter "name=adoptnet0" --filter "name=ccssim" --filter "name=hydrogensim" \
	  --filter "name=opentech" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

logs: ## Tail logs from the optimization engines (Ctrl+C to stop)
	$(DC) $(REPO_FILES) logs -f --tail=100

# ─────────────────────────────────────────────────────────────────────────────
# Run the application
# ─────────────────────────────────────────────────────────────────────────────
dev: ## Launch the desktop app (Vite + Electron)
	@npm run dev:electron

web: ## Run the frontend in the browser only (Vite dev server, no Electron)
	@npm run dev

backend-run: ## Run the Go backend natively on :8082 (needed for browser 'web' mode)
	@cd backend-go && ./$(GO_BIN) --port 8082

test: ## Run the JS format module tests (vitest)
	@npm test

# ─────────────────────────────────────────────────────────────────────────────
# Native Python venvs  (alternative to Docker — useful for development / CI)
#
# Python version constraints:
#   Calliope 0.6.8 → Python 3.9–3.11   (incompatible with numpy ≥ 1.24 / Py ≥ 3.12)
#   Calliope 0.7   → Python 3.10+
#   PyPSA          → Python 3.10+
#   OSeMOSYS       → Python 3.10+
#   AdOpT-NET0     → Python 3.12+
#   CCS sim        → Python 3.10+
#   Hydrogen sim   → Python 3.10+
#   OSM            → Python 3.10+
#
# Each venv is created in .venv-<name>/ at the repo root.
# Override interpreter with: make venv-calliope PY311="py -3.11"
# ─────────────────────────────────────────────────────────────────────────────
CALLIOPE_VENV   := .venv-calliope
CALLIOPE07_VENV := .venv-calliope07
PYPSA_VENV      := .venv-pypsa
OSEMOSYS_VENV   := .venv-osemosys
ADOPTNET0_VENV  := .venv-adoptnet0
CCSSIM_VENV     := .venv-ccssim
HYDROSIM_VENV   := .venv-hydrogensim
OSM_VENV        := .venv-osm

venv-calliope: ## Create Calliope 0.6.8 venv in .venv-calliope/ — needs Python 3.9–3.11
	@echo "── Calliope 0.6.8 venv ($(CALLIOPE_VENV)) ──"
	$(PY311) -m venv $(CALLIOPE_VENV)
	$(CALLIOPE_VENV)/$(VBIN)/python -m pip install --upgrade pip --quiet
	$(CALLIOPE_VENV)/$(VBIN)/python -m pip install -r python/requirements.service.txt --quiet
	$(CALLIOPE_VENV)/$(VBIN)/python -m pip install -r python/requirements.calliope.txt --quiet
	$(CALLIOPE_VENV)/$(VBIN)/python -m pip install calliope==0.6.8 --no-deps --quiet
	$(CALLIOPE_VENV)/$(VBIN)/python -m pip install "highspy>=1.5,<1.8" --quiet
	@echo "  ✓ $(CALLIOPE_VENV)/ ready"

venv-calliope07: ## Create Calliope 0.7 venv in .venv-calliope07/ — needs Python 3.10+
	@echo "── Calliope 0.7 venv ($(CALLIOPE07_VENV)) ──"
	$(PY310) -m venv $(CALLIOPE07_VENV)
	$(CALLIOPE07_VENV)/$(VBIN)/python -m pip install --upgrade pip --quiet
	$(CALLIOPE07_VENV)/$(VBIN)/python -m pip install -r python/requirements.service.txt --quiet
	$(CALLIOPE07_VENV)/$(VBIN)/python -m pip install -r python/requirements.calliope07.txt --quiet
	@echo "  ✓ $(CALLIOPE07_VENV)/ ready"

venv-pypsa: ## Create PyPSA venv in .venv-pypsa/ — needs Python 3.10+
	@echo "── PyPSA venv ($(PYPSA_VENV)) ──"
	$(PY310) -m venv $(PYPSA_VENV)
	$(PYPSA_VENV)/$(VBIN)/python -m pip install --upgrade pip --quiet
	$(PYPSA_VENV)/$(VBIN)/python -m pip install -r python/requirements.service.txt --quiet
	$(PYPSA_VENV)/$(VBIN)/python -m pip install -r python/requirements.pypsa.txt --quiet
	@echo "  ✓ $(PYPSA_VENV)/ ready"

venv-osemosys: ## Create OSeMOSYS venv in .venv-osemosys/ — needs Python 3.10+; glpsol.exe must be in solvers/windows/
	@echo "── OSeMOSYS venv ($(OSEMOSYS_VENV)) ──"
	$(PY310) -m venv $(OSEMOSYS_VENV)
	$(OSEMOSYS_VENV)/$(VBIN)/python -m pip install --upgrade pip --quiet
	$(OSEMOSYS_VENV)/$(VBIN)/python -m pip install -r python/requirements.service.txt --quiet
	$(OSEMOSYS_VENV)/$(VBIN)/python -m pip install -r python/requirements.osemosys.txt --quiet
	@echo "  ✓ $(OSEMOSYS_VENV)/ ready (ensure solvers/windows/glpsol.exe is present)"

venv-adoptnet0: ## Create AdOpT-NET0 venv in .venv-adoptnet0/ — needs Python 3.12+
	@echo "── AdOpT-NET0 venv ($(ADOPTNET0_VENV)) ──"
	$(PY312) -m venv $(ADOPTNET0_VENV)
	$(ADOPTNET0_VENV)/$(VBIN)/python -m pip install --upgrade pip --quiet
	$(ADOPTNET0_VENV)/$(VBIN)/python -m pip install -r python/requirements.service.txt --quiet
	$(ADOPTNET0_VENV)/$(VBIN)/python -m pip install -r python/requirements.adoptnet0.txt --quiet
	@echo "  ✓ $(ADOPTNET0_VENV)/ ready"

venv-ccssim: ## Create CCS simulator venv in .venv-ccssim/
	@echo "── CCS simulator venv ($(CCSSIM_VENV)) ──"
	$(PY310) -m venv $(CCSSIM_VENV)
	$(CCSSIM_VENV)/$(VBIN)/python -m pip install --upgrade pip --quiet
	$(CCSSIM_VENV)/$(VBIN)/python -m pip install -r python/requirements.ccssim.txt --quiet
	@echo "  ✓ $(CCSSIM_VENV)/ ready"

venv-hydrogensim: ## Create Hydrogen simulator venv in .venv-hydrogensim/
	@echo "── Hydrogen simulator venv ($(HYDROSIM_VENV)) ──"
	$(PY310) -m venv $(HYDROSIM_VENV)
	$(HYDROSIM_VENV)/$(VBIN)/python -m pip install --upgrade pip --quiet
	$(HYDROSIM_VENV)/$(VBIN)/python -m pip install -r python/requirements.hydrogensim.txt --quiet
	@echo "  ✓ $(HYDROSIM_VENV)/ ready"

venv-osm: ## Create OSM processing venv in .venv-osm/ (numpy ≥ 1.24 — isolated from Calliope venv)
	@echo "── OSM processing venv ($(OSM_VENV)) ──"
	$(PY310) -m venv $(OSM_VENV)
	$(OSM_VENV)/$(VBIN)/python -m pip install --upgrade pip --quiet
	$(OSM_VENV)/$(VBIN)/python -m pip install -r python/requirements.osm.txt --quiet
	@echo "  ✓ $(OSM_VENV)/ ready"

venvs: venv-calliope venv-calliope07 venv-pypsa venv-osemosys venv-adoptnet0 venv-ccssim venv-hydrogensim venv-osm ## Create all native Python venvs (needs Python 3.11, 3.10, and 3.12 on PATH)

install-native: bootstrap env npm-install go-build venvs ## Full install without Docker — native Python venvs in .venv-*/ instead of containers
	@echo
	@echo "Native install complete."
	@echo "  make dev    # launch the desktop app (Electron manages service startup)"
	@echo
	@echo "Electron will pick up .venv-calliope/ (and siblings) automatically."
	@echo "To also run the Go backend standalone: make backend-run"

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────────────────────────────────
clean: ## Remove build artifacts (dist/, Go binary)
	@rm -rf dist
	@rm -f backend-go/backend backend-go/backend.exe backend-go/backend-linux
	@echo "Removed dist/ and Go backend binaries."

clean-venvs: ## Remove all native Python venvs (.venv-*/)
	@rm -rf $(CALLIOPE_VENV) $(CALLIOPE07_VENV) $(PYPSA_VENV) $(OSEMOSYS_VENV) \
	         $(ADOPTNET0_VENV) $(CCSSIM_VENV) $(HYDROSIM_VENV) $(OSM_VENV)
	@echo "Removed all .venv-*/ directories."

clean-docker: ## Stop all services and remove their volumes (destroys GeoServer/PostGIS data)
	$(DC) $(REPO_FILES) down -v
	$(DC) $(GEO_FILE) down -v
	@$(MAKE) --no-print-directory _sibling-down DIR=$(CCSSIM_DIR)   NAME="CCS simulator"
	@$(MAKE) --no-print-directory _sibling-down DIR=$(HYDROSIM_DIR) NAME="Hydrogen simulator"
	@$(MAKE) --no-print-directory _sibling-down DIR=$(OPENTECH_DIR) NAME="OpenTech-DB"
	@echo "Docker services stopped and volumes removed."

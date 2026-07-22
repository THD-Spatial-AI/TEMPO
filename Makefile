# ─────────────────────────────────────────────────────────────────────────────
# TEMPO — install / build / run automation
#
# One-command local install on a fresh machine (Linux or Windows via Git Bash/WSL):
#
#     make install     # install Node/Go/Docker if missing, .env, npm deps, Go backend, all images
#     make up          # start every Docker service (optimization engines + sims + db)
#     make dev         # launch the desktop app (Electron)
#
# Run `make help` for the full target list. Docker provides all Python services on
# fixed ports; the frontend, Go backend and Electron shell run natively on the host.
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
else
  GO_BIN := backend
endif

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
        ps logs dev web backend-run test clean clean-docker

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
# Cleanup
# ─────────────────────────────────────────────────────────────────────────────
clean: ## Remove build artifacts (dist/, Go binary)
	@rm -rf dist
	@rm -f backend-go/backend backend-go/backend.exe backend-go/backend-linux
	@echo "Removed dist/ and Go backend binaries."

clean-docker: ## Stop all services and remove their volumes (destroys GeoServer/PostGIS data)
	$(DC) $(REPO_FILES) down -v
	$(DC) $(GEO_FILE) down -v
	@$(MAKE) --no-print-directory _sibling-down DIR=$(CCSSIM_DIR)   NAME="CCS simulator"
	@$(MAKE) --no-print-directory _sibling-down DIR=$(HYDROSIM_DIR) NAME="Hydrogen simulator"
	@$(MAKE) --no-print-directory _sibling-down DIR=$(OPENTECH_DIR) NAME="OpenTech-DB"
	@echo "Docker services stopped and volumes removed."

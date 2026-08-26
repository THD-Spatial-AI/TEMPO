#!/usr/bin/env bash
# scripts/build_linux_wsl.sh
# Run this from PowerShell:  wsl -- bash scripts/build_linux_wsl.sh
# Builds the Linux AppImage + deb inside WSL2 (Ubuntu).
#
# WHY we copy to /tmp/tempo-build:
#   node_modules on /mnt/c/ is a Windows NTFS filesystem. WSL's npm cannot
#   delete Windows-native binaries (e.g. @esbuild/win32-x64/esbuild.exe)
#   that are locked by Windows, causing EIO errors on `npm ci`. Building on
#   a native Linux ext4 path avoids all cross-filesystem I/O issues.

set -eo pipefail

# ── 0. Strip Windows PATH so Windows npm/node don't shadow Linux ─────────────
export PATH="$(echo "$PATH" | tr ':' '\n' | grep -Ev '^/mnt/[a-z]/' | tr '\n' ':' | sed 's/:$//')"

# ── 1. Ensure Node.js is available via nvm ───────────────────────────────────
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "[setup] Installing nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
set +u
. "$NVM_DIR/nvm.sh"
if ! command -v node &>/dev/null; then
  echo "[setup] Installing Node.js LTS..."
  nvm install --lts
fi
nvm use --lts
set -u
echo "[setup] node $(node --version) at $(which node)"
echo "[setup] npm  $(npm --version)  at $(which npm)"

# ── 2. Ensure Go >= required version is available (user-local, no sudo) ────────
# Installs into $HOME so no sudo/password prompt is needed (which would hang a
# non-interactive `wsl -- bash ...` invocation). Version must satisfy go.mod.
GO_REQUIRED="1.26.6"
GO_HOME="$HOME/.local/go-${GO_REQUIRED}"
if [ ! -x "$GO_HOME/bin/go" ]; then
  echo "[setup] Installing Go ${GO_REQUIRED} to ${GO_HOME} (no sudo)..."
  curl -fsSL "https://go.dev/dl/go${GO_REQUIRED}.linux-amd64.tar.gz" -o /tmp/go.tar.gz
  rm -rf "$GO_HOME"
  mkdir -p "$GO_HOME"
  tar -C "$GO_HOME" --strip-components=1 -xzf /tmp/go.tar.gz
fi
export PATH="$GO_HOME/bin:$PATH"
echo "[setup] Go $(go version | awk '{print $3}') at $(command -v go)"

# ── 3. System dependencies ────────────────────────────────────────────────────
MISSING=()
command -v mksquashfs &>/dev/null || MISSING+=(squashfs-tools)
command -v rsync      &>/dev/null || MISSING+=(rsync)
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "[setup] Installing: ${MISSING[*]}"
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends "${MISSING[@]}"
fi

# ── 4. Copy project to native Linux filesystem ────────────────────────────────
WIN_PROJECT="$(dirname "$0")/.."
WIN_PROJECT="$(cd "$WIN_PROJECT" && pwd)"   # resolves to /mnt/c/...
BUILD_DIR="/tmp/tempo-build"

echo "[build] Syncing project to $BUILD_DIR (excluding node_modules, .venv, release, dist)..."
# dist/ is excluded because this script regenerates it with its own `npm run build`
# below; copying it also races a concurrent Windows `vite build` rewriting dist/.
# rsync exit 24 (source files vanished mid-copy) is benign here — tolerate it.
rsync -a --delete \
  --exclude='node_modules/' \
  --exclude='release/' \
  --exclude='dist/' \
  --exclude='.venv*/' \
  --exclude='*.pyc' \
  --exclude='__pycache__/' \
  --exclude='.git/' \
  "$WIN_PROJECT/" "$BUILD_DIR/" || { rc=$?; [ "$rc" -eq 24 ] || exit "$rc"; }

cd "$BUILD_DIR"

# ── 5. npm ci (on native Linux filesystem — no Windows .exe conflict) ─────────
echo "[build] Installing npm dependencies (Linux)..."
npm ci --legacy-peer-deps

# ── 6. Vite frontend build ────────────────────────────────────────────────────
echo "[build] Building Vite frontend..."
npm run build

# ── 7. Go backend (linux/amd64) ───────────────────────────────────────────────
echo "[build] Building Go backend..."
cd backend-go
GOOS=linux GOARCH=amd64 go build -o ../backend-go/backend-linux .
cd "$BUILD_DIR"

# ── 8. electron-builder ───────────────────────────────────────────────────────
echo "[build] Building Linux packages with electron-builder..."
# Allow electron-builder to fail partially (e.g. deb but not AppImage) so we
# still copy whatever artifacts were produced to the Windows release folder.
npx electron-builder --linux || EB_EXIT=$?

# ── 9. Copy artifacts back to Windows project ─────────────────────────────────
WIN_RELEASE="$WIN_PROJECT/release"
mkdir -p "$WIN_RELEASE"
echo "[build] Copying artifacts to $WIN_RELEASE ..."
cp -v release/*.AppImage release/*.deb release/*.blockmap release/*.yml "$WIN_RELEASE/" 2>/dev/null || true

echo ""
echo "✓ Linux build complete. Output in: $WIN_RELEASE"
ls -lh "$WIN_RELEASE"/*.AppImage "$WIN_RELEASE"/*.deb 2>/dev/null || true

# Propagate electron-builder exit code (non-zero = some target failed)
exit "${EB_EXIT:-0}"

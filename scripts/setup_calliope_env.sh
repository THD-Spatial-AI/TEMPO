#!/usr/bin/env bash
# =============================================================================
# Setup Calliope Conda Environment  (Linux / macOS)
# Run this once before launching the Calliope Visualizator app.
#
# Usage:
#   bash scripts/setup_calliope_env.sh
# =============================================================================

set -e

echo ""
echo "======================================="
echo "  Calliope Environment Setup (Unix)   "
echo "======================================="
echo ""

# ---------------------------------------------------------------------------
# 1. Locate conda
# ---------------------------------------------------------------------------
CONDA_CMD=""

# First, try the PATH
if command -v conda &>/dev/null; then
    CONDA_CMD=$(command -v conda)
fi

# Fallback: common install paths
if [ -z "$CONDA_CMD" ]; then
    for candidate in \
        "$HOME/miniconda3/bin/conda" \
        "$HOME/Miniconda3/bin/conda" \
        "$HOME/anaconda3/bin/conda" \
        "$HOME/Anaconda3/bin/conda" \
        "/opt/conda/bin/conda" \
        "/usr/local/anaconda3/bin/conda"
    do
        if [ -f "$candidate" ]; then
            CONDA_CMD="$candidate"
            break
        fi
    done
fi

if [ -z "$CONDA_CMD" ]; then
    echo "ERROR: conda not found."
    echo ""
    echo "Please install Miniconda from https://docs.conda.io/en/latest/miniconda.html"
    echo "Then re-run this script."
    exit 1
fi

echo "Found conda at: $CONDA_CMD"

# ---------------------------------------------------------------------------
# 2. Check if 'calliope' environment already exists
# ---------------------------------------------------------------------------
if $CONDA_CMD env list 2>&1 | grep -q '^\s*calliope\s'; then
    echo ""
    echo "The 'calliope' conda environment already exists."
    echo "To reinstall, remove it first with:  conda env remove -n calliope"
    echo ""
    echo "Verifying existing installation …"
else
    # ---------------------------------------------------------------------------
    # 3. Create the environment
    # ---------------------------------------------------------------------------
    echo ""
    echo "Creating 'calliope' conda environment (this may take several minutes) …"
    echo "  Installing: calliope, coin-or-cbc, python=3.9"
    echo ""
    $CONDA_CMD create -y -c conda-forge -n calliope calliope coin-or-cbc python=3.9
    echo ""
    echo "Environment created successfully."
fi

# ---------------------------------------------------------------------------
# 4. Verify
# ---------------------------------------------------------------------------
echo ""
echo "Verifying calliope installation …"
$CONDA_CMD run -n calliope python -c "import calliope; print('calliope version:', calliope.__version__)"

echo ""
echo "======================================="
echo "  Setup complete! You can now run the  "
echo "  Calliope Visualizator application.   "
echo "======================================="
echo ""

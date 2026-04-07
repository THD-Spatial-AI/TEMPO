# ─── Calliope Web Service ─────────────────────────────────────────────────────
# Runs Calliope 0.6.8 as an HTTP service with SSE streaming.
#
# Build:   docker build -t calliope-runner .
# Run:     docker run -p 5000:5000 calliope-runner
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.8-slim

LABEL org.opencontainers.image.description="Calliope 0.6.8 optimisation web service"

WORKDIR /app

# System dependencies: CBC solver + build tools for some scientific Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
        coinor-cbc \
        build-essential \
        libhdf5-dev \
        libnetcdf-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies in two layers for better caching:
#   1. Service deps (fastapi, uvicorn) — change rarely
#   2. Calliope + scientific stack — change rarely but are heavy
COPY python/requirements.service.txt ./requirements.service.txt
COPY python/requirements.txt         ./requirements.txt

# 1. Upgrade toolchain
RUN pip install --upgrade pip setuptools wheel

# 2. Pre-install the scientific stack as manylinux binary wheels BEFORE calliope.
#    calliope 0.6.8 pins old numpy/scipy/scikit-learn versions whose setup.py
#    is broken on modern setuptools. Installing them as pre-built wheels first
#    means pip never tries to compile them from source.
RUN pip install --only-binary=:all: \
    "numpy>=1.20,<1.24" \
    "scipy>=1.6,<1.8" \
    "scikit-learn>=0.22,<0.24" \
    "pandas>=1.3,<2.0"

# 3. Service deps (fastapi, uvicorn) — no binary constraint needed
RUN pip install --no-cache-dir -r requirements.service.txt

# 4. Calliope — heavy scientific deps already satisfied above, pip reuses them
RUN pip install --no-cache-dir -r requirements.txt

# Copy the python package (runner + service + adapters + services)
COPY python/ ./python/

# Expose the service port
EXPOSE 5000

# Health-check so Docker knows when the service is ready
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"

# Tell Calliope/Pyomo to use the system CBC binary (installed via coinor-cbc above)
ENV CALLIOPE_SOLVER_DIR=""

CMD ["uvicorn", "python.calliope_service:app", "--host", "0.0.0.0", "--port", "5000"]

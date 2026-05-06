# ─── Calliope Web Service ─────────────────────────────────────────────────────
# Runs Calliope 0.6.8 as an HTTP service with SSE streaming.
#
# Build:   docker build -t calliope-runner .
# Run:     docker run -p 5000:5000 calliope-runner
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim

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
COPY python/requirements.calliope.txt ./requirements.calliope.txt

# 1. Upgrade toolchain
RUN pip install --upgrade pip setuptools wheel

# 2. Pre-install the scientific stack as binary wheels BEFORE calliope.
#    --prefer-binary tells pip to always choose a wheel over a source dist.
#    Version ranges match requirements.calliope.txt and have verified
#    manylinux cp311 wheels on PyPI.
RUN pip install --prefer-binary --no-cache-dir \
    "numpy>=1.23.5,<2.0" \
    "scipy>=1.9,<2.0" \
    "scikit-learn>=1.0,<2.0" \
    "pandas>=1.5.0,<2.0"

# 3. Service deps (fastapi, uvicorn) — no binary constraint needed
RUN pip install --no-cache-dir -r requirements.service.txt

# 4. Calliope deps — heavy scientific stack already satisfied above, pip reuses them
RUN pip install --no-cache-dir -r requirements.txt

# 4b. Calliope itself — requirements.calliope.txt intentionally omits it.
#     Use --no-deps to bypass calliope's outdated numpy<1.21 constraint in PyPI metadata.
RUN pip install --no-deps --no-cache-dir calliope==0.6.8

# 4c. Patch calliope for Pyomo 6.4+ compatibility:
#     - run.py: opt.name → getattr(opt,'name','')  (LegacySolver has no .name)
RUN sed -i 's/in opt\.name/in getattr(opt, "name", "")/g' \
    "$(python -c "import calliope, os; print(os.path.join(os.path.dirname(calliope.__file__),'backend','run.py'))")"

# 4d. Patch util.py get_var for Pyomo 6.4+ index-set naming change.
#     In Pyomo 6.4+ multi-dim sets report name='SetProduct_OrderedSet' instead
#     of var+'_index', breaking rename_axis in the postprocess step.
COPY docker-patches/patch_calliope_util.py /tmp/patch_calliope_util.py
RUN python /tmp/patch_calliope_util.py

# 5. HiGHS solver (optional fast LP solver via Python package — no binary needed)
#    --only-binary ensures we never attempt a source build (safer in slim images).
#    highspy 2.x breaks Pyomo's APPSI interface, so pin to <2.0.
RUN pip install --only-binary=highspy --no-cache-dir "highspy>=1.5,<2.0" || \
    echo "highspy wheel not available for this platform — CBC will be used"

# Copy the python package (runner + service + adapters + services)
COPY python/ ./python/

# Expose the service port
EXPOSE 5000

# Health-check so Docker knows when the service is ready
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"

# Tell Calliope/Pyomo to use the system CBC binary (installed via coinor-cbc above)
ENV CALLIOPE_SOLVER_DIR=""

# --reload intentionally omitted: WatchFiles restarts the process on every file-save,
# killing any in-flight model run mid-stream (ERR_CONNECTION_RESET).
# For local development with live-reload: docker compose -f docker-compose.yml -f docker-compose.dev.yml up
CMD ["uvicorn", "python.calliope_service:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "1"]

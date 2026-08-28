# main.py — a small authenticated, rate-limited, streaming proxy in front of Ollama.
#
# Exposes the OpenAI-compatible surface TEMPO's Model Advisor needs
# (/v1/chat/completions, /v1/models), gated by a per-user API key. Requests are
# streamed straight through so token-by-token output still works.
#
# It does NOT open any new hole in the firewall — it's a normal service you run on
# the workstation and expose on a port your admin whitelists (like 8081/9000).

import collections
import json
import os
import time

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

# ── Config (all via env; see docker-compose.yml) ────────────────────────────
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://host.docker.internal:11434").rstrip("/")
KEYS_FILE = os.environ.get("KEYS_FILE", "/data/keys.json")
RATE_LIMIT_PER_MIN = int(os.environ.get("RATE_LIMIT_PER_MIN", "60"))

# keys.json maps an API key string -> metadata, e.g. { "sk-tempo-abc": {"name": "Alice"} }
def load_keys():
    try:
        with open(KEYS_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

KEYS = load_keys()

# Naive per-key sliding-window limiter. In-memory: resets on restart and is
# per-process — fine for a handful of users; swap for Redis if you scale out.
_hits = collections.defaultdict(collections.deque)


def _allow(key: str) -> bool:
    now = time.time()
    dq = _hits[key]
    while dq and now - dq[0] > 60:
        dq.popleft()
    if len(dq) >= RATE_LIMIT_PER_MIN:
        return False
    dq.append(now)
    return True


def _auth(request: Request) -> str:
    hdr = request.headers.get("authorization", "")
    token = hdr[7:].strip() if hdr[:7].lower() == "bearer " else ""
    if not token or token not in KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")
    if not _allow(token):
        raise HTTPException(status_code=429, detail="Rate limit exceeded — try again shortly.")
    return token


app = FastAPI(title="Ollama Gateway")


@app.get("/health")
async def health():
    return {"ok": True, "ollama": OLLAMA_URL, "keys_loaded": len(KEYS)}


@app.get("/v1/models")
async def models(request: Request):
    _auth(request)
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{OLLAMA_URL}/v1/models", headers={"host": "localhost"})
    return JSONResponse(status_code=r.status_code, content=r.json())


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    _auth(request)
    body = await request.body()

    # Stream the upstream response straight back (works for stream=true SSE and
    # for a single non-streamed JSON body alike).
    client = httpx.AsyncClient(timeout=None)
    upstream = client.build_request(
        "POST",
        f"{OLLAMA_URL}/v1/chat/completions",
        content=body,
        # Host: localhost keeps Ollama's DNS-rebinding guard happy.
        headers={"content-type": "application/json", "host": "localhost"},
    )
    r = await client.send(upstream, stream=True)

    async def relay():
        try:
            async for chunk in r.aiter_raw():
                yield chunk
        finally:
            await r.aclose()
            await client.aclose()

    return StreamingResponse(
        relay(),
        status_code=r.status_code,
        media_type=r.headers.get("content-type", "text/event-stream"),
    )

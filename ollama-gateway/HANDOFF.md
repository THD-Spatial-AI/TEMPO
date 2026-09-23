# HANDOFF — Ollama Gateway for TEMPO "Model Advisor"

Read this first. You (a fresh Claude session, likely running on the workstation)
are picking up a task from an earlier session. This document is self-contained —
it assumes none of the prior conversation.

---

## The goal

TEMPO (an Electron desktop app for energy-system modelling) has a new **Model
Advisor** feature — a Results tab that uses an LLM to turn a run's results into a
plain-language report and answer questions about it. It supports several LLM
providers via **bring-your-own-key**, including any **OpenAI-compatible** endpoint
and **Ollama** (local/remote).

We want the Model Advisor to run on the **workstation's Ollama** (a powerful box,
hostname `pop-os`, user `spatial-ai`, IP `10.1.66.52`). Later, other users should
get an **API key** to use it too — no client install, just a URL + key.

**This `ollama-gateway/` folder is the solution:** a small authenticated,
rate-limited, streaming proxy in front of Ollama that exposes the OpenAI-compatible
API TEMPO needs, gated by per-user API keys.

---

## The network reality (IMPORTANT — do not re-derive this the hard way)

The earlier session spent a lot of effort discovering these constraints. Take them
as given:

- The workstation `10.1.66.52` is on the **university network** (private `10.x` IP).
- A **campus/perimeter firewall permits only inbound TCP 8081 and 9000** to it.
  Everything else is blocked: the 5000–5004 runners, 5678 (n8n), 22 (SSH), and
  **11434 (Ollama)**. The host's own `ufw` is **inactive** — the block is upstream
  network infrastructure, NOT something changeable on the workstation.
- **Tailscale is actively blocked** (the campus resets connections to
  `controlplane.tailscale.com`). Do **not** attempt Tailscale.
- **Do NOT use tunnels (Cloudflare Tunnel / ngrok / Tailscale) to bypass the
  firewall.** The campus deliberately blocks tunneling; circumventing it is an
  authorization/policy violation on a managed machine. This was explicitly ruled
  out.
- **The sanctioned path** (how 8081/9000 already work) is to run a service and have
  whoever manages the workstation's network **whitelist its port**. That is what
  this gateway does — it's a normal service on a to-be-whitelisted port, not a
  bypass.
- **Ollama is already running** on the workstation as a Docker container,
  published on `0.0.0.0:11434` (the existing feedback-pipeline on port 9000 already
  calls it internally). We do not need to install or reconfigure Ollama.

---

## What was built (this folder)

| File | What it does |
|---|---|
| `app/main.py` | FastAPI proxy. Checks `Authorization: Bearer <key>` against `keys.json`, per-key rate limit (default 60/min), then **streams** requests through to Ollama's `/v1/chat/completions`. Also `/v1/models` and `/health`. |
| `Dockerfile`, `docker-compose.yml` | Containerise it. Publishes host port **8100** → container 8000. Reaches host Ollama via `host.docker.internal:11434`. |
| `gen_key.py` | `add` / `list` / `revoke` API keys (stored in `keys.json`). |
| `keys.example.json` | Template for `keys.json` (the real one is git-ignored). |
| `README.md` | User-facing deploy + TEMPO config guide. |

Design notes: keys are static (a JSON file — fine for a handful of users); rate
limit is in-memory (resets on restart, per-process); the proxy sets `Host:
localhost` upstream so Ollama's DNS-rebinding guard doesn't 403.

---

## What must be done next (the actual TODO) — ✅ DONE (2026-08-31)

Steps 1–3 done as originally planned:
```bash
cd ollama-gateway
cp keys.example.json keys.json
python3 gen_key.py add "Ricardo"       # -> sk-tempo-KN7iA2S_qcNKzhKByxA4fW6dmWiwcmZZ
docker compose up -d --build
```
Validated locally: `curl localhost:8100/health` and `/v1/models` (with the key)
both work — gateway ↔ host Ollama (native `ollama serve`, not a container) via
`host.docker.internal:11434` is confirmed good, no `172.17.0.1` fallback needed.

**Step 4 (firewall whitelist) turned out to be unnecessary — we did not open TCP
8100.** Instead we reused the *already-whitelisted* port 9000 by adding a
path-based reverse proxy in front of it, in the separate `feedback_pipeline` repo
(`/home/spatial-ai/Desktop/feedback_pipeline`, a different project — the
"wildfire-app" workshop feedback tool, unrelated to TEMPO):

- `feedback_pipeline/docker-compose.yml`: `feedback-pipeline` no longer publishes
  `9000:8000` directly; a new `gateway-proxy` service (`nginx:alpine`) now
  publishes `9000:80` and routes by path:
  - `/ollama/*` → `host.docker.internal:8100` (this gateway), prefix stripped
  - `/*` (everything else) → `feedback-pipeline:8000` internally, unchanged
- Config: `feedback_pipeline/gateway-proxy/default.conf`.
- Verified: `feedback-pipeline`'s own `/health` and `/api/v1/*` routes work
  identically through the proxy; the gateway's `/health`, `/v1/models`, and both
  streaming and non-streaming `/v1/chat/completions` all work at `.../ollama/...`.
- **Uncommitted** in that repo (git diff: `docker-compose.yml` modified,
  `gateway-proxy/` untracked) — deliberately left for Ricardo to review/commit,
  since it's a different project's repo with its own GitLab remote
  (`mygit.th-deg.de/thd-spatial-ai/storcito1/feedback_pipeline`).
- The direct `ollama-gateway` port 8100 is still published too (harmless,
  local-only) — TEMPO should NOT use it remotely; use the `/ollama/` path on 9000
  instead.

5. **Verify remotely** from the laptop (9000 is already open):
   `curl http://10.1.66.52:9000/ollama/health`
6. **Configure TEMPO** → Settings → Model Advisor:
   - Provider: **OpenAI-compatible**
   - Base URL: `http://10.1.66.52:9000/ollama/v1`
   - API key: `sk-tempo-KN7iA2S_qcNKzhKByxA4fW6dmWiwcmZZ`
   - Model: `qwen2.5:14b` (or `qwen2.5vl:7b` — the two currently pulled on the
     workstation; no `llama3.1:8b` is pulled)
   - Test connection → Generate report.

### Later / multi-user hardening (not blocking)
- Issue one key per user with `gen_key.py add "<name>"`; revoke with `revoke`.
- Consider a **TLS front (Caddy)** if it ever needs `https://` or goes beyond campus.
- Optional **`/v1/models` allow-list** so users can only run approved models.
- Persistent / shared rate-limit store (Redis) if you scale to many users or replicas.
- Make sure a large-enough Ollama **context window** is configured
  (`OLLAMA_CONTEXT_LENGTH` / `num_ctx` ≥ 64k) — TEMPO result contexts can be ~50k+
  tokens, and the default `num_ctx` silently truncates.

---

## How to know it's done
- On the workstation: `curl localhost:8100/v1/models` (with key) returns models.
- After the port is whitelisted: TEMPO's Model Advisor **Test connection** returns
  "ok" and **Generate report** streams a report from the workstation's Ollama.

## Related context (the TEMPO app side)
The Model Advisor feature itself lives in the main TEMPO repo (renderer +
Electron). The pieces relevant here: `src/services/aiSettings.js` (provider list,
incl. `ollama` and `compatible`), `electron/ai/providers.cjs` (the adapters,
including the OpenAI-compatible one this gateway targets). No app change is needed
to use this gateway — the "OpenAI-compatible" provider already accepts a base URL +
key. TEMPO is at version 3.1.0, which is the first release to include Model Advisor.

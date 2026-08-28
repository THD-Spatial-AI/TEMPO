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

## What must be done next (the actual TODO)

1. **Get this folder onto the workstation** (git pull/clone the repo, or copy it).
2. **Create keys + run it** (on the workstation):
   ```bash
   cd ollama-gateway
   cp keys.example.json keys.json
   python3 gen_key.py add "Ricardo"       # prints an sk-tempo-… key — save it
   docker compose up -d --build
   ```
3. **Validate locally on the workstation** (no firewall needed for this):
   ```bash
   curl -s localhost:8100/health
   curl -s localhost:8100/v1/models -H "Authorization: Bearer sk-tempo-…"
   ```
   If `/v1/models` lists the Ollama models, the gateway ↔ Ollama link works.
   - If it fails: check `docker compose logs`. If it can't reach Ollama, set
     `OLLAMA_URL=http://172.17.0.1:11434` in `docker-compose.yml` (docker0 gateway)
     instead of `host.docker.internal`.
4. **Request the firewall whitelist for TCP 8100** — from whoever opened 8081/9000
   (lab admin / PI / campus IT). This is the one external dependency. (Or reuse a
   port they prefer and change it in `docker-compose.yml`.)
5. **Verify remotely** from the laptop once opened:
   `curl http://10.1.66.52:8100/health`
6. **Configure TEMPO** → Settings → Model Advisor:
   - Provider: **OpenAI-compatible**
   - Base URL: `http://10.1.66.52:8100/v1`
   - API key: the `sk-tempo-…` issued
   - Model: an Ollama model pulled on the workstation (e.g. `llama3.1:8b`)
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

# Ollama Gateway

A small, self-contained service that puts **API-key authentication + per-key rate
limiting** in front of the workstation's Ollama, exposing the OpenAI-compatible
endpoints TEMPO's Model Advisor uses. Runs as its own Docker container next to the
existing services — **no firewall bypass**: you expose it on a port your admin
whitelists, exactly like ports 8081 and 9000.

```
TEMPO (OpenAI-compatible, base=/v1, key=sk-tempo-…)
   → gateway :8100   (checks key, rate-limits, streams)
      → Ollama :11434 (localhost on the workstation)
```

## Deploy on the workstation

```bash
# 1. copy this folder to the workstation, then:
cd ollama-gateway

# 2. create a keys file and issue a key
cp keys.example.json keys.json      # or: echo '{}' > keys.json
python3 gen_key.py add "Ricardo"    # prints sk-tempo-…  (save it)

# 3. build + run
docker compose up -d --build

# 4. smoke test locally on the workstation
curl -s localhost:8100/health
curl -s localhost:8100/v1/models -H "Authorization: Bearer sk-tempo-…"
```

If `/v1/models` returns your models, the gateway ↔ Ollama link works.

## Make it reachable from TEMPO

The container publishes host port **8100**. That port must be **whitelisted on the
same firewall that already allows 8081/9000** — ask whoever manages the
workstation's network exposure to open TCP **8100** (or pick a port they prefer and
change it in `docker-compose.yml`). This is the sanctioned request, not a workaround.

Confirm from your laptop once opened:

```bash
curl http://<workstation-ip>:8100/health
```

## Configure TEMPO → Settings → Model Advisor

- **Provider:** `OpenAI-compatible`
- **Base URL:** `http://<workstation-ip>:8100/v1`
- **API key:** the `sk-tempo-…` you issued
- **Model:** an Ollama model you've pulled (e.g. `llama3.1:8b`, `qwen2.5:14b`)

Then **Test key** → **Generate report**.

## Managing users

```bash
python3 gen_key.py add "Alice"      # issue a key
python3 gen_key.py list             # list issued keys
python3 gen_key.py revoke sk-tempo-…# revoke one
docker compose restart              # reload keys after changes
```

## Notes / limits

- **Rate limit** is `RATE_LIMIT_PER_MIN` requests/min per key (default 60), enforced
  in-memory — fine for a handful of users; use Redis if you scale to many replicas.
- **HTTPS:** this serves plain HTTP. For campus-internal use that's usually fine; if
  you later expose it beyond the campus, put it behind a TLS terminator (Caddy/nginx)
  or Cloudflare Access and switch the Base URL to `https://…`.
- Keys are secrets — `keys.json` is git-ignored; don't commit it. The container
  mounts it read-only.
- The gateway reaches Ollama via `host.docker.internal` (mapped to the host gateway).
  If your Docker doesn't support that, set `OLLAMA_URL=http://172.17.0.1:11434` in
  `docker-compose.yml`.

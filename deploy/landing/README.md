# Landing page deployment — tempo.th-deg.de

The landing page (`landing/`) is deployed by `.github/workflows/landing.yml` to the
VM at **195.37.232.70**, which also hosts **otdb.th-deg.de** (OpenTech-DB).

```
                        195.37.232.70
 tempo.th-deg.de ─┐   ┌──────────────────────────────────────────────┐
                  ├──▶│ opentech-nginx  (:80/:443, OpenTech-DB repo) │
 otdb.th-deg.de ──┘   │  ├─ otdb.th-deg.de  → backend:8000 / SPA     │
                      │  └─ /etc/nginx/sites/tempo.conf              │
                      │       → /var/www/tempo/current  (static)     │
                      └──────────────────────────────────────────────┘
```

Only one process can bind 80/443, so TEMPO doesn't run its own web server. It
adds a vhost to OpenTech-DB's nginx container and reloads it with `nginx -s reload`,
which never restarts it. If nginx rejects the config, `deploy.sh` rolls it back
so otdb.th-deg.de is never affected.

## Pipeline

| Trigger | What happens |
|---|---|
| PR touching `landing/**` | Build only (GitHub-hosted runner) |
| Push to `main` / manual run | Build → deploy on the VM → smoke test both domains |
| Weekly (Mon 03:17) | Renew the Let's Encrypt cert if < 30 days left |

Each deploy goes to `/var/www/tempo/releases/<timestamp>-<sha>`, and then the
`current` symlink is switched atomically. The last 5 releases are kept.
**Rollback:** `ln -sfn /var/www/tempo/releases/<older> /var/www/tempo/current`

## One-time setup

### 1. OpenTech-DB: let its nginx serve extra sites

In the OpenTech-DB repo:

- `deploy/nginx.conf`, append at the end:
  ```nginx
  include /etc/nginx/sites/*.conf;
  ```
- `docker-compose.prod.yml`, under `nginx.volumes`, add:
  ```yaml
  - /opt/nginx-sites:/etc/nginx/sites:ro
  - /var/www/tempo:/var/www/tempo:ro
  ```

Commit, then re-run OpenTech-DB's *Deploy to Production* workflow so the
container is recreated with the new mounts. Until a vhost exists the include
matches nothing, so otdb.th-deg.de behaves exactly as before.

### 2. VM: directories

```bash
sudo mkdir -p /opt/nginx-sites /var/www/tempo/releases /var/lib/letsencrypt
sudo chown -R <runner-user>:<runner-user> /opt/nginx-sites /var/www/tempo
```

`<runner-user>` is the account the GitHub runner service runs as. It must be in
the `docker` group, as it already is for OpenTech-DB.

### 3. VM: GitHub runner for TEMPO

The workflow targets `runs-on: [self-hosted, tempo-runner]`.

- **If the existing `opentechdb-runner` is registered to the OpenTech-DB repo only**,
  register a second runner on the VM for `THD-Spatial-AI/TEMPO`:
  GitHub → TEMPO → Settings → Actions → Runners → *New self-hosted runner*.
  Install it in a separate directory (e.g. `~/actions-runner-tempo`) and give it the label
  `tempo-runner`. Then run `sudo ./svc.sh install <runner-user> && sudo ./svc.sh start`.
- **If it is an organisation runner**, just add the label `tempo-runner` to it.

### 4. GitHub: optional variable

TEMPO → Settings → Secrets and variables → Actions → *Variables*:
`LETSENCRYPT_EMAIL` = address for certificate expiry notices.

### 5. Deploy

Push to `main` or run *Landing Page* manually from the Actions tab. The first run
issues the certificate through the existing `/.well-known/acme-challenge/` handler.

## Manual deploy (on the VM)

```bash
cd landing && npm ci && npm run build && cd ..
bash deploy/landing/deploy.sh landing/dist
```

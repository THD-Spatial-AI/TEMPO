// Port selection and service identification for the locally managed services.
// No electron dependency so it can be unit-tested.
const net = require('net');
const http = require('http');

const PROBE_HOSTS = ['127.0.0.1', '0.0.0.0', '::'];
const HEALTH_TIMEOUT_MS = 1500;

function canBind(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      // A host without IPv6 can't conflict on the IPv6 wildcard.
      resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT');
    });
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

/**
 * True only if `port` can be bound on every address. Windows lets 127.0.0.1:N
 * bind while another process (e.g. a port published by Docker) holds [::]:N, so
 * a loopback-only probe reports such a port as free.
 */
async function isPortFree(port) {
  for (const host of PROBE_HOSTS) {
    if (!await canBind(port, host)) return false;
  }
  return true;
}

/**
 * First free port from `preferred` up to +20. Ports in `exclude` are skipped
 * (they belong to other services), except `preferred` itself.
 */
async function findFreePort(preferred, exclude = new Set()) {
  for (let candidate = preferred; candidate <= preferred + 20; candidate++) {
    if (candidate !== preferred && exclude.has(candidate)) continue;
    if (await isPortFree(candidate)) return candidate;
  }
  throw new Error(`No free port in range ${preferred}–${preferred + 20}`);
}

/**
 * Ask whatever listens on `port` what it is, via GET /health.
 * @returns {Promise<'closed'|'match'|'foreign'|'unresponsive'>}
 */
function identifyService(port, engine, timeoutMs = HEALTH_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { if (body.length < 4096) body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body).engine === engine ? 'match' : 'foreign');
        } catch {
          resolve('foreign');
        }
      });
    });
    req.on('timeout', () => { resolve('unresponsive'); req.destroy(); });
    req.on('error', (err) => resolve(err.code === 'ECONNREFUSED' ? 'closed' : 'foreign'));
  });
}

/** Keep `preferred` if free or already serving `engine`, otherwise find another port. */
async function choosePort(preferred, engine, { timeoutMs, exclude } = {}) {
  if (await identifyService(preferred, engine, timeoutMs) === 'match') return preferred;
  return findFreePort(preferred, exclude);
}

/** Parse the output of `docker inspect --format` using CONTAINER_STATUS_FORMAT. */
function parseContainerStatus(name, output) {
  const [running, health, status, project, bindings] = output.trim().split('|');
  const hostPort = /"HostPort":"(\d+)"/.exec(bindings || '');
  return {
    name,
    running: running === 'true',
    healthy: health === 'healthy' ? true : health === 'unhealthy' ? false : null,
    status: status || 'unknown',
    composeManaged: !!project,
    publishedPort: hostPort ? Number(hostPort[1]) : null,
  };
}

// .State.Health is nil for containers without a healthcheck; reading through it errors.
const CONTAINER_STATUS_FORMAT =
  '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.Status}}' +
  '|{{index .Config.Labels "com.docker.compose.project"}}|{{json .HostConfig.PortBindings}}';

module.exports = { isPortFree, findFreePort, identifyService, choosePort, parseContainerStatus, CONTAINER_STATUS_FORMAT };

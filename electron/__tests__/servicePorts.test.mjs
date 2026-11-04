import { describe, it, expect, afterEach } from 'vitest';
import net from 'net';
import http from 'http';
import servicePorts from '../servicePorts.cjs';
const { isPortFree, findFreePort, identifyService, choosePort, parseContainerStatus } = servicePorts;

const open = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map(s => new Promise(r => s.close(r))));
});

const holdPort = (host, port = 0) => new Promise((resolve, reject) => {
  // resume() lets accepted sockets see the client's FIN so close() can finish.
  const s = net.createServer((c) => { c.on('error', () => {}); c.resume(); });
  s.once('error', reject);
  s.listen(port, host, () => { open.push(s); resolve(s.address().port); });
});

const fakeHealth = (body, { status = 200, delayMs = 0 } = {}) => new Promise((resolve) => {
  const s = http.createServer((_req, res) => {
    setTimeout(() => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    }, delayMs);
  });
  s.listen(0, '127.0.0.1', () => { open.push(s); resolve(s.address().port); });
});

const unusedPort = async () => {
  const s = net.createServer();
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise(r => s.close(r));
  return port;
};

describe('isPortFree', () => {
  it('reports an unused port as free', async () => {
    expect(await isPortFree(await unusedPort())).toBe(true);
  });

  it('reports a loopback-only holder as busy (how uvicorn binds)', async () => {
    expect(await isPortFree(await holdPort('127.0.0.1'))).toBe(false);
  });

  it('reports a dual-stack wildcard holder as busy (how Docker publishes ports)', async () => {
    expect(await isPortFree(await holdPort('::'))).toBe(false);
  });

  it('reports an IPv4 wildcard holder as busy', async () => {
    expect(await isPortFree(await holdPort('0.0.0.0'))).toBe(false);
  });
});

describe('findFreePort', () => {
  it('returns the preferred port when it is free', async () => {
    const port = await unusedPort();
    expect(await findFreePort(port)).toBe(port);
  });

  it('skips a port held on the wildcard address', async () => {
    const port = await holdPort('::');
    const found = await findFreePort(port);
    expect(found).toBeGreaterThan(port);
    expect(found).toBeLessThanOrEqual(port + 20);
  });

  it('does not move onto a port reserved for another service', async () => {
    const port = await holdPort('::');
    const reserved = await findFreePort(port);
    const found = await findFreePort(port, new Set([reserved]));
    expect(found).toBeGreaterThan(reserved);
  });

  it('still returns the preferred port when it is free and listed as reserved', async () => {
    const port = await unusedPort();
    expect(await findFreePort(port, new Set([port]))).toBe(port);
  });
});

describe('identifyService', () => {
  it('is "closed" when nothing listens', async () => {
    expect(await identifyService(await unusedPort(), 'pypsa')).toBe('closed');
  });

  it('is "match" when /health reports the expected engine', async () => {
    const port = await fakeHealth({ status: 'ok', engine: 'pypsa' });
    expect(await identifyService(port, 'pypsa')).toBe('match');
  });

  it('is "foreign" for a different engine', async () => {
    const port = await fakeHealth({ status: 'ok', engine: 'osemosys' });
    expect(await identifyService(port, 'pypsa')).toBe('foreign');
  });

  it('is "foreign" for another app answering 404', async () => {
    const port = await fakeHealth('404 page not found', { status: 404 });
    expect(await identifyService(port, 'pypsa')).toBe('foreign');
  });

  it('is "foreign" for non-JSON 200 responses', async () => {
    const port = await fakeHealth('<html></html>');
    expect(await identifyService(port, 'pypsa')).toBe('foreign');
  });

  it('is "unresponsive" when a listener accepts but does not answer in time', async () => {
    const port = await holdPort('127.0.0.1');
    expect(await identifyService(port, 'pypsa', 150)).toBe('unresponsive');
  });
});

describe('parseContainerStatus', () => {
  it('reads a healthy compose container with its published port', () => {
    const st = parseContainerStatus('pg', 'true|healthy|running|calliope_editiontool|{"5432/tcp":[{"HostIp":"","HostPort":"5433"}]}');
    expect(st).toEqual({
      name: 'pg', running: true, healthy: true, status: 'running', composeManaged: true, publishedPort: 5433,
    });
  });

  it('handles a stopped container with no healthcheck or compose project', () => {
    const st = parseContainerStatus('pg', 'false||exited||{"5432/tcp":[{"HostIp":"","HostPort":"5432"}]}');
    expect(st.running).toBe(false);
    expect(st.healthy).toBe(null);
    expect(st.composeManaged).toBe(false);
    expect(st.publishedPort).toBe(5432);
  });

  it('reports no published port when there are no bindings', () => {
    expect(parseContainerStatus('x', 'false|unhealthy|exited||{}').publishedPort).toBe(null);
    expect(parseContainerStatus('x', 'false|unhealthy|exited||null').healthy).toBe(false);
  });
});

describe('choosePort', () => {
  it('reuses the port when our engine already holds it', async () => {
    const port = await fakeHealth({ engine: 'pypsa' });
    expect(await choosePort(port, 'pypsa')).toBe(port);
  });

  it('keeps the preferred port when it is free', async () => {
    const port = await unusedPort();
    expect(await choosePort(port, 'pypsa')).toBe(port);
  });

  it('moves away from another application', async () => {
    const port = await fakeHealth('nope', { status: 404 });
    expect(await choosePort(port, 'pypsa')).toBeGreaterThan(port);
  });

  it('moves away from a listener that never answers', async () => {
    const port = await holdPort('127.0.0.1');
    expect(await choosePort(port, 'pypsa', { timeoutMs: 150 })).toBeGreaterThan(port);
  });
});

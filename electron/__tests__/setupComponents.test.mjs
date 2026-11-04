import { describe, it, expect } from 'vitest';
import setupComponents from '../setupComponents.cjs';
const { COMPONENTS, resolveSelection, buildPlan, diskNeededGb, explainInstallError, runPlan } = setupComponents;

const REQUIRED = ['backend', 'calliope', 'highs'];
const ids = (plan) => plan.map(s => s.id);

const fakeSteps = ({ failInstall = [], failVerify = [] } = {}) => {
  const installed = [];
  const events = [];
  return {
    installed,
    events,
    install: async (id) => {
      if (failInstall.includes(id)) throw new Error(`${id} download failed`);
      installed.push(id);
    },
    verify: async (id) => !failVerify.includes(id),
    emit: (e) => events.push(e),
  };
};

describe('component manifest', () => {
  it('marks only the backend, Calliope 0.6.8 and HiGHS as required', () => {
    expect(COMPONENTS.filter(c => c.required).map(c => c.id)).toEqual(REQUIRED);
  });

  it('lists every component after anything it requires', () => {
    const order = COMPONENTS.map(c => c.id);
    for (const c of COMPONENTS) {
      for (const dep of c.requires || []) expect(order.indexOf(dep)).toBeLessThan(order.indexOf(c.id));
    }
  });
});

describe('resolveSelection', () => {
  it('always includes required components, even when nothing is chosen', () => {
    expect([...resolveSelection([])]).toEqual(REQUIRED);
  });

  it('cannot deselect a required component', () => {
    expect([...resolveSelection(['pypsa'])]).toEqual(expect.arrayContaining(REQUIRED));
  });

  it('pulls in what a component requires', () => {
    expect(resolveSelection(['osemosys']).has('glpk')).toBe(true);
  });

  it('ignores unknown ids', () => {
    expect(resolveSelection(['../../evil']).has('../../evil')).toBe(false);
  });
});

describe('buildPlan', () => {
  it('leaves unselected optional components out entirely', () => {
    const plan = buildPlan(['osemosys']);
    expect(ids(plan)).toEqual(['backend', 'calliope', 'highs', 'glpk', 'osemosys']);
  });

  it('verifies what is already installed instead of reinstalling it', () => {
    const plan = buildPlan([], { calliope: { installed: true } });
    expect(plan.find(s => s.id === 'calliope').action).toBe('verify');
  });

  it('reinstalls a forced component, and anything bundled with it', () => {
    const plan = buildPlan([], { calliope: { installed: true }, highs: { installed: true } }, ['calliope']);
    expect(plan.find(s => s.id === 'calliope').action).toBe('install');
    expect(plan.find(s => s.id === 'highs').action).toBe('install');
  });

  it('marks a component unavailable when its prerequisite is missing', () => {
    const plan = buildPlan(['geo'], { geo: { unavailable: 'Docker is not running' } });
    expect(plan.find(s => s.id === 'geo')).toMatchObject({ action: 'unavailable', reason: 'Docker is not running' });
  });
});

describe('diskNeededGb', () => {
  it('counts only what will actually be installed', () => {
    const fresh = diskNeededGb(buildPlan(['pypsa']));
    const withCalliope = diskNeededGb(buildPlan(['pypsa'], { calliope: { installed: true } }));
    expect(fresh).toBeCloseTo(0.62 + 0.82);
    expect(withCalliope).toBeCloseTo(0.82);
  });

  it('does not count Docker images against the app disk', () => {
    expect(diskNeededGb([{ id: 'geo', action: 'install' }])).toBe(0);
  });
});

describe('explainInstallError', () => {
  it('tells the user to check the connection when pip cannot download', () => {
    const msg = explainInstallError('pip upgrade failed (exit 1)\nERROR: Could not find a version that satisfies the requirement wheel');
    expect(msg).toMatch(/^Could not download the packages/);
    expect(msg).toMatch(/requirement wheel/); // the detail is kept
  });

  it('recognises a full disk, and prefers that over the download hint', () => {
    expect(explainInstallError('OSError: [Errno 28] No space left on device, connection reset')).toMatch(/^The disk ran out of space/);
  });

  it('recognises locked files', () => {
    expect(explainInstallError('PermissionError: [WinError 5] Access is denied')).toMatch(/^A file is locked/);
  });

  it('leaves unknown errors alone', () => {
    expect(explainInstallError('something odd')).toBe('something odd');
  });
});

describe('runPlan', () => {
  it('installs and verifies each selected component', async () => {
    const steps = fakeSteps();
    const { ok, results } = await runPlan({ plan: buildPlan(['pypsa']), ...steps });
    expect(ok).toBe(true);
    expect(steps.installed).toEqual(['backend', 'calliope', 'pypsa']);
    expect(results.pypsa.state).toBe('installed');
  });

  it('does not run an installer for a component bundled inside another', async () => {
    const steps = fakeSteps();
    await runPlan({ plan: buildPlan([]), ...steps });
    expect(steps.installed).not.toContain('highs');
  });

  it('stops everything when a required component fails', async () => {
    const steps = fakeSteps({ failInstall: ['calliope'] });
    const { ok, results } = await runPlan({ plan: buildPlan(['pypsa', 'osm']), ...steps });
    expect(ok).toBe(false);
    expect(results.calliope).toMatchObject({ state: 'failed', error: 'calliope download failed' });
    expect(results.pypsa.state).toBe('not-run');
    expect(steps.installed).not.toContain('pypsa');
  });

  it('continues past a failed optional component', async () => {
    const steps = fakeSteps({ failInstall: ['pypsa'] });
    const { ok, results } = await runPlan({ plan: buildPlan(['pypsa', 'osm']), ...steps });
    expect(ok).toBe(true);
    expect(results.pypsa.state).toBe('failed');
    expect(results.osm.state).toBe('installed');
  });

  it('counts a failed verification as a failure, not a success', async () => {
    const steps = fakeSteps({ failVerify: ['pypsa'] });
    const { results } = await runPlan({ plan: buildPlan(['pypsa']), ...steps });
    expect(results.pypsa.state).toBe('failed');
    expect(results.pypsa.error).toMatch(/verification/);
  });

  it('skips a working component, which is what makes a retry resume', async () => {
    const steps = fakeSteps();
    const plan = buildPlan([], { backend: { installed: true }, calliope: { installed: true }, highs: { installed: true } });
    const { results } = await runPlan({ plan, ...steps });
    expect(results.calliope.state).toBe('skipped');
    expect(steps.installed).toEqual([]);
  });

  it('repairs an installed component that no longer works', async () => {
    const steps = fakeSteps();
    let checks = 0;
    steps.verify = async () => ++checks > 1;
    const plan = [{ id: 'pypsa', action: 'verify' }];
    const { results } = await runPlan({ plan, ...steps });
    expect(steps.installed).toEqual(['pypsa']);
    expect(results.pypsa.state).toBe('installed');
  });

  it('reports unavailable optional components without aborting', async () => {
    const steps = fakeSteps();
    const plan = buildPlan(['geo', 'osm'], { geo: { unavailable: 'Docker is not running' } });
    const { ok, results } = await runPlan({ plan, ...steps });
    expect(ok).toBe(true);
    expect(results.geo).toEqual({ state: 'unavailable', error: 'Docker is not running' });
    expect(results.osm.state).toBe('installed');
  });

  it('emits running then the final state, so the UI can follow along', async () => {
    const steps = fakeSteps();
    await runPlan({ plan: [{ id: 'pypsa', action: 'install' }], ...steps });
    expect(steps.events.map(e => e.state)).toEqual(['running', 'installed']);
  });
});

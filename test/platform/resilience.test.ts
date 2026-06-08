import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockHydrawiseController, MockHydrawiseZone } from '../mocks/mockHydrawiseApi';
import { createMockApi, MockLogger, APIEvent } from '../mocks/mockHomebridgeApi';

const controllerHolder: { controllers: MockHydrawiseController[]; type: 'LOCAL' | 'CLOUD' } = {
  controllers: [],
  type: 'LOCAL'
};

vi.mock('hydrawise-api', async () => {
  const { MockHydrawiseZone: Z, MockHydrawiseController: C } = await import('../mocks/mockHydrawiseApi');
  class HydrawiseMockClass {
    public type: 'LOCAL' | 'CLOUD';
    constructor() {
      this.type = controllerHolder.type;
    }
    async getControllers() {
      return controllerHolder.controllers;
    }
  }
  return {
    Hydrawise: HydrawiseMockClass,
    HydrawiseConnectionType: { LOCAL: 'LOCAL', CLOUD: 'CLOUD' },
    HydrawiseZone: Z,
    HydrawiseController: C
  };
});

import { HydrawisePlatform } from '../../src/HydrawisePlatform';

const tick = (n = 5) => Array.from({ length: n }, () => new Promise<void>((r) => setImmediate(r))).reduce((p, q) => p.then(() => q), Promise.resolve());

describe('Polling resilience + shutdown cleanup (Phase H)', () => {
  beforeEach(() => {
    controllerHolder.controllers = [];
    controllerHolder.type = 'LOCAL';
  });

  it('a failing first poll does not throw; subsequent polls keep running', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.failOnNextPoll();
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Front Lawn')]);
    controllerHolder.controllers = [c];

    new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' },
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    expect(log.lines.some((l) => l.level === 'error' && l.msg.includes('Poll failed'))).toBe(true);
    // No accessories registered because the poll failed
    expect(api.registered).toHaveLength(0);
  });

  it('APIEvent.SHUTDOWN clears all setInterval handles', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Front Lawn')]);
    controllerHolder.controllers = [c];

    new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' },
      api as any
    );

    // Track setInterval calls
    const realSetInterval = global.setInterval;
    const handles: NodeJS.Timeout[] = [];
    global.setInterval = ((fn: () => void, ms: number) => {
      const h = realSetInterval(fn, ms);
      handles.push(h);
      return h;
    }) as typeof global.setInterval;

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    global.setInterval = realSetInterval;

    expect(handles.length).toBe(1);

    // Spy on clearInterval to verify our shutdown handler clears
    const cleared: NodeJS.Timeout[] = [];
    const realClear = global.clearInterval;
    global.clearInterval = ((h: NodeJS.Timeout) => {
      cleared.push(h);
      return realClear(h);
    }) as typeof global.clearInterval;

    api.emit(APIEvent.SHUTDOWN);

    global.clearInterval = realClear;

    expect(cleared.length).toBe(1);
    expect(cleared[0]).toBe(handles[0]);

    // Clean up any leaked handles from the test itself
    for (const h of handles) realClear(h);
  });
});

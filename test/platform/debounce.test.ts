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

const tick = (n = 8) =>
  Array.from({ length: n }, () => new Promise<void>((r) => setImmediate(r))).reduce((p, q) => p.then(() => q), Promise.resolve());

describe('removal debounce', () => {
  beforeEach(() => {
    controllerHolder.controllers = [];
    controllerHolder.type = 'LOCAL';
  });

  it('keeps a zone that is missing for fewer than MAX_MISSED_POLLS polls', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden')]);
    c.pushZones([]);
    c.pushZones([]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick(); // poll 1
    await (platform as any).pollOnce(c); // poll 2 (miss 1)
    await (platform as any).pollOnce(c); // poll 3 (miss 2)

    expect(platform.accessories.map((a) => a.displayName)).toContain('Garden');
  });

  it('removes a zone after MAX_MISSED_POLLS consecutive misses', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden')]);
    c.pushZones([]);
    c.pushZones([]);
    c.pushZones([]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick(); // poll 1: present
    await (platform as any).pollOnce(c); // miss 1
    await (platform as any).pollOnce(c); // miss 2
    await (platform as any).pollOnce(c); // miss 3 -> removed

    expect(platform.accessories.map((a) => a.displayName)).not.toContain('Garden');
  });

  it('resets the miss counter when a zone reappears', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    const garden = new MockHydrawiseZone(1001, 1, 'Garden');
    c.pushZones([garden]); // poll 1 present
    c.pushZones([]); // miss 1
    c.pushZones([]); // miss 2
    c.pushZones([garden]); // present -> reset
    c.pushZones([]); // miss 1
    c.pushZones([]); // miss 2
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();
    for (let i = 0; i < 5; i++) await (platform as any).pollOnce(c);

    expect(platform.accessories.map((a) => a.displayName)).toContain('Garden');
  });
});

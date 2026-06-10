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

describe('DETECTED ZONES log', () => {
  beforeEach(() => {
    controllerHolder.controllers = [];
    controllerHolder.type = 'LOCAL';
  });

  it('logs a grouped block listing every detected relay (including excluded) once', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden'), new MockHydrawiseZone(1003, 3, 'Zone 3')]);
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden'), new MockHydrawiseZone(1003, 3, 'Zone 3')]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3] } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();
    await (platform as any).pollOnce(c); // second poll must NOT log the block again

    const infos = log.lines.filter((l) => l.level === 'info').map((l) => l.msg);
    expect(infos.filter((m) => m === 'DETECTED ZONES:')).toHaveLength(1);
    expect(infos).toContain('- [1] - Garden');
    expect(infos).toContain('- [3] - Zone 3');
  });
});

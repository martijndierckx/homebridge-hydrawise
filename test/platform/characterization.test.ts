import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockHydrawiseController, MockHydrawiseZone } from '../mocks/mockHydrawiseApi';
import { createMockApi, MockLogger, APIEvent, MockPlatformAccessory } from '../mocks/mockHomebridgeApi';

const controllerHolder: { controllers: MockHydrawiseController[]; type: 'LOCAL' | 'CLOUD' } = {
  controllers: [],
  type: 'LOCAL'
};

vi.mock('hydrawise-api', async () => {
  const { MockHydrawiseZone: ZoneClass, MockHydrawiseController: ControllerClass } = await import('../mocks/mockHydrawiseApi');
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
    HydrawiseZone: ZoneClass,
    HydrawiseController: ControllerClass
  };
});

import { HydrawisePlatform } from '../../src/HydrawisePlatform';

const tick = (n = 5) => Array.from({ length: n }, () => new Promise<void>((r) => setImmediate(r))).reduce((p, q) => p.then(() => q), Promise.resolve());

function bootPlatform(api: any, log: any, type: 'LOCAL' | 'CLOUD' = 'LOCAL') {
  controllerHolder.type = type;
  return new HydrawisePlatform(
    log,
    type === 'LOCAL'
      ? { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' }
      : { platform: 'HydrawisePlatform', name: 'H', type: 'CLOUD', api_key: 'k' },
    api
  );
}

describe('Plugin characterization — v1 behavior', () => {
  beforeEach(() => {
    controllerHolder.controllers = [];
  });

  it('corrupt cached accessory (no Valve service) is unregistered and recreated', async () => {
    const api = createMockApi();
    const log = new MockLogger();

    const uuid = api.hap.uuid.generate('1001');
    const corrupt = new MockPlatformAccessory('Front Lawn', uuid);
    // Intentionally do NOT add a Valve service — simulates v1.2.0 "corrupt accessory" case.

    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Front Lawn')]);
    controllerHolder.controllers = [c];

    const platform = bootPlatform(api, log);
    platform.configureAccessory(corrupt as any);

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    // Corrupt accessory is unregistered, a fresh one created in its place.
    expect(api.unregistered).toHaveLength(1);
    expect(api.unregistered[0]).toBe(corrupt);
    expect(api.registered).toHaveLength(1);
  });
});

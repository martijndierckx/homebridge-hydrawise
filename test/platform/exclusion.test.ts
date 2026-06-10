import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockHydrawiseController, MockHydrawiseZone } from '../mocks/mockHydrawiseApi';
import { createMockApi, MockLogger, APIEvent, MockPlatformAccessory } from '../mocks/mockHomebridgeApi';

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

function stampedV2(api: any, name: string, stableKey: string, controllerKey: string, zoneNumber: number) {
  const a = new MockPlatformAccessory(name, api.hap.uuid.generate(stableKey));
  a.addService(api.hap.Service.Valve, 'Sprinkler');
  a.context = { schemaVersion: 2, connectionType: 'LOCAL', controllerKey, zoneName: name, stableKey, zoneNumber };
  return a;
}

describe('exclude_relays', () => {
  beforeEach(() => {
    controllerHolder.controllers = [];
    controllerHolder.type = 'LOCAL';
  });

  it('never registers an excluded relay', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden'), new MockHydrawiseZone(1003, 3, 'Zone 3')]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3] } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    const names = platform.accessories.map((a) => a.displayName);
    expect(names).toContain('Garden');
    expect(names).not.toContain('Zone 3');
  });

  it('removes a cached accessory on reboot when its relay is now excluded', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const cached = stampedV2(api, 'Zone 3', 'local:h:3', 'h', 3);
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden'), new MockHydrawiseZone(1003, 3, 'Zone 3')]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3] } as any,
      api as any
    );
    platform.configureAccessory(cached as any);
    expect(platform.accessories.map((a) => a.displayName)).toContain('Zone 3');

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    expect(platform.accessories.map((a) => a.displayName)).not.toContain('Zone 3');
    expect(api.unregistered.some((a: any) => a.displayName === 'Zone 3')).toBe(true);
  });

  it('removes an active sprinkler whose relay becomes excluded across polls', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1003, 3, 'Zone 3')]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3] } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    expect(platform.accessories.map((a) => a.displayName)).not.toContain('Zone 3');
  });
});

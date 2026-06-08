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

const tick = (n = 8) => Array.from({ length: n }, () => new Promise<void>((r) => setImmediate(r))).reduce((p, q) => p.then(() => q), Promise.resolve());

function stampedV2(api: any, name: string, stableKey: string, controllerKey: string) {
  const a = new MockPlatformAccessory(name, api.hap.uuid.generate(stableKey));
  a.addService(api.hap.Service.Valve, 'Sprinkler');
  a.context = {
    schemaVersion: 2,
    connectionType: 'LOCAL',
    controllerKey,
    zoneName: name,
    stableKey,
    zoneNumber: 1
  };
  return a;
}

describe('Stale-cache sweep (Phase K)', () => {
  beforeEach(() => {
    controllerHolder.controllers = [];
    controllerHolder.type = 'LOCAL';
  });

  it('stage-1: removes v2-stamped accessory not matched by this controller after a successful poll', async () => {
    const api = createMockApi();
    const log = new MockLogger();

    const stale = stampedV2(api, 'Ghost Zone', 'local:h:99', 'h');
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Front Lawn')]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' },
      api as any
    );
    platform.configureAccessory(stale as any);

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    expect(api.unregistered).toContain(stale);
  });

  it('stage-1: controller returning zero zones SKIPS its own sweep (no false-positive wipe)', async () => {
    const api = createMockApi();
    const log = new MockLogger();

    const stale = stampedV2(api, 'Ghost', 'local:h:99', 'h');
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([]); // empty first poll
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' },
      api as any
    );
    platform.configureAccessory(stale as any);

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    expect(api.unregistered).not.toContain(stale);
  });

  it('stage-2: global v1 sweep waits for every expected controller to finish a first successful poll', async () => {
    // Two controllers; first one succeeds, second fails permanently. Stage-2 must NOT run.
    controllerHolder.type = 'CLOUD';
    const api = createMockApi();
    const log = new MockLogger();

    const legacyAccessory = new MockPlatformAccessory('Ancient v1', 'fake-v1-uuid-xxxxxxxxxxxxxxxxxxxxxxxxxx');
    legacyAccessory.addService(api.hap.Service.Valve, 'Sprinkler');
    // No context = legacy v1.

    const c1 = new MockHydrawiseController(5001, 'C1');
    c1.pushZones([new MockHydrawiseZone(2001, 1, 'Z1')]);
    const c2 = new MockHydrawiseController(5002, 'C2');
    c2.failOnNextPoll();
    c2.pushZones([new MockHydrawiseZone(3001, 1, 'Z2')]); // would succeed on retry, but failOnNextPoll fires first
    controllerHolder.controllers = [c1, c2];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'CLOUD', api_key: 'k' },
      api as any
    );
    platform.configureAccessory(legacyAccessory as any);

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    // c2 failed → stage-2 must NOT have run yet.
    expect(api.unregistered).not.toContain(legacyAccessory);
  });

  it('stage-2: runs once after every controller had a first successful poll with at least one returning ≥1 zone', async () => {
    controllerHolder.type = 'CLOUD';
    const api = createMockApi();
    const log = new MockLogger();

    const legacyAccessory = new MockPlatformAccessory('Ancient v1', 'fake-v1-uuid-yyyyyyyyyyyyyyyyyyyyyyyyyy');
    legacyAccessory.addService(api.hap.Service.Valve, 'Sprinkler');

    const c1 = new MockHydrawiseController(5001, 'C1');
    c1.pushZones([new MockHydrawiseZone(2001, 1, 'Z1')]);
    const c2 = new MockHydrawiseController(5002, 'C2');
    c2.pushZones([new MockHydrawiseZone(3001, 1, 'Z2')]);
    controllerHolder.controllers = [c1, c2];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'CLOUD', api_key: 'k', polling_interval: 200 },
      api as any
    );
    platform.configureAccessory(legacyAccessory as any);

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    // 200ms interval → stagger = 100ms. Wait long enough for the second controller's first poll.
    await new Promise<void>((r) => setTimeout(r, 250));
    platform['onShutdown']();

    expect(api.unregistered).toContain(legacyAccessory);
  });

  it('stage-2: does NOT run if every controller returned zero zones on first poll', async () => {
    controllerHolder.type = 'CLOUD';
    const api = createMockApi();
    const log = new MockLogger();

    const legacyAccessory = new MockPlatformAccessory('Ancient v1', 'fake-v1-uuid-zzzzzzzzzzzzzzzzzzzzzzzzzz');
    legacyAccessory.addService(api.hap.Service.Valve, 'Sprinkler');

    const c1 = new MockHydrawiseController(5001, 'C1');
    c1.pushZones([]);
    const c2 = new MockHydrawiseController(5002, 'C2');
    c2.pushZones([]);
    controllerHolder.controllers = [c1, c2];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'CLOUD', api_key: 'k', polling_interval: 200 },
      api as any
    );
    platform.configureAccessory(legacyAccessory as any);

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await new Promise<void>((r) => setTimeout(r, 250));
    platform['onShutdown']();

    expect(api.unregistered).not.toContain(legacyAccessory);
  });
});

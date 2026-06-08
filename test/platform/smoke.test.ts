import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MockHydrawise,
  MockHydrawiseController,
  MockHydrawiseZone
} from '../mocks/mockHydrawiseApi';
import { createMockApi, MockLogger, APIEvent, MockPlatformAccessory } from '../mocks/mockHomebridgeApi';

// Mock the hydrawise-api package so the plugin's `new Hydrawise(...)` returns our mock.
const controllerHolder: { controllers: MockHydrawiseController[]; type: 'LOCAL' | 'CLOUD' } = {
  controllers: [],
  type: 'LOCAL'
};
vi.mock('hydrawise-api', () => {
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
    HydrawiseZone: MockHydrawiseZone,
    HydrawiseController: MockHydrawiseController
  };
});

import { HydrawisePlatform } from '../../src/HydrawisePlatform';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('HydrawisePlatform smoke (characterization)', () => {
  beforeEach(() => {
    controllerHolder.controllers = [];
    controllerHolder.type = 'LOCAL';
  });

  it('creates accessories for zones on first poll when none cached', async () => {
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Front Lawn'), new MockHydrawiseZone(1002, 2, 'Back Lawn')]);
    controllerHolder.controllers = [c];

    const api = createMockApi();
    const log = new MockLogger();
    new HydrawisePlatform(log as any, { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' }, api as any);
    api.emit(APIEvent.DID_FINISH_LAUNCHING);

    // Let microtasks resolve (getControllers, then first getZones)
    await tick();
    await tick();
    await tick();

    expect(api.registered).toHaveLength(2);
    expect(api.registered.map((a) => a.displayName).sort()).toEqual(['Back Lawn', 'Front Lawn']);
  });

  it('reuses cached accessory when relayID-derived UUID matches', async () => {
    const api = createMockApi();
    const log = new MockLogger();

    // Pre-populate cache with an accessory whose UUID = uuid.generate("1001")
    const cachedUUID = api.hap.uuid.generate('1001');
    const cached = new MockPlatformAccessory('Front Lawn', cachedUUID);
    // Add Valve service so it's not "corrupt"
    cached.addService(api.hap.Service.Valve, 'Sprinkler');

    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Front Lawn')]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' },
      api as any
    );
    platform.configureAccessory(cached as any);

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();
    await tick();
    await tick();

    // Should NOT have registered a new accessory — reused cached
    expect(api.registered).toHaveLength(0);
  });

  it('BUG (v1): LOCAL relayID change across controller reboot causes accessory duplication', async () => {
    // Demonstrates the "General room" bug. After Phase J this test's assertion flips.
    const api = createMockApi();
    const log = new MockLogger();

    // Cached accessory from a previous boot when relayID was 1001
    const oldUUID = api.hap.uuid.generate('1001');
    const cached = new MockPlatformAccessory('Front Lawn', oldUUID);
    cached.addService(api.hap.Service.Valve, 'Sprinkler');

    // After controller reboot, relayID is now 5555 for the SAME physical zone (zone=1)
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(5555, 1, 'Front Lawn')]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' },
      api as any
    );
    platform.configureAccessory(cached as any);

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();
    await tick();
    await tick();

    // v1 behavior (the BUG): new accessory registered because UUID(5555) !== UUID(1001).
    // Old cached accessory remains in api.accessories with no matching zone.
    // After Phase J: assertion flips — registered should be empty because stable key matches.
    expect(api.registered).toHaveLength(1);
    expect(api.registered[0].UUID).not.toBe(oldUUID);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockHydrawiseController, MockHydrawiseZone } from '../mocks/mockHydrawiseApi';
import { createMockApi, MockLogger, APIEvent } from '../mocks/mockHomebridgeApi';

// Match the smoke-test mock: a no-arg Hydrawise that never throws on construction.
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

describe('HydrawisePlatform invalid-config startup', () => {
  beforeEach(() => {
    controllerHolder.controllers = [];
    controllerHolder.type = 'LOCAL';
  });

  // Mirrors the Homebridge plugin-verifier scenario:
  //   { "platform": "HydrawisePlatform" }
  // The plugin must NOT throw and must NOT crash-restart Homebridge.
  it('does not throw with only `platform` set (no type, no credentials)', async () => {
    const api = createMockApi();
    const log = new MockLogger();

    expect(() => {
      new HydrawisePlatform(log as any, { platform: 'HydrawisePlatform' } as any, api as any);
    }).not.toThrow();

    // Firing DID_FINISH_LAUNCHING must remain a no-op — no handler registered.
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();
    await tick();

    expect(api.registered).toHaveLength(0);
    expect(log.lines.some((l) => l.level === 'error' && l.msg.includes('Plugin disabled'))).toBe(true);
  });

  // Mirrors the second verifier scenario:
  //   { "platform": "HydrawisePlatform", "name": "Hydrawise", "type": "LOCAL" }
  // LOCAL is selected but host/password are missing.
  it('does not throw with type=LOCAL but no host/password', async () => {
    const api = createMockApi();
    const log = new MockLogger();

    expect(() => {
      new HydrawisePlatform(
        log as any,
        { platform: 'HydrawisePlatform', name: 'Hydrawise', type: 'LOCAL' } as any,
        api as any
      );
    }).not.toThrow();

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();
    await tick();

    expect(api.registered).toHaveLength(0);
    const errLine = log.lines.find((l) => l.level === 'error' && l.msg.includes('Plugin disabled'));
    expect(errLine).toBeDefined();
    expect(errLine!.msg).toContain('host');
    expect(errLine!.msg).toContain('password');
  });
});

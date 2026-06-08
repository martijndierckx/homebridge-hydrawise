import { vi } from 'vitest';

export class MockHydrawiseZone {
  public controller: MockHydrawiseController | undefined;
  public defaultRunDuration: number | undefined;
  public nextRunAt = new Date(0);
  public nextRunDuration = 0;
  public isSuspended = false;
  public run = vi.fn(async (_duration?: number) => ({ message: 'ok', messageType: 'info' as const }));
  public stop = vi.fn(async () => ({ message: 'ok', messageType: 'info' as const }));
  public suspend = vi.fn(async (_duration?: number) => ({ message: 'ok', messageType: 'info' as const }));

  constructor(
    public relayID: number,
    public zone: number,
    public name: string,
    public isRunning = false,
    public remainingRunningTime = 0
  ) {}
}

export class MockHydrawiseController {
  public name: string;
  private zonesByPoll: MockHydrawiseZone[][] = [];
  private pollIndex = 0;
  private failNext = false;

  constructor(
    public id: number | undefined,
    name: string,
    public host: string | undefined = undefined,
    public serialNumber: string | undefined = undefined
  ) {
    this.name = name;
  }

  /** Queue the zones to return on subsequent getZones() calls. */
  pushZones(zones: MockHydrawiseZone[]) {
    this.zonesByPoll.push(zones);
    for (const z of zones) z.controller = this;
  }

  /** Make the next getZones() throw. */
  failOnNextPoll() {
    this.failNext = true;
  }

  async getZones(): Promise<MockHydrawiseZone[]> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Simulated controller failure');
    }
    const idx = Math.min(this.pollIndex, this.zonesByPoll.length - 1);
    this.pollIndex++;
    return this.zonesByPoll[idx] ?? [];
  }
}

export class MockHydrawise {
  public type: 'LOCAL' | 'CLOUD';
  constructor(opts: { type: 'LOCAL' | 'CLOUD' }, public controllers: MockHydrawiseController[]) {
    this.type = opts.type;
  }

  async getControllers(): Promise<MockHydrawiseController[]> {
    return this.controllers;
  }
}

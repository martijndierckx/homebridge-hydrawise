import HapNodeJS from '@homebridge/hap-nodejs';

type EventHandler = (...args: unknown[]) => void;

interface MockAccessoryContext {
  [key: string]: unknown;
}

export interface CapturedRegister {
  pluginName: string;
  platformName: string;
  accessories: MockPlatformAccessory[];
}

export class MockPlatformAccessory {
  public readonly UUID: string;
  public displayName: string;
  public context: MockAccessoryContext = {};
  private services: MockService[] = [];
  private listeners = new Map<string, EventHandler[]>();

  constructor(displayName: string, uuid: string) {
    this.displayName = displayName;
    this.UUID = uuid;
  }

  addService(serviceCtor: unknown, displayName?: string): MockService {
    const svc = new MockService(serviceCtor, displayName);
    this.services.push(svc);
    return svc;
  }

  getService(serviceCtor: unknown): MockService | undefined {
    return this.services.find((s) => s.ctor === serviceCtor);
  }

  on(event: string, cb: EventHandler) {
    const arr = this.listeners.get(event) ?? [];
    arr.push(cb);
    this.listeners.set(event, arr);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    for (const cb of this.listeners.get(event) ?? []) cb(...args);
  }
}

export class MockCharacteristic {
  private value: unknown = undefined;
  private setListeners: ((value: unknown, callback?: (err?: Error | null) => void) => void)[] = [];

  constructor(public readonly ctor: unknown) {}

  updateValue(value: unknown) {
    this.value = value;
    return this;
  }

  getValue() {
    return this.value;
  }

  on(event: string, cb: (value: unknown, callback?: (err?: Error | null) => void) => void) {
    if (event === 'set') this.setListeners.push(cb);
    return this;
  }

  onSet(cb: (value: unknown) => unknown) {
    // Adapter so tests can drive either callback or Promise style uniformly.
    this.setListeners.push(async (value, callback) => {
      try {
        await cb(value);
        callback?.();
      } catch (err) {
        callback?.(err as Error);
      }
    });
    return this;
  }

  setCharacteristic(_ctor: unknown, _value: unknown) {
    return this;
  }

  async triggerSet(value: unknown): Promise<void> {
    for (const cb of this.setListeners) {
      await new Promise<void>((resolve, reject) => {
        const ret = cb(value, (err) => (err ? reject(err) : resolve()));
        if (ret instanceof Promise) ret.then(() => resolve(), reject);
      });
    }
  }
}

export class MockService {
  private characteristics = new Map<unknown, MockCharacteristic>();
  public readonly displayName: string | undefined;

  constructor(public readonly ctor: unknown, displayName?: string) {
    this.displayName = displayName;
  }

  getCharacteristic(ctor: unknown): MockCharacteristic {
    let ch = this.characteristics.get(ctor);
    if (!ch) {
      ch = new MockCharacteristic(ctor);
      this.characteristics.set(ctor, ch);
    }
    return ch;
  }

  setCharacteristic(_ctor: unknown, _value: unknown) {
    return this;
  }

  updateCharacteristic(ctor: unknown, value: unknown) {
    this.getCharacteristic(ctor).updateValue(value);
    return this;
  }
}

export class MockApi {
  public hap = {
    uuid: HapNodeJS.uuid,
    Service: HapNodeJS.Service,
    Characteristic: HapNodeJS.Characteristic,
    Units: HapNodeJS.Units,
    Formats: HapNodeJS.Formats,
    Perms: HapNodeJS.Perms,
    HAPStatus: HapNodeJS.HAPStatus,
    HapStatusError: HapNodeJS.HapStatusError
  };
  public platformAccessory = MockPlatformAccessory as unknown as new (n: string, uuid: string) => MockPlatformAccessory;
  public registered: MockPlatformAccessory[] = [];
  public unregistered: MockPlatformAccessory[] = [];
  public updated: MockPlatformAccessory[] = [];
  private eventListeners = new Map<string, EventHandler[]>();

  registerPlatformAccessories(_plugin: string, _platform: string, accessories: MockPlatformAccessory[]) {
    this.registered.push(...accessories);
  }
  unregisterPlatformAccessories(_plugin: string, _platform: string, accessories: MockPlatformAccessory[]) {
    this.unregistered.push(...accessories);
  }
  updatePlatformAccessories(accessories: MockPlatformAccessory[]) {
    this.updated.push(...accessories);
  }
  on(event: string, cb: EventHandler) {
    const arr = this.eventListeners.get(event) ?? [];
    arr.push(cb);
    this.eventListeners.set(event, arr);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    for (const cb of this.eventListeners.get(event) ?? []) cb(...args);
  }
}

export function createMockApi(): MockApi {
  return new MockApi();
}

export const APIEvent = {
  DID_FINISH_LAUNCHING: 'didFinishLaunching',
  SHUTDOWN: 'shutdown'
} as const;

export class MockLogger {
  public lines: { level: 'info' | 'warn' | 'error' | 'debug'; msg: string }[] = [];
  info(...args: unknown[]) {
    this.lines.push({ level: 'info', msg: args.join(' ') });
  }
  warn(...args: unknown[]) {
    this.lines.push({ level: 'warn', msg: args.join(' ') });
  }
  error(...args: unknown[]) {
    this.lines.push({ level: 'error', msg: args.join(' ') });
  }
  debug(...args: unknown[]) {
    this.lines.push({ level: 'debug', msg: args.join(' ') });
  }
  log(level: string, ...args: unknown[]) {
    this.lines.push({ level: level as 'info', msg: args.join(' ') });
  }
}

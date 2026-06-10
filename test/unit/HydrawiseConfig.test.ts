import { describe, it, expect } from 'vitest';
import { MockLogger } from '../mocks/mockHomebridgeApi';
import { parseConfig, validateConfig } from '../../src/HydrawiseConfig';
import { HydrawiseConnectionType } from 'hydrawise-api';

describe('parseConfig', () => {
  it('parses LOCAL config', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: '192.168.1.10', password: 'pw' } as any, log as any);
    expect(cfg.connectionType).toBe(HydrawiseConnectionType.LOCAL);
    expect(cfg.host).toBe('192.168.1.10');
    expect(cfg.password).toBe('pw');
  });

  it('parses CLOUD config', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'CLOUD', api_key: 'k' } as any, log as any);
    expect(cfg.connectionType).toBe(HydrawiseConnectionType.CLOUD);
    expect(cfg.apiKey).toBe('k');
  });

  it('honors running_time when a positive number', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p', running_time: 300 } as any, log as any);
    expect(cfg.overrideRunningTime).toBe(300);
  });

  it('warns and ignores invalid running_time', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p', running_time: 'forever' } as any, log as any);
    expect(cfg.overrideRunningTime).toBeUndefined();
    expect(log.lines.some((l) => l.level === 'warn' && l.msg.includes('running_time'))).toBe(true);
  });

  it('rejects polling_interval below 200ms with a warning', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p', polling_interval: 100 } as any, log as any);
    expect(cfg.pollingIntervalOverride).toBeUndefined();
    expect(log.lines.some((l) => l.level === 'warn' && l.msg.includes('polling_interval'))).toBe(true);
  });

  it('accepts polling_interval ≥ 200ms', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p', polling_interval: 500 } as any, log as any);
    expect(cfg.pollingIntervalOverride).toBe(500);
  });

  it('parses exclude_relays into a number array', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3, 11] } as any, log as any);
    expect(cfg.excludeRelays).toEqual([3, 11]);
  });

  it('defaults exclude_relays to an empty array when absent', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p' } as any, log as any);
    expect(cfg.excludeRelays).toEqual([]);
  });

  it('warns and drops invalid exclude_relays entries', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3, 'x', -1, 2.5] } as any, log as any);
    expect(cfg.excludeRelays).toEqual([3]);
    expect(log.lines.some((l) => l.level === 'warn' && l.msg.includes('exclude_relays'))).toBe(true);
  });

  it('warns and ignores exclude_relays when not an array', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: 'nope' } as any, log as any);
    expect(cfg.excludeRelays).toEqual([]);
    expect(log.lines.some((l) => l.level === 'warn' && l.msg.includes('exclude_relays'))).toBe(true);
  });
});

describe('validateConfig', () => {
  const log = new MockLogger();

  it('accepts a complete LOCAL config', () => {
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p' } as any, log as any);
    expect(validateConfig(cfg)).toBeNull();
  });

  it('accepts a complete CLOUD config', () => {
    const cfg = parseConfig({ platform: 'X', type: 'CLOUD', api_key: 'k' } as any, log as any);
    expect(validateConfig(cfg)).toBeNull();
  });

  it('rejects LOCAL config missing host and password', () => {
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL' } as any, log as any);
    const err = validateConfig(cfg);
    expect(err).not.toBeNull();
    expect(err).toContain('host');
    expect(err).toContain('password');
  });

  it('rejects LOCAL config missing only password', () => {
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h' } as any, log as any);
    const err = validateConfig(cfg);
    expect(err).not.toBeNull();
    expect(err).toContain('password');
    expect(err).not.toContain('host');
  });

  it('rejects CLOUD config (default when type unset) without api_key', () => {
    const cfg = parseConfig({ platform: 'X' } as any, log as any);
    const err = validateConfig(cfg);
    expect(err).not.toBeNull();
    expect(err).toContain('api_key');
  });
});

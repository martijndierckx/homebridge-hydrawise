import { describe, it, expect } from 'vitest';
import { MockLogger } from '../mocks/mockHomebridgeApi';
import { parseConfig } from '../../src/HydrawiseConfig';
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
});

import { describe, it, expect } from 'vitest';
import { computeControllerKey, computeStableKey, sanitizeHost } from '../../src/stableKey';
import { HydrawiseConnectionType } from 'hydrawise-api';

const fakeZone = (relayID: number, zone: number, name = 'Z') => ({ relayID, zone, name }) as any;
const fakeController = (opts: { id?: number; host?: string; serialNumber?: string }) =>
  ({ id: opts.id, host: opts.host, serialNumber: opts.serialNumber, name: 'C' }) as any;

describe('stableKey', () => {
  it('LOCAL: uses serialNumber when present', () => {
    const k = computeControllerKey(fakeController({ serialNumber: 'ABC123' }), HydrawiseConnectionType.LOCAL);
    expect(k).toBe('ABC123');
  });

  it('LOCAL: falls back to host when serialNumber missing', () => {
    const k = computeControllerKey(fakeController({ host: '192.168.1.10' }), HydrawiseConnectionType.LOCAL);
    expect(k).toBe('192.168.1.10');
  });

  it('LOCAL: throws when both serialNumber and host missing', () => {
    expect(() => computeControllerKey(fakeController({}), HydrawiseConnectionType.LOCAL)).toThrow();
  });

  it('CLOUD: uses controller.id', () => {
    const k = computeControllerKey(fakeController({ id: 5001 }), HydrawiseConnectionType.CLOUD);
    expect(k).toBe('5001');
  });

  it('LOCAL host normalization: case-insensitive, strips trailing slash, preserves port', () => {
    expect(sanitizeHost('HYDRAWISE.LOCAL/')).toBe('hydrawise.local');
    expect(sanitizeHost('hydrawise.local:8080/')).toBe('hydrawise.local:8080');
    expect(sanitizeHost('hydrawise.local:8080')).toBe('hydrawise.local:8080');
  });

  it('LOCAL stableKey uses zone.zone (stable), not relayID', () => {
    const c = fakeController({ host: 'h' });
    const k1 = computeStableKey(fakeZone(1001, 1), c, HydrawiseConnectionType.LOCAL);
    const k2 = computeStableKey(fakeZone(9999, 1), c, HydrawiseConnectionType.LOCAL);
    // SAME stableKey across relayID changes — the bug fix.
    expect(k1).toBe(k2);
    expect(k1).toBe('local:h:1');
  });

  it('CLOUD stableKey includes relayID (stable in cloud)', () => {
    const c = fakeController({ id: 5001 });
    const k = computeStableKey(fakeZone(2001, 1), c, HydrawiseConnectionType.CLOUD);
    expect(k).toBe('cloud:5001:2001');
  });

  it('LOCAL and CLOUD produce different stableKeys for same physical zone', () => {
    const lc = fakeController({ host: 'h', serialNumber: 'ABC' });
    const cc = fakeController({ id: 5001 });
    const lk = computeStableKey(fakeZone(1001, 1), lc, HydrawiseConnectionType.LOCAL);
    const ck = computeStableKey(fakeZone(1001, 1), cc, HydrawiseConnectionType.CLOUD);
    expect(lk).not.toBe(ck);
    expect(lk.startsWith('local:')).toBe(true);
    expect(ck.startsWith('cloud:')).toBe(true);
  });
});

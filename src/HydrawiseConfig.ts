import type { Logger, PlatformConfig } from 'homebridge';
import { HydrawiseConnectionType } from 'hydrawise-api';

export interface ParsedHydrawiseConfig {
  connectionType: HydrawiseConnectionType;
  host?: string;
  user?: string;
  password?: string;
  apiKey?: string;
  overrideRunningTime?: number;
  pollingIntervalOverride?: number;
}

/**
 * Returns a human-readable error string if the parsed config is missing the
 * fields required to actually talk to a Hydrawise controller, or null if OK.
 * Used to keep the plugin idle (rather than crash-looping Homebridge) when the
 * user hasn't filled in credentials yet.
 */
export function validateConfig(cfg: ParsedHydrawiseConfig): string | null {
  if (cfg.connectionType === HydrawiseConnectionType.LOCAL) {
    const missing: string[] = [];
    if (!cfg.host) missing.push('host');
    if (!cfg.password) missing.push('password');
    if (missing.length > 0) {
      return `LOCAL connection requires: ${missing.join(', ')}`;
    }
  } else if (!cfg.apiKey) {
    return 'CLOUD connection requires: api_key';
  }
  return null;
}

/**
 * Parses raw Homebridge platform config into a typed, validated shape.
 * Invalid values are logged and ignored rather than thrown — preserves v1's lenient behavior.
 */
export function parseConfig(raw: PlatformConfig, log: Logger): ParsedHydrawiseConfig {
  const connectionType = raw['type'] === 'LOCAL' ? HydrawiseConnectionType.LOCAL : HydrawiseConnectionType.CLOUD;

  const parsed: ParsedHydrawiseConfig = {
    connectionType,
    host: typeof raw['host'] === 'string' ? raw['host'] : undefined,
    user: typeof raw['user'] === 'string' ? raw['user'] : undefined,
    password: typeof raw['password'] === 'string' ? raw['password'] : undefined,
    apiKey: typeof raw['api_key'] === 'string' ? raw['api_key'] : undefined
  };

  if (raw['running_time'] !== undefined) {
    if (typeof raw['running_time'] === 'number' && raw['running_time'] > 0) {
      parsed.overrideRunningTime = raw['running_time'];
    } else {
      log.warn(`[CONFIG] Ignoring invalid running_time: ${String(raw['running_time'])}`);
    }
  }

  if (raw['polling_interval'] !== undefined) {
    if (typeof raw['polling_interval'] === 'number' && raw['polling_interval'] >= 200) {
      parsed.pollingIntervalOverride = raw['polling_interval'];
    } else {
      log.warn(`[CONFIG] Ignoring invalid polling_interval (must be a number ≥ 200ms): ${String(raw['polling_interval'])}`);
    }
  }

  return parsed;
}

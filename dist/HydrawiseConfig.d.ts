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
    excludeRelays: number[];
}
/**
 * Returns a human-readable error string if the parsed config is missing the
 * fields required to actually talk to a Hydrawise controller, or null if OK.
 * Used to keep the plugin idle (rather than crash-looping Homebridge) when the
 * user hasn't filled in credentials yet.
 */
export declare function validateConfig(cfg: ParsedHydrawiseConfig): string | null;
/**
 * Parses raw Homebridge platform config into a typed, validated shape.
 * Invalid values are logged and ignored rather than thrown — preserves v1's lenient behavior.
 */
export declare function parseConfig(raw: PlatformConfig, log: Logger): ParsedHydrawiseConfig;
//# sourceMappingURL=HydrawiseConfig.d.ts.map
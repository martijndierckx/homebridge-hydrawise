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
 * Parses raw Homebridge platform config into a typed, validated shape.
 * Invalid values are logged and ignored rather than thrown — preserves v1's lenient behavior.
 */
export declare function parseConfig(raw: PlatformConfig, log: Logger): ParsedHydrawiseConfig;
//# sourceMappingURL=HydrawiseConfig.d.ts.map
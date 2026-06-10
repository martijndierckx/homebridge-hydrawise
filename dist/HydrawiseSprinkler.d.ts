import type { PlatformAccessory } from 'homebridge';
import type { HydrawiseConnectionType, HydrawiseZone } from 'hydrawise-api';
import type { HydrawisePlatform } from './HydrawisePlatform';
import type { HydrawiseAccessoryContext } from './types';
export interface HydrawiseSprinklerOptions {
    stableKey: string;
    controllerKey: string;
    connectionType: HydrawiseConnectionType;
    /** A cached accessory matched via the three-step lookup. v1 legacy accessories keep their original UUID. */
    cachedAccessory?: PlatformAccessory<Partial<HydrawiseAccessoryContext>>;
}
/** Wraps a single Hydrawise zone as a HomeKit Valve accessory. */
export declare class HydrawiseSprinkler {
    private accessory;
    private service;
    readonly uuid: string;
    readonly stableKey: string;
    readonly controllerKey: string;
    readonly connectionType: HydrawiseConnectionType;
    zone: HydrawiseZone;
    /** Consecutive polls this sprinkler's zone has been absent from its controller. Reset to 0 when seen. */
    missedPolls: number;
    platform: HydrawisePlatform;
    constructor(zone: HydrawiseZone, platform: HydrawisePlatform, opts: HydrawiseSprinklerOptions);
    private stampContext;
    update(zone: HydrawiseZone): void;
    unregister(): void;
    private unregisterAccessory;
    /** HomeKit caps RemainingDuration at 3600 seconds. */
    limitMaxRemainingRunningTime(remainingRunningTime: number): number;
}
//# sourceMappingURL=HydrawiseSprinkler.d.ts.map
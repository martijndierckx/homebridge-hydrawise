import type { HydrawiseZone } from 'hydrawise-api';
import type { HydrawisePlatform } from './HydrawisePlatform';
/** Wraps a single Hydrawise zone as a HomeKit Valve accessory. */
export declare class HydrawiseSprinkler {
    private accessory;
    private service;
    private uuid;
    zone: HydrawiseZone;
    platform: HydrawisePlatform;
    constructor(zone: HydrawiseZone, platform: HydrawisePlatform);
    update(zone: HydrawiseZone): void;
    unregister(): void;
    private unregisterAccessory;
    /** HomeKit caps RemainingDuration at 3600 seconds. */
    limitMaxRemainingRunningTime(remainingRunningTime: number): number;
}
//# sourceMappingURL=HydrawiseSprinkler.d.ts.map
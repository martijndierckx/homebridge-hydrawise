/**
 * @author Martijn Dierckx
 */
import { HydrawiseZone } from 'hydrawise-api';
import { HydrawisePlatform } from './HydrawisePlatform';
/** Class representing a Hydrawise zone */
export declare class HydrawiseSprinkler {
    private accessory;
    private service;
    private uuid;
    zone: HydrawiseZone;
    platform: HydrawisePlatform;
    /**
     * Create a new instance of a HydrawiseSprinkler
     * @param {HydrawiseZone} zone - The HydrawiseZone lined to the Homebridge/HAP accessory
     */
    constructor(zone: HydrawiseZone, platform: HydrawisePlatform);
    update(zone: HydrawiseZone): void;
    unregister(): void;
    private unregisterAccessory;
    limitMaxRemainingRunningTime(remainingRunningTime: number): number;
}
//# sourceMappingURL=HydrawiseSprinkler.d.ts.map
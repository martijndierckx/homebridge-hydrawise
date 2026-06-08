/**
 * @author Martijn Dierckx
 * @todo Phase J: stable-key UUID + v1 migration; Phase K: two-stage stale-cache sweep
 */
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
export declare class HydrawisePlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly api: API;
    private readonly hydrawise;
    private pollingInterval;
    readonly overrideRunningTime: number | undefined;
    accessories: PlatformAccessory[];
    private sprinklers;
    private intervals;
    constructor(log: Logger, config: PlatformConfig, api: API);
    private onLaunch;
    private onShutdown;
    private pollOnce;
    /** Reconcile a single controller's zone list with our sprinkler wrappers. */
    private reconcile;
    /** Invoked by Homebridge to restore cached accessories from disk at startup. */
    configureAccessory(accessory: PlatformAccessory): void;
}
//# sourceMappingURL=HydrawisePlatform.d.ts.map
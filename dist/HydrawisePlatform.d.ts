/**
 * @author Martijn Dierckx
 * @todo Phase J: stable-key UUID + v1 migration; Phase K: two-stage stale-cache sweep
 */
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
export declare class HydrawisePlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly api: API;
    private readonly cfg;
    private readonly hydrawise;
    private pollingInterval;
    readonly overrideRunningTime: number | undefined;
    accessories: PlatformAccessory[];
    private sprinklers;
    private intervals;
    private startTimeouts;
    constructor(log: Logger, config: PlatformConfig, api: API);
    private onLaunch;
    private startPollingFor;
    private onShutdown;
    private pollOnce;
    private reconcile;
    configureAccessory(accessory: PlatformAccessory): void;
}
//# sourceMappingURL=HydrawisePlatform.d.ts.map
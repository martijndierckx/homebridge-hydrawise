/**
 * @author Martijn Dierckx
 * @todo Check after first getZones from all controllers wether there are any stale 'accessories' registered from cache which aren't linked to a zone
 */
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { HydrawiseController } from 'hydrawise-api';
export declare class HydrawisePlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly api: API;
    private hydrawise;
    private pollingInterval;
    readonly overrideRunningTime: number | undefined;
    accessories: PlatformAccessory[];
    private sprinklers;
    constructor(log: Logger, config: PlatformConfig, api: API);
    getZones(controller: HydrawiseController): void;
    configureAccessory(accessory: PlatformAccessory): void;
}
//# sourceMappingURL=HydrawisePlatform.d.ts.map
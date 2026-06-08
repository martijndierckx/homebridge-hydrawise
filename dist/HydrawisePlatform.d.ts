/**
 * @author Martijn Dierckx
 * @todo Phase K: two-stage stale-cache sweep
 */
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import type { HydrawiseAccessoryContext } from './types';
type CachedAccessory = PlatformAccessory<Partial<HydrawiseAccessoryContext>>;
export declare class HydrawisePlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly api: API;
    private readonly cfg;
    private readonly hydrawise;
    private pollingInterval;
    readonly overrideRunningTime: number | undefined;
    accessories: CachedAccessory[];
    private sprinklers;
    private intervals;
    private startTimeouts;
    constructor(log: Logger, config: PlatformConfig, api: API);
    private onLaunch;
    private startPollingFor;
    private onShutdown;
    private pollOnce;
    /** Reconcile a controller's current zone list with our sprinkler wrappers (stable-key matching). */
    private reconcile;
    /**
     * Three-step cache match:
     *   1. PRIMARY  — cached accessory whose context.stableKey === this zone's stableKey.
     *   2. SECONDARY (CLOUD-only) — v1 legacy UUID matches AND displayName matches.
     *   3. TERTIARY (LOCAL-only) — displayName matches AND (controllerKey matches OR schemaVersion missing).
     * Returns undefined if no candidate qualifies. Refuses tertiary on duplicate display names.
     */
    private findCachedAccessory;
    configureAccessory(accessory: PlatformAccessory): void;
}
export {};
//# sourceMappingURL=HydrawisePlatform.d.ts.map
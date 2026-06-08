/**
 * @author Martijn Dierckx
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
    private expectedControllerKeys;
    private firstPollOK;
    private firstPollZoneCount;
    private matchedUUIDsByController;
    private controllerSwept;
    private globalSwept;
    constructor(log: Logger, config: PlatformConfig, api: API);
    private onLaunch;
    private startPollingFor;
    private onShutdown;
    private pollOnce;
    /**
     * Stage 1 sweep — runs once per controller after its first successful poll AND only if that poll
     * returned ≥1 zone. Removes v2-stamped accessories belonging to this controller that weren't matched.
     */
    private maybeSweepController;
    /**
     * Stage 2 sweep — runs once globally, after every expected controller has had a first
     * successful poll AND at least one of them returned ≥1 zone. Removes v1 (un-stamped) accessories
     * that weren't adopted by any controller.
     */
    private maybeSweepGlobalV1;
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
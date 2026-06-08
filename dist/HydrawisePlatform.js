"use strict";
/**
 * @author Martijn Dierckx
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HydrawisePlatform = void 0;
const settings_1 = require("./settings");
const hydrawise_api_1 = require("hydrawise-api");
const HydrawiseSprinkler_1 = require("./HydrawiseSprinkler");
const HydrawiseConfig_1 = require("./HydrawiseConfig");
const stableKey_1 = require("./stableKey");
class HydrawisePlatform {
    log;
    api;
    cfg;
    hydrawise;
    pollingInterval = 0;
    overrideRunningTime;
    accessories = [];
    sprinklers = [];
    intervals = [];
    startTimeouts = [];
    // Stale-cache sweep state (Phase K)
    expectedControllerKeys = new Set();
    firstPollOK = new Set();
    firstPollZoneCount = new Map();
    matchedUUIDsByController = new Map();
    controllerSwept = new Set();
    globalSwept = false;
    constructor(log, config, api) {
        this.log = log;
        this.api = api;
        this.cfg = (0, HydrawiseConfig_1.parseConfig)(config, log);
        this.overrideRunningTime = this.cfg.overrideRunningTime;
        this.hydrawise = new hydrawise_api_1.Hydrawise({
            type: this.cfg.connectionType,
            host: this.cfg.host,
            user: this.cfg.user,
            password: this.cfg.password,
            key: this.cfg.apiKey
        });
        api.on("didFinishLaunching" /* APIEvent.DID_FINISH_LAUNCHING */, () => {
            void this.onLaunch();
        });
        api.on("shutdown" /* APIEvent.SHUTDOWN */, () => this.onShutdown());
    }
    async onLaunch() {
        try {
            const controllers = await this.hydrawise.getControllers();
            if (controllers.length === 0) {
                this.log.error('Did not receive any controllers');
                return;
            }
            if (this.overrideRunningTime !== undefined) {
                this.log.debug(`[CONFIG] Overriding the run time for each zone when running: ${this.overrideRunningTime} seconds`);
            }
            if (this.cfg.pollingIntervalOverride !== undefined) {
                this.pollingInterval = this.cfg.pollingIntervalOverride;
            }
            else if (this.hydrawise.type == hydrawise_api_1.HydrawiseConnectionType.LOCAL) {
                this.pollingInterval = settings_1.DEFAULT_POLLING_INTERVAL_LOCAL;
            }
            else {
                this.pollingInterval = settings_1.DEFAULT_POLLING_INTERVAL_CLOUD * controllers.length;
            }
            this.log.debug(`[CONFIG] Polling interval: ${this.pollingInterval} milliseconds`);
            // Stamp expected controllers up front so the sweep knows the full set even before any poll completes.
            this.expectedControllerKeys = new Set(controllers.map((c) => (0, stableKey_1.computeControllerKey)(c, this.hydrawise.type)));
            const stagger = Math.floor(this.pollingInterval / controllers.length);
            controllers.forEach((controller, index) => {
                this.log.debug(`Retrieved a Hydrawise controller: ${controller.name}`);
                const startAfter = index * stagger;
                if (startAfter === 0) {
                    this.startPollingFor(controller);
                }
                else {
                    const t = setTimeout(() => this.startPollingFor(controller), startAfter);
                    this.startTimeouts.push(t);
                }
            });
        }
        catch (err) {
            this.log.error(`Initial controller fetch failed: ${err.message}`);
        }
    }
    startPollingFor(controller) {
        void this.pollOnce(controller);
        const handle = setInterval(() => {
            void this.pollOnce(controller);
        }, this.pollingInterval);
        this.intervals.push(handle);
    }
    onShutdown() {
        for (const t of this.startTimeouts)
            clearTimeout(t);
        for (const h of this.intervals)
            clearInterval(h);
        this.startTimeouts = [];
        this.intervals = [];
    }
    async pollOnce(controller) {
        try {
            const zones = await controller.getZones();
            const controllerKey = (0, stableKey_1.computeControllerKey)(controller, this.hydrawise.type);
            const isFirstSuccessfulPoll = !this.firstPollOK.has(controllerKey);
            this.reconcile(controller, controllerKey, zones);
            if (isFirstSuccessfulPoll) {
                this.firstPollOK.add(controllerKey);
                this.firstPollZoneCount.set(controllerKey, zones.length);
                this.maybeSweepController(controllerKey);
                this.maybeSweepGlobalV1();
            }
        }
        catch (err) {
            this.log.error(`Poll failed for ${controller.name}: ${err.message}`);
        }
    }
    /**
     * Stage 1 sweep — runs once per controller after its first successful poll AND only if that poll
     * returned ≥1 zone. Removes v2-stamped accessories belonging to this controller that weren't matched.
     */
    maybeSweepController(controllerKey) {
        if (this.controllerSwept.has(controllerKey))
            return;
        if ((this.firstPollZoneCount.get(controllerKey) ?? 0) === 0)
            return;
        const matched = this.matchedUUIDsByController.get(controllerKey) ?? new Set();
        const toSweep = this.accessories.filter((a) => a.context?.schemaVersion === settings_1.ACCESSORY_CONTEXT_SCHEMA_VERSION &&
            a.context?.controllerKey === controllerKey &&
            !matched.has(a.UUID));
        for (const a of toSweep) {
            this.log.info(`Stale accessory swept (controller ${controllerKey}): ${a.displayName}`);
            this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [a]);
            this.accessories = this.accessories.filter((x) => x !== a);
            this.sprinklers = this.sprinklers.filter((s) => s.uuid !== a.UUID);
        }
        this.controllerSwept.add(controllerKey);
    }
    /**
     * Stage 2 sweep — runs once globally, after every expected controller has had a first
     * successful poll AND at least one of them returned ≥1 zone. Removes v1 (un-stamped) accessories
     * that weren't adopted by any controller.
     */
    maybeSweepGlobalV1() {
        if (this.globalSwept)
            return;
        for (const ck of this.expectedControllerKeys) {
            if (!this.firstPollOK.has(ck))
                return;
        }
        let anyHasZones = false;
        for (const n of this.firstPollZoneCount.values()) {
            if (n > 0) {
                anyHasZones = true;
                break;
            }
        }
        if (!anyHasZones)
            return;
        const matchedAcrossAll = new Set();
        for (const set of this.matchedUUIDsByController.values()) {
            for (const uuid of set)
                matchedAcrossAll.add(uuid);
        }
        const toSweep = this.accessories.filter((a) => a.context?.schemaVersion !== settings_1.ACCESSORY_CONTEXT_SCHEMA_VERSION && !matchedAcrossAll.has(a.UUID));
        for (const a of toSweep) {
            this.log.info(`Stale v1 accessory swept: ${a.displayName}`);
            this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [a]);
            this.accessories = this.accessories.filter((x) => x !== a);
            this.sprinklers = this.sprinklers.filter((s) => s.uuid !== a.UUID);
        }
        this.globalSwept = true;
    }
    /** Reconcile a controller's current zone list with our sprinkler wrappers (stable-key matching). */
    reconcile(controller, controllerKey, zones) {
        let toCheckSprinklers = this.sprinklers.filter((s) => s.controllerKey === controllerKey);
        const matchedThisPoll = new Set();
        for (const zone of zones) {
            const stableKey = (0, stableKey_1.computeStableKey)(zone, controller, this.hydrawise.type);
            const existingSprinkler = this.sprinklers.find((s) => s.stableKey === stableKey);
            if (existingSprinkler !== undefined) {
                this.log.debug(`Received zone data for existing sprinkler: ${zone.name}`);
                existingSprinkler.update(zone);
                toCheckSprinklers = toCheckSprinklers.filter((s) => s !== existingSprinkler);
                matchedThisPoll.add(existingSprinkler.uuid);
                continue;
            }
            // Three-step match against cached (but not yet wrapped) accessories.
            const cached = this.findCachedAccessory(zone, controller, controllerKey, stableKey);
            this.log.debug(cached ? `Adopting cached accessory for ${zone.name} (${cached.UUID})` : `Creating fresh accessory for ${zone.name}`);
            const newSprinkler = new HydrawiseSprinkler_1.HydrawiseSprinkler(zone, this, {
                stableKey,
                controllerKey,
                connectionType: this.hydrawise.type,
                cachedAccessory: cached
            });
            this.sprinklers.push(newSprinkler);
            matchedThisPoll.add(newSprinkler.uuid);
        }
        this.matchedUUIDsByController.set(controllerKey, matchedThisPoll);
        // Per-poll removal of zones that disappeared mid-life on THIS controller.
        for (const sprinkler of toCheckSprinklers) {
            this.log.info(`Removing Sprinkler for deleted Hydrawise zone: ${sprinkler.zone.name}`);
            sprinkler.unregister();
            this.sprinklers = this.sprinklers.filter((s) => s !== sprinkler);
        }
    }
    /**
     * Three-step cache match:
     *   1. PRIMARY  — cached accessory whose context.stableKey === this zone's stableKey.
     *   2. SECONDARY (CLOUD-only) — v1 legacy UUID matches AND displayName matches.
     *   3. TERTIARY (LOCAL-only) — displayName matches AND (controllerKey matches OR schemaVersion missing).
     * Returns undefined if no candidate qualifies. Refuses tertiary on duplicate display names.
     */
    findCachedAccessory(zone, _controller, controllerKey, stableKey) {
        const unwrapped = this.accessories.filter((a) => !this.sprinklers.some((s) => s.uuid === a.UUID));
        // 1. PRIMARY
        const primary = unwrapped.find((a) => a.context?.stableKey === stableKey);
        if (primary)
            return primary;
        // 2. SECONDARY (CLOUD) — legacy v1 hashed relayID with a name guard.
        if (this.hydrawise.type === hydrawise_api_1.HydrawiseConnectionType.CLOUD) {
            const legacyUUID = (0, stableKey_1.computeLegacyUUID)(zone, this.api);
            const secondary = unwrapped.find((a) => a.UUID === legacyUUID && a.displayName === zone.name && a.context?.schemaVersion !== settings_1.ACCESSORY_CONTEXT_SCHEMA_VERSION);
            if (secondary)
                return secondary;
        }
        // 3. TERTIARY (LOCAL) — name + controllerKey-or-legacy.
        if (this.hydrawise.type === hydrawise_api_1.HydrawiseConnectionType.LOCAL) {
            const nameMatches = unwrapped.filter((a) => a.displayName === zone.name);
            // Refuse on duplicate names (ambiguous).
            const eligible = nameMatches.filter((a) => a.context?.schemaVersion !== settings_1.ACCESSORY_CONTEXT_SCHEMA_VERSION ||
                a.context?.controllerKey === controllerKey);
            if (eligible.length > 1) {
                this.log.warn(`Migration ambiguity: ${eligible.length} cached LOCAL accessories share name '${zone.name}' — skipping name-based fallback for this zone`);
                return undefined;
            }
            if (eligible.length === 1)
                return eligible[0];
        }
        return undefined;
    }
    configureAccessory(accessory) {
        this.log.info(`Configuring Sprinkler from cache: ${accessory.displayName}`);
        this.accessories.push(accessory);
    }
}
exports.HydrawisePlatform = HydrawisePlatform;
//# sourceMappingURL=HydrawisePlatform.js.map
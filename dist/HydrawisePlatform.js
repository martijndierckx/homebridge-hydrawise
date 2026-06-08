"use strict";
/**
 * @author Martijn Dierckx
 * @todo Phase J: stable-key UUID + v1 migration; Phase K: two-stage stale-cache sweep
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HydrawisePlatform = void 0;
const settings_1 = require("./settings");
const hydrawise_api_1 = require("hydrawise-api");
const HydrawiseSprinkler_1 = require("./HydrawiseSprinkler");
const HydrawiseConfig_1 = require("./HydrawiseConfig");
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
                // Spread CLOUD polls across the period so multi-controller accounts don't burst.
                this.pollingInterval = settings_1.DEFAULT_POLLING_INTERVAL_CLOUD * controllers.length;
            }
            this.log.debug(`[CONFIG] Polling interval: ${this.pollingInterval} milliseconds`);
            // Stagger first polls so steady-state remains spread across the interval
            // (controller 0 starts at t=0, controller N at t = N * interval/count).
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
            this.reconcile(controller, zones);
        }
        catch (err) {
            this.log.error(`Poll failed for ${controller.name}: ${err.message}`);
        }
    }
    reconcile(controller, zones) {
        let toCheckSprinklers = this.sprinklers.filter((item) => item.zone.controller?.id == controller.id);
        for (const zone of zones) {
            const existingSprinkler = this.sprinklers.find((x) => x.zone.relayID == zone.relayID);
            if (existingSprinkler !== undefined) {
                this.log.debug(`Received zone data for existing sprinkler: ${zone.name}`);
                existingSprinkler.update(zone);
                toCheckSprinklers = toCheckSprinklers.filter((item) => item.zone.relayID !== zone.relayID);
            }
            else {
                this.log.debug(`Received zone data for new/cached sprinkler: ${zone.name}`);
                const newSprinkler = new HydrawiseSprinkler_1.HydrawiseSprinkler(zone, this);
                this.sprinklers.push(newSprinkler);
            }
        }
        for (const sprinkler of toCheckSprinklers) {
            this.log.info(`Removing Sprinkler for deleted Hydrawise zone: ${sprinkler.zone.name}`);
            sprinkler.unregister();
            this.sprinklers = this.sprinklers.filter((item) => item !== sprinkler);
        }
    }
    configureAccessory(accessory) {
        this.log.info(`Configuring Sprinkler from cache: ${accessory.displayName}`);
        this.accessories.push(accessory);
    }
}
exports.HydrawisePlatform = HydrawisePlatform;
//# sourceMappingURL=HydrawisePlatform.js.map
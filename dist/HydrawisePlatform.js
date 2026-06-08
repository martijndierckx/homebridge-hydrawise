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
class HydrawisePlatform {
    log;
    api;
    hydrawise;
    pollingInterval = 0;
    overrideRunningTime = undefined;
    accessories = [];
    sprinklers = [];
    intervals = [];
    constructor(log, config, api) {
        this.log = log;
        this.api = api;
        this.hydrawise = new hydrawise_api_1.Hydrawise({
            type: config.type == 'LOCAL' ? hydrawise_api_1.HydrawiseConnectionType.LOCAL : hydrawise_api_1.HydrawiseConnectionType.CLOUD,
            host: config.host,
            user: config.user,
            password: config.password,
            key: config.api_key
        });
        if (config.running_time !== undefined && typeof config.running_time == 'number') {
            this.overrideRunningTime = config.running_time;
        }
        api.on("didFinishLaunching" /* APIEvent.DID_FINISH_LAUNCHING */, () => {
            void this.onLaunch(config);
        });
        api.on("shutdown" /* APIEvent.SHUTDOWN */, () => this.onShutdown());
    }
    async onLaunch(config) {
        try {
            const controllers = await this.hydrawise.getControllers();
            if (controllers.length === 0) {
                this.log.error('Did not receive any controllers');
                return;
            }
            if (this.overrideRunningTime !== undefined) {
                this.log.debug(`[CONFIG] Overriding the run time for each zone when running: ${this.overrideRunningTime} seconds`);
            }
            if (config.polling_interval !== undefined && typeof config.polling_interval == 'number') {
                this.pollingInterval = config.polling_interval;
            }
            else if (this.hydrawise.type == hydrawise_api_1.HydrawiseConnectionType.LOCAL) {
                this.pollingInterval = settings_1.DEFAULT_POLLING_INTERVAL_LOCAL;
            }
            else {
                // Spread CLOUD polls across the period so multi-controller accounts don't burst.
                this.pollingInterval = settings_1.DEFAULT_POLLING_INTERVAL_CLOUD * controllers.length;
            }
            this.log.debug(`[CONFIG] Polling interval: ${this.pollingInterval} milliseconds`);
            for (const controller of controllers) {
                this.log.debug(`Retrieved a Hydrawise controller: ${controller.name}`);
                await this.pollOnce(controller);
                const handle = setInterval(() => {
                    void this.pollOnce(controller);
                }, this.pollingInterval);
                this.intervals.push(handle);
            }
        }
        catch (err) {
            this.log.error(`Initial controller fetch failed: ${err.message}`);
        }
    }
    onShutdown() {
        for (const handle of this.intervals)
            clearInterval(handle);
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
    /** Reconcile a single controller's zone list with our sprinkler wrappers. */
    reconcile(controller, zones) {
        // Track which of this controller's sprinklers haven't been seen this poll.
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
        // Zones that disappeared mid-life — drop their sprinklers.
        for (const sprinkler of toCheckSprinklers) {
            this.log.info(`Removing Sprinkler for deleted Hydrawise zone: ${sprinkler.zone.name}`);
            sprinkler.unregister();
            this.sprinklers = this.sprinklers.filter((item) => item !== sprinkler);
        }
    }
    /** Invoked by Homebridge to restore cached accessories from disk at startup. */
    configureAccessory(accessory) {
        this.log.info(`Configuring Sprinkler from cache: ${accessory.displayName}`);
        this.accessories.push(accessory);
    }
}
exports.HydrawisePlatform = HydrawisePlatform;
//# sourceMappingURL=HydrawisePlatform.js.map
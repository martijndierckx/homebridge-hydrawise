"use strict";
/**
 * @author Martijn Dierckx
 * @todo Check after first getZones from all controllers wether there are any stale 'accessories' registered from cache which aren't linked to a zone
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HydrawisePlatform = void 0;
const settings_1 = require("./settings");
const hydrawise_api_1 = require("hydrawise-api");
const HydrawiseSprinkler_1 = require("./HydrawiseSprinkler");
const timers_1 = require("timers");
class HydrawisePlatform {
    constructor(log, config, api) {
        this.pollingInterval = 0;
        this.overrideRunningTime = undefined;
        this.accessories = [];
        this.sprinklers = [];
        this.log = log;
        this.api = api;
        // Setup Hydrawise connection
        this.hydrawise = new hydrawise_api_1.Hydrawise({
            type: config.type == 'LOCAL' ? hydrawise_api_1.HydrawiseConnectionType.LOCAL : hydrawise_api_1.HydrawiseConnectionType.CLOUD,
            host: config.host,
            user: config.user,
            password: config.password,
            key: config.api_key
        });
        // Set run time override
        if (config.running_time !== undefined && typeof config.running_time == 'number') {
            this.overrideRunningTime = config.running_time;
        }
        // On: Finished loading Homebridge Plugin
        let that = this;
        api.on("didFinishLaunching" /* APIEvent.DID_FINISH_LAUNCHING */, () => {
            // One time retrieval of the controllers (reboot Homebridge manually if a new controller is added/removed)
            that.hydrawise
                .getControllers()
                .then((controllers) => {
                // Only continue if at least 1 controller was detected
                if (controllers.length > 0) {
                    // Log run time override
                    if (config.running_time !== undefined && typeof config.running_time == 'number') {
                        this.log.debug(`[CONFIG] Overriding the run time for each zone when running: ${that.overrideRunningTime} seconds`);
                    }
                    // Set polling interval
                    if (config.polling_interval !== undefined && typeof config.polling_interval == 'number') {
                        that.pollingInterval = config.polling_interval;
                    }
                    else {
                        if (this.hydrawise.type == hydrawise_api_1.HydrawiseConnectionType.LOCAL) {
                            that.pollingInterval = settings_1.DEFAULT_POLLING_INTERVAL_LOCAL;
                        }
                        else {
                            // The default polling interval is a good default for a single controller setup. If there are more we'll have to spread the calls.
                            that.pollingInterval = settings_1.DEFAULT_POLLING_INTERVAL_CLOUD * controllers.length;
                        }
                    }
                    this.log.debug(`[CONFIG] Polling interval: ${that.pollingInterval} miliseconds`);
                    // For each Controller
                    controllers.map((controller) => {
                        that.log.debug(`Retrieved a Hydrawise controller: ${controller.name}`);
                        // Initiate the first poll
                        that.getZones(controller);
                        // Continious updates of the zones
                        (0, timers_1.setInterval)(() => {
                            that.getZones(controller);
                        }, that.pollingInterval);
                    });
                }
                else {
                    that.log.error(`Did not receive any controllers`);
                }
            })
                .catch((error) => that.log.error(error));
        });
    }
    getZones(controller) {
        let that = this;
        // List current sprinklers to be matched with Hydrawise zones
        let toCheckSprinklers = [...this.sprinklers];
        // Only math sprinklers from the current controller
        toCheckSprinklers = toCheckSprinklers.filter((item) => item.zone.controller.id == controller.id);
        // Get zones from Hydrawise
        controller
            .getZones()
            .then((zones) => {
            // Go over each configured zone in Hydrawise
            zones.map((zone) => {
                // Find an existing sprinkler matching the zone
                let existingSprinkler = that.sprinklers.find((x) => x.zone.relayID == zone.relayID);
                // Sprinkler already exists
                if (existingSprinkler !== undefined) {
                    // Log
                    that.log.debug(`Received zone data for existing sprinkler: ${zone.name}`);
                    // Update zone values & push to homebridge
                    existingSprinkler.update(zone);
                    // Remove from to-check list
                    toCheckSprinklers = toCheckSprinklers.filter((item) => item.zone.relayID !== zone.relayID);
                }
                // Sprinker does not exist yet
                else {
                    // Log
                    that.log.debug(`Received zone data for new/cached sprinkler: ${zone.name}`);
                    // Create new sprinkler
                    let newSprinkler = new HydrawiseSprinkler_1.HydrawiseSprinkler(zone, that);
                    that.sprinklers.push(newSprinkler);
                }
            });
            // See if any zones have been removed from Hydrawise
            toCheckSprinklers.map((sprinkler) => {
                // Log
                that.log.info(`Removing Sprinkler for deleted Hydrawise zone: ${sprinkler.zone.name}`);
                // Remove sprinkler
                sprinkler.unregister();
                that.sprinklers = that.sprinklers.filter((item) => item !== sprinkler);
            });
        })
            .catch((error) => that.log.error(error));
    }
    /*
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     */
    configureAccessory(accessory) {
        this.log.info(`Configuring Sprinkler from cache: ${accessory.displayName}`);
        this.accessories.push(accessory);
    }
}
exports.HydrawisePlatform = HydrawisePlatform;
//# sourceMappingURL=HydrawisePlatform.js.map
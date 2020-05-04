"use strict";
/**
 * @author Martijn Dierckx
 */
Object.defineProperty(exports, "__esModule", { value: true });
const settings_1 = require("./settings");
const hydrawise_api_1 = require("hydrawise-api");
const HydrawiseSprinkler_1 = require("./HydrawiseSprinkler");
const timers_1 = require("timers");
class HydrawisePlatform {
    constructor(log, config, api) {
        this.accessories = [];
        this.sprinklers = [];
        this.log = log;
        this.api = api;
        // Setup Hydrawise connection
        this.hydrawise = new hydrawise_api_1.Hydrawise({
            type: (config.type == 'LOCAL' ? hydrawise_api_1.HydrawiseConnectionType.LOCAL : hydrawise_api_1.HydrawiseConnectionType.CLOUD),
            host: config.host,
            user: config.user,
            password: config.password,
            key: config.api_key
        });
        // Set polling interval
        if (config.polling_interval !== undefined && typeof config.polling_interval == 'number') {
            this.pollingInterval = config.polling_interval;
        }
        else {
            if (this.hydrawise.type == hydrawise_api_1.HydrawiseConnectionType.LOCAL) {
                this.pollingInterval = settings_1.DEFAULT_POLLING_INTERVAL_LOCAL;
            }
            else {
                this.pollingInterval = settings_1.DEFAULT_POLLING_INTERVAL_CLOUD;
            }
        }
        // On: Finished loading Homebridge Plugin
        let that = this;
        api.on("didFinishLaunching" /* DID_FINISH_LAUNCHING */, () => {
            // Continious updates of the zones
            timers_1.setInterval(() => {
                that.getZones(that);
            }, that.pollingInterval);
        });
    }
    getZones(that) {
        // List current sprinklers to be matched with Hydrawise zones
        let toCheckSprinklers = [...this.sprinklers];
        // Get zones from Hydrawise
        that.hydrawise.getZones().then((zones) => {
            // Go over each configured zone in Hydrawise
            zones.map((zone) => {
                // Find an existing sprinkler matching the zone
                let existingSprinkler = that.sprinklers.find(x => x.zone.relayID == zone.relayID);
                // Sprinkler already exists
                if (existingSprinkler !== undefined) {
                    // Log
                    that.log.debug('Received zone for existing sprinkler: ' + zone.name);
                    // Update zone values & push to homebridge
                    existingSprinkler.update(zone);
                    // Remove from to-check list
                    toCheckSprinklers = toCheckSprinklers.filter((item) => item.zone.relayID !== zone.relayID);
                }
                // Sprinker does not exist yet
                else {
                    // Log
                    that.log.debug('Received zone for new/cached sprinkler: ' + zone.name);
                    // Create new sprinkler
                    let newSprinkler = new HydrawiseSprinkler_1.HydrawiseSprinkler(zone, that);
                    that.sprinklers.push(newSprinkler);
                }
            });
            // See if any zones have been removed from Hydrawise
            toCheckSprinklers.map(sprinkler => {
                // Log
                that.log.info("Removing Sprinkler for deleted Hydrawise zone: %s", sprinkler.zone.name);
                // Remove sprinkler
                sprinkler.unregister();
                that.sprinklers = that.sprinklers.filter((item) => item !== sprinkler);
            });
        })
            .catch(error => that.log.error(error));
    }
    /*
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     */
    configureAccessory(accessory) {
        this.log.info("Configuring Sprinkler from cache: %s", accessory.displayName);
        this.accessories.push(accessory);
    }
}
exports.HydrawisePlatform = HydrawisePlatform;
//# sourceMappingURL=HydrawisePlatform.js.map
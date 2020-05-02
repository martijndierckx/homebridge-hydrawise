"use strict";
const hydrawise_api_1 = require("hydrawise-api");
const PLUGIN_NAME = "homebridge-hydrawise";
const PLATFORM_NAME = "HydrawisePlatform";
let hap;
let Accessory;
class HydrawisePlatform {
    constructor(log, config, api) {
        this.accessories = [];
        this.log = log;
        this.api = api;
        this.didFinishLoading = false;
        this.hydrawise = new hydrawise_api_1.Hydrawise({
            type: (config.type == 'LOCAL' ? hydrawise_api_1.HydrawiseConnectionType.LOCAL : hydrawise_api_1.HydrawiseConnectionType.CLOUD),
            host: config.host,
            user: config.user,
            password: config.password
        });
        api.on("didFinishLaunching" /* DID_FINISH_LAUNCHING */, () => {
            this.didFinishLoading = true;
        });
    }
    getZones() {
        let that = this;
        this.hydrawise.getZones().then((zones) => {
            that.log('got new zones list');
            // Go over each received zone
            zones.map((zone) => {
            });
        })
            .catch(error => that.log(error));
    }
    /*
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory) {
        this.log("Configuring accessory %s", accessory.displayName);
        accessory.on("identify" /* IDENTIFY */, () => {
            this.log("%s identified!", accessory.displayName);
        });
        accessory.getService(hap.Service.Lightbulb).getCharacteristic(hap.Characteristic.On)
            .on("set" /* SET */, (value, callback) => {
            this.log.info("%s Light was set to: " + value);
            callback();
        });
        this.accessories.push(accessory);
    }
    // --------------------------- CUSTOM METHODS ---------------------------
    addAccessory(name) {
        this.log.info("Adding new accessory with name %s", name);
        // uuid must be generated from a unique but not changing data source, name should not be used in the most cases. But works in this specific example.
        const uuid = hap.uuid.generate(name);
        const accessory = new Accessory(name, uuid);
        accessory.addService(hap.Service.Lightbulb, "Test Light");
        this.configureAccessory(accessory); // abusing the configureAccessory here
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
    removeAccessories() {
        // we don't have any special identifiers, we just remove all our accessories
        this.log.info("Removing all accessories");
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.accessories);
        this.accessories.splice(0, this.accessories.length); // clear out the array
    }
}
module.exports = (api) => {
    hap = api.hap;
    Accessory = api.platformAccessory;
    api.registerPlatform(PLATFORM_NAME, HydrawisePlatform);
};
//# sourceMappingURL=dynamic-platform.js.map
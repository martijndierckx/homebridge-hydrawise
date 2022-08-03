"use strict";
/**
 * @author Martijn Dierckx
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HydrawiseSprinkler = void 0;
const settings_1 = require("./settings");
/** Class representing a Hydrawise zone */
class HydrawiseSprinkler {
    /**
     * Create a new instance of a HydrawiseSprinkler
     * @param {HydrawiseZone} zone - The HydrawiseZone lined to the Homebridge/HAP accessory
     */
    constructor(zone, platform) {
        // Config
        this.zone = zone;
        this.platform = platform;
        // UUID
        this.uuid = platform.api.hap.uuid.generate(zone.relayID.toString());
        // Function to create accessory
        const createAccessory = () => {
            this.platform.log.info(`Configuring new sprinkler: ${this.zone.name}`);
            // Create new homebridge accessory
            this.accessory = new this.platform.api.platformAccessory(this.zone.name, this.uuid);
            // Register sprinkler with homebridge
            this.platform.accessories.push(this.accessory);
            this.platform.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [this.accessory]);
            // Configure accessory as Sprinkler Valve
            this.service = this.accessory.addService(this.platform.api.hap.Service.Valve, 'Sprinkler');
            this.service.setCharacteristic(this.platform.api.hap.Characteristic.ValveType, '1');
        };
        // Already excisting accessory from cache?
        let existingAccessory = this.platform.accessories.find((accessory) => accessory.UUID === this.uuid);
        if (existingAccessory !== undefined) {
            // Get Valve service for existing accessory
            const s = existingAccessory.getService(this.platform.api.hap.Service.Valve);
            if (s !== undefined) {
                // Link already existing accessory to this sprinkler
                this.accessory = existingAccessory;
                this.service = s;
            }
            else {
                this.platform.log.warn(`Somehow the accessory exists for '${this.zone.name}', but no matching service is found in Homebridge. So removing the accessory, and re-adding it.`);
                this.unregisterAccessory(existingAccessory);
                // Create new
                createAccessory();
            }
        }
        else {
            createAccessory();
        }
        // Set initial states
        this.service.getCharacteristic(this.platform.api.hap.Characteristic.Active).updateValue(this.zone.isRunning);
        this.service.getCharacteristic(this.platform.api.hap.Characteristic.InUse).updateValue(this.zone.isRunning);
        this.service
            .getCharacteristic(this.platform.api.hap.Characteristic.RemainingDuration)
            .updateValue(this.limitMaxRemainingRunningTime(this.zone.remainingRunningTime));
        // On: Identified
        this.accessory.on("identify" /* PlatformAccessoryEvent.IDENTIFY */, () => {
            this.platform.log.info(`${this.accessory.displayName} identified!`);
        });
        // On: Active state change
        this.service
            .getCharacteristic(this.platform.api.hap.Characteristic.Active)
            .on("set" /* CharacteristicEventTypes.SET */, (value, callback) => {
            // Run zone
            if (value == 1) {
                this.zone
                    .run(this.platform.overrideRunningTime)
                    .then((data) => {
                    this.platform.log.info(`'${this.zone.name}' sprinkler turned on`);
                    callback();
                })
                    .catch((error) => {
                    this.platform.log.error(error);
                    callback();
                });
            }
            // Stop running zone
            else {
                this.zone
                    .stop()
                    .then((data) => {
                    this.platform.log.info(`'${this.zone.name}' sprinkler turned off`);
                    callback();
                })
                    .catch((error) => {
                    this.platform.log.error(error);
                    callback();
                });
            }
        });
        // On: Set duration (Since there is no way to push the default run time to Hydrawise, this remains unimplemented)
        /*service.getCharacteristic(that.platform.api.hap.Characteristic.SetDuration)
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                that.platform.log.info('Set Duration for '+ zone.name + ' to ' + value);
                callback();
            });*/
    }
    update(zone) {
        // Update "active" state
        if (this.zone.isRunning != zone.isRunning) {
            // Log
            this.platform.log.info(`Received new running status for '${zone.name}': ${zone.isRunning ? 'on' : 'off'}`);
            // Update values in homekit
            this.service.getCharacteristic(this.platform.api.hap.Characteristic.Active).updateValue(zone.isRunning ? 1 : 0);
            this.service.getCharacteristic(this.platform.api.hap.Characteristic.InUse).updateValue(zone.isRunning ? 1 : 0);
            this.zone.isRunning = zone.isRunning;
        }
        // Update "remaining duration"
        if (this.zone.remainingRunningTime != zone.remainingRunningTime) {
            // Log
            this.platform.log.info(`Received new remaining duration for '${zone.name}': ${zone.remainingRunningTime} seconds`);
            // Update values in homekit
            this.service
                .getCharacteristic(this.platform.api.hap.Characteristic.RemainingDuration)
                .updateValue(this.limitMaxRemainingRunningTime(zone.remainingRunningTime));
            this.zone.remainingRunningTime = zone.remainingRunningTime;
        }
    }
    unregister() {
        // Log
        this.platform.log.info(`Unregistering sprinkler accessory for deleted Hydrawise zone: ${this.zone.name}`);
        // Remove
        this.unregisterAccessory(this.accessory);
    }
    unregisterAccessory(accessory) {
        this.platform.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
        this.platform.accessories = this.platform.accessories.filter((item) => item !== accessory);
    }
    limitMaxRemainingRunningTime(remainingRunningTime) {
        // Homekit limits the time to 3600 seconds
        return remainingRunningTime === undefined || remainingRunningTime <= 3600 ? remainingRunningTime : 3600;
    }
}
exports.HydrawiseSprinkler = HydrawiseSprinkler;
//# sourceMappingURL=HydrawiseSprinkler.js.map
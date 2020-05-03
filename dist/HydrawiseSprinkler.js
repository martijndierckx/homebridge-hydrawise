"use strict";
/**
 * @author Martijn Dierckx
 */
Object.defineProperty(exports, "__esModule", { value: true });
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
        let that = this;
        // UUID
        const uuid = platform.api.hap.uuid.generate(zone.relayID.toString());
        // Already excisting accessory from cache?
        let existingAccessory = that.platform.accessories.find(accessory => accessory.UUID === uuid);
        let service;
        if (existingAccessory !== undefined) {
            // Link already existing accessory to this sprinkler
            this.accessory = existingAccessory;
            // Get Valve service
            service = this.accessory.getService(this.platform.api.hap.Service.Valve);
        }
        else {
            that.platform.log.info("Configuring new sprinkler: %s", zone.name);
            // Create new homebridge accessory
            this.accessory = new platform.api.platformAccessory(zone.name, uuid);
            // Register sprinkler with homebridge
            that.platform.accessories.push(that.accessory);
            that.platform.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [that.accessory]);
            // Configure accessory as Sprinkler Valve
            service = that.accessory.addService(that.platform.api.hap.Service.Valve, 'Sprinkler');
            service.setCharacteristic(that.platform.api.hap.Characteristic.ValveType, '1');
        }
        // Set initial states
        service.getCharacteristic(that.platform.api.hap.Characteristic.Active).updateValue(that.zone.isRunning);
        service.getCharacteristic(that.platform.api.hap.Characteristic.InUse).updateValue(that.zone.isRunning);
        service.getCharacteristic(that.platform.api.hap.Characteristic.RemainingDuration).updateValue(that.zone.remainingRunningTime);
        // On: Identified
        that.accessory.on("identify" /* IDENTIFY */, () => {
            that.platform.log.info("%s identified!", that.accessory.displayName);
        });
        // On: Active state change
        service.getCharacteristic(that.platform.api.hap.Characteristic.Active)
            .on("set" /* SET */, (value, callback) => {
            // Run zone
            if (value == 1) {
                that.zone.run().then((data) => {
                    that.platform.log.info(that.zone.name + ' sprinkler turned on');
                    callback();
                }).catch(error => {
                    that.platform.log.error(error);
                    callback();
                });
            }
            // Stop running zone
            else {
                that.zone.stop().then((data) => {
                    that.platform.log.info(that.zone.name + ' sprinkler turned off');
                    callback();
                }).catch(error => {
                    that.platform.log.error(error);
                    callback();
                });
            }
        });
    }
    update(zone) {
        let service = this.accessory.getService(this.platform.api.hap.Service.Valve);
        // Update "active" state
        if (this.zone.isRunning != zone.isRunning) {
            // Log
            this.platform.log.info('Received new running status for ' + zone.name + ': ' + (zone.isRunning ? 'on' : 'off'));
            // Update values in homekit
            service.getCharacteristic(this.platform.api.hap.Characteristic.Active).updateValue(zone.isRunning ? 1 : 0);
            service.getCharacteristic(this.platform.api.hap.Characteristic.InUse).updateValue(zone.isRunning ? 1 : 0);
            this.zone.isRunning = zone.isRunning;
        }
        // Update "remaining duration"
        if (this.zone.remainingRunningTime != zone.remainingRunningTime) {
            // Log
            this.platform.log.info('Received new remaining duration for ' + zone.name + ': ' + zone.remainingRunningTime);
            // Update values in homekit
            service.getCharacteristic(this.platform.api.hap.Characteristic.RemainingDuration).updateValue(zone.remainingRunningTime);
            this.zone.remainingRunningTime = zone.remainingRunningTime;
        }
    }
}
exports.HydrawiseSprinkler = HydrawiseSprinkler;
//# sourceMappingURL=HydrawiseSprinkler.js.map
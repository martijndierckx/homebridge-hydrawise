/**
 * @author Martijn Dierckx
 */

import { APIEvent, PlatformAccessoryEvent, CharacteristicEventTypes, CharacteristicValue, CharacteristicSetCallback, Service } from 'homebridge';
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, DEFAULT_POLLING_INTERVAL_CLOUD, DEFAULT_POLLING_INTERVAL_LOCAL } from './settings';
import { Hydrawise, HydrawiseConnectionType, HydrawiseZone } from 'hydrawise-api';
import { HydrawisePlatform } from './HydrawisePlatform';
import { setInterval } from "timers";
import { access } from 'fs';
import { getJSDocThisTag } from 'typescript';

/** Class representing a Hydrawise zone */
export class HydrawiseSprinkler {

    private accessory: PlatformAccessory;
    public zone: HydrawiseZone;
    public platform: HydrawisePlatform;

	/**
	 * Create a new instance of a HydrawiseSprinkler
     * @param {HydrawiseZone} zone - The HydrawiseZone lined to the Homebridge/HAP accessory
	 */
	constructor(zone: HydrawiseZone, platform: HydrawisePlatform) {
        // Config
        this.zone = zone;
        this.platform = platform;
        let that = this;

        // UUID
        const uuid = platform.api.hap.uuid.generate(zone.relayID.toString());

        // Already excisting accessory from cache?
        let existingAccessory = that.platform.accessories.find(accessory => accessory.UUID === uuid);
        let service: Service;
        if (existingAccessory !== undefined) {
            
            // Link already existing accessory to this sprinkler
            this.accessory = existingAccessory;

            // Get Valve service
            service = this.accessory.getService(this.platform.api.hap.Service.Valve)!;
        }
        else {

            that.platform.log.info("Configuring new sprinkler: %s", zone.name);
            
            // Create new homebridge accessory
            this.accessory = new platform.api.platformAccessory(zone.name, uuid);
            
            // Register sprinkler with homebridge
            that.platform.accessories.push(that.accessory);
            that.platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [that.accessory]);

            // Configure accessory as Sprinkler Valve
            service = that.accessory.addService(that.platform.api.hap.Service.Valve, 'Sprinkler');
            service.setCharacteristic(that.platform.api.hap.Characteristic.ValveType, '1'); 
        }

        // Set initial states
        service.getCharacteristic(that.platform.api.hap.Characteristic.Active).updateValue(that.zone.isRunning);
        service.getCharacteristic(that.platform.api.hap.Characteristic.InUse).updateValue(that.zone.isRunning);
        service.getCharacteristic(that.platform.api.hap.Characteristic.RemainingDuration).updateValue(that.zone.remainingRunningTime);

        // On: Identified
        that.accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
            that.platform.log.info("%s identified!", that.accessory.displayName);
        });

        // On: Active state change
        service.getCharacteristic(that.platform.api.hap.Characteristic.Active)
        .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {

            // Run zone
            if(value == 1) {
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

        // On: Set duration (Since there is no way to push the default run time to Hydrawise, this remains unimplemented)
        /*service.getCharacteristic(that.platform.api.hap.Characteristic.SetDuration)
        .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
            that.platform.log.info('Set Duration for '+ zone.name + ' to ' + value);
            callback();
        });*/
    }

    update(zone: HydrawiseZone): void {
        let service = this.accessory.getService(this.platform.api.hap.Service.Valve)!;

        // Update "active" state
        if(this.zone.isRunning != zone.isRunning) {

            // Log
            this.platform.log.info('Received new running status for ' + zone.name + ': ' + (zone.isRunning ? 'on' : 'off'));

            // Update values in homekit
            service.getCharacteristic(this.platform.api.hap.Characteristic.Active).updateValue(zone.isRunning ? 1 : 0);
		    service.getCharacteristic(this.platform.api.hap.Characteristic.InUse).updateValue(zone.isRunning ? 1 : 0);
            this.zone.isRunning = zone.isRunning;
        }

        // Update "remaining duration"
        if(this.zone.remainingRunningTime != zone.remainingRunningTime) {
            
            // Log
            this.platform.log.info('Received new remaining duration for ' + zone.name + ': ' + zone.remainingRunningTime);

            // Update values in homekit
            service.getCharacteristic(this.platform.api.hap.Characteristic.RemainingDuration).updateValue(zone.remainingRunningTime);
            this.zone.remainingRunningTime = zone.remainingRunningTime;
        }
    }

    unregister(): void {
        let that = this;
        
        // Log
        that.platform.log.info("Unregistering sprinkler accessory for deleted Hydrawise zone: %s", that.zone.name);

        // Remove
        that.platform.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [that.accessory]);
        that.platform.accessories = that.platform.accessories.filter((item: PlatformAccessory) => item !== that.accessory);
    }
}
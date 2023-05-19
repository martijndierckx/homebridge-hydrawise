/**
 * @author Martijn Dierckx
 */

import { PlatformAccessoryEvent, CharacteristicEventTypes, CharacteristicValue, CharacteristicSetCallback, Service } from 'homebridge';
import type { PlatformAccessory } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { HydrawiseZone } from 'hydrawise-api';
import { HydrawisePlatform } from './HydrawisePlatform';

/** Class representing a Hydrawise zone */
export class HydrawiseSprinkler {
  private accessory!: PlatformAccessory;
  private service!: Service;
  private uuid: string;
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

    // UUID
    this.uuid = platform.api.hap.uuid.generate(zone.relayID.toString());

    // Function to create accessory
    const createAccessory = () => {
      this.platform.log.info(`Configuring new sprinkler: ${this.zone.name}`);

      // Create new homebridge accessory
      this.accessory = new this.platform.api.platformAccessory(this.zone.name, this.uuid);

      // Register sprinkler with homebridge
      this.platform.accessories.push(this.accessory);
      this.platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);

      // Configure accessory as Sprinkler Valve
      this.service = this.accessory.addService(this.platform.api.hap.Service.Valve, 'Sprinkler');
      this.service.setCharacteristic(this.platform.api.hap.Characteristic.ValveType, '1');
    };

    // Already excisting accessory from cache?
    const existingAccessory = this.platform.accessories.find((accessory) => accessory.UUID === this.uuid);
    if (existingAccessory !== undefined) {
      // Get Valve service for existing accessory
      const s = existingAccessory.getService(this.platform.api.hap.Service.Valve);
      if (s !== undefined) {
        // Link already existing accessory to this sprinkler
        this.accessory = existingAccessory;
        this.service = s;
      } else {
        this.platform.log.warn(
          `Somehow the accessory exists for '${this.zone.name}', but no matching service is found in Homebridge. So removing the accessory, and re-adding it.`
        );
        this.unregisterAccessory(existingAccessory);

        // Create new
        createAccessory();
      }
    } else {
      createAccessory();
    }

    // Set initial states
    this.service.getCharacteristic(this.platform.api.hap.Characteristic.Active).updateValue(this.zone.isRunning);
    this.service.getCharacteristic(this.platform.api.hap.Characteristic.InUse).updateValue(this.zone.isRunning);
    this.service
      .getCharacteristic(this.platform.api.hap.Characteristic.RemainingDuration)
      .updateValue(this.limitMaxRemainingRunningTime(this.zone.remainingRunningTime));

    // On: Identified
    this.accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.platform.log.info(`${this.accessory.displayName} identified!`);
    });

    // On: Active state change
    this.service
      .getCharacteristic(this.platform.api.hap.Characteristic.Active)
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        // Run zone
        if (value == 1) {
          this.zone
            .run(this.platform.overrideRunningTime)
            .then(() => {
              this.platform.log.info(`'${this.zone.name}' sprinkler turned on`);
              callback();
            })
            .catch((error: any) => {
              this.platform.log.error(error);
              callback();
            });
        }
        // Stop running zone
        else {
          this.zone
            .stop()
            .then(() => {
              this.platform.log.info(`'${this.zone.name}' sprinkler turned off`);
              callback();
            })
            .catch((error: any) => {
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

  public update(zone: HydrawiseZone): void {
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

  public unregister(): void {
    // Log
    this.platform.log.info(`Unregistering sprinkler accessory for deleted Hydrawise zone: ${this.zone.name}`);

    // Remove
    this.unregisterAccessory(this.accessory);
  }

  private unregisterAccessory(accessory: PlatformAccessory): void {
    this.platform.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.platform.accessories = this.platform.accessories.filter((item: PlatformAccessory) => item !== accessory);
  }

  public limitMaxRemainingRunningTime(remainingRunningTime: number): number {
    // Homekit limits the time to 3600 seconds
    return remainingRunningTime === undefined || remainingRunningTime <= 3600 ? remainingRunningTime : 3600;
  }
}

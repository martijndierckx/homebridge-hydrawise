import { PlatformAccessoryEvent } from 'homebridge';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import type { HydrawiseZone } from 'hydrawise-api';
import type { HydrawisePlatform } from './HydrawisePlatform';

/** Wraps a single Hydrawise zone as a HomeKit Valve accessory. */
export class HydrawiseSprinkler {
  private accessory!: PlatformAccessory;
  private service!: Service;
  private uuid: string;
  public zone: HydrawiseZone;
  public platform: HydrawisePlatform;

  constructor(zone: HydrawiseZone, platform: HydrawisePlatform) {
    this.zone = zone;
    this.platform = platform;
    this.uuid = platform.api.hap.uuid.generate(zone.relayID.toString());

    const createAccessory = () => {
      this.platform.log.info(`Configuring new sprinkler: ${this.zone.name}`);
      this.accessory = new this.platform.api.platformAccessory(this.zone.name, this.uuid);
      this.platform.accessories.push(this.accessory);
      this.platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);
      this.service = this.accessory.addService(this.platform.api.hap.Service.Valve, 'Sprinkler');
      this.service.setCharacteristic(this.platform.api.hap.Characteristic.ValveType, '1');
    };

    const existingAccessory = this.platform.accessories.find((a) => a.UUID === this.uuid);
    if (existingAccessory !== undefined) {
      const s = existingAccessory.getService(this.platform.api.hap.Service.Valve);
      if (s !== undefined) {
        this.accessory = existingAccessory;
        this.service = s;
      } else {
        this.platform.log.warn(
          `Cached accessory for '${this.zone.name}' has no matching Valve service. Removing and re-creating.`
        );
        this.unregisterAccessory(existingAccessory);
        createAccessory();
      }
    } else {
      createAccessory();
    }

    // Initial characteristic state
    this.service.updateCharacteristic(this.platform.api.hap.Characteristic.Active, this.zone.isRunning ? 1 : 0);
    this.service.updateCharacteristic(this.platform.api.hap.Characteristic.InUse, this.zone.isRunning ? 1 : 0);
    this.service.updateCharacteristic(
      this.platform.api.hap.Characteristic.RemainingDuration,
      this.limitMaxRemainingRunningTime(this.zone.remainingRunningTime)
    );

    this.accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.platform.log.info(`${this.accessory.displayName} identified!`);
    });

    this.service.getCharacteristic(this.platform.api.hap.Characteristic.Active).onSet(async (value: CharacteristicValue) => {
      try {
        if (value === 1) {
          await this.zone.run(this.platform.overrideRunningTime);
          this.platform.log.info(`'${this.zone.name}' sprinkler turned on`);
        } else {
          await this.zone.stop();
          this.platform.log.info(`'${this.zone.name}' sprinkler turned off`);
        }
      } catch (err) {
        this.platform.log.error(`Failed to toggle '${this.zone.name}': ${(err as Error).message}`);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    });
  }

  public update(zone: HydrawiseZone): void {
    if (this.zone.isRunning != zone.isRunning) {
      this.platform.log.info(`Received new running status for '${zone.name}': ${zone.isRunning ? 'on' : 'off'}`);
      this.service.updateCharacteristic(this.platform.api.hap.Characteristic.Active, zone.isRunning ? 1 : 0);
      this.service.updateCharacteristic(this.platform.api.hap.Characteristic.InUse, zone.isRunning ? 1 : 0);
      this.zone.isRunning = zone.isRunning;
    }

    if (this.zone.remainingRunningTime != zone.remainingRunningTime) {
      this.platform.log.info(`Received new remaining duration for '${zone.name}': ${zone.remainingRunningTime} seconds`);
      this.service.updateCharacteristic(
        this.platform.api.hap.Characteristic.RemainingDuration,
        this.limitMaxRemainingRunningTime(zone.remainingRunningTime)
      );
      this.zone.remainingRunningTime = zone.remainingRunningTime;
    }
  }

  public unregister(): void {
    this.platform.log.info(`Unregistering sprinkler accessory for deleted Hydrawise zone: ${this.zone.name}`);
    this.unregisterAccessory(this.accessory);
  }

  private unregisterAccessory(accessory: PlatformAccessory): void {
    this.platform.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.platform.accessories = this.platform.accessories.filter((item) => item !== accessory);
  }

  /** HomeKit caps RemainingDuration at 3600 seconds. */
  public limitMaxRemainingRunningTime(remainingRunningTime: number): number {
    return remainingRunningTime === undefined || remainingRunningTime <= 3600 ? remainingRunningTime : 3600;
  }
}

import { PlatformAccessoryEvent } from 'homebridge';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { ACCESSORY_CONTEXT_SCHEMA_VERSION, PLATFORM_NAME, PLUGIN_NAME } from './settings';
import type { HydrawiseConnectionType, HydrawiseZone } from 'hydrawise-api';
import type { HydrawisePlatform } from './HydrawisePlatform';
import type { HydrawiseAccessoryContext } from './types';

export interface HydrawiseSprinklerOptions {
  stableKey: string;
  controllerKey: string;
  connectionType: HydrawiseConnectionType;
  /** A cached accessory matched via the three-step lookup. v1 legacy accessories keep their original UUID. */
  cachedAccessory?: PlatformAccessory<Partial<HydrawiseAccessoryContext>>;
}

/** Wraps a single Hydrawise zone as a HomeKit Valve accessory. */
export class HydrawiseSprinkler {
  private accessory!: PlatformAccessory<Partial<HydrawiseAccessoryContext>>;
  private service!: Service;
  public readonly uuid: string;
  public readonly stableKey: string;
  public readonly controllerKey: string;
  public readonly connectionType: HydrawiseConnectionType;
  public zone: HydrawiseZone;
  public platform: HydrawisePlatform;

  constructor(zone: HydrawiseZone, platform: HydrawisePlatform, opts: HydrawiseSprinklerOptions) {
    this.zone = zone;
    this.platform = platform;
    this.stableKey = opts.stableKey;
    this.controllerKey = opts.controllerKey;
    this.connectionType = opts.connectionType;

    const newUUID = platform.api.hap.uuid.generate(this.stableKey);

    const createAccessory = () => {
      this.platform.log.info(`Configuring new sprinkler: ${this.zone.name}`);
      this.accessory = new this.platform.api.platformAccessory(this.zone.name, newUUID);
      this.platform.accessories.push(this.accessory);
      this.platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);
      this.service = this.accessory.addService(this.platform.api.hap.Service.Valve, 'Sprinkler');
      this.service.setCharacteristic(this.platform.api.hap.Characteristic.ValveType, '1');
      this.stampContext();
    };

    if (opts.cachedAccessory !== undefined) {
      const cached = opts.cachedAccessory;
      const s = cached.getService(this.platform.api.hap.Service.Valve);
      if (s !== undefined) {
        // Adopt cached accessory. v2 keeps its UUID; legacy v1 also keeps its UUID — context.stableKey is
        // what subsequent polls match on, so the original UUID (and therefore the user's room assignment)
        // is preserved.
        this.accessory = cached;
        this.service = s;
        // Stamp/refresh v2 context.
        this.stampContext();
        this.platform.api.updatePlatformAccessories([this.accessory]);
      } else {
        // v1.2.0 "corrupt accessory" recovery path — no Valve service: unregister & recreate fresh.
        this.platform.log.warn(`Cached accessory '${this.zone.name}' has no Valve service. Removing and re-creating.`);
        this.unregisterAccessory(cached);
        createAccessory();
      }
    } else {
      createAccessory();
    }

    this.uuid = this.accessory.UUID;

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

  private stampContext(): void {
    const ctx: HydrawiseAccessoryContext = {
      schemaVersion: ACCESSORY_CONTEXT_SCHEMA_VERSION,
      connectionType: this.connectionType,
      controllerKey: this.controllerKey,
      stableKey: this.stableKey,
      zoneName: this.zone.name,
      zoneNumber: this.zone.zone,
      cloudRelayID: this.zone.relayID
    };
    this.accessory.context = ctx;
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

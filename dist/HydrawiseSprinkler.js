"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HydrawiseSprinkler = void 0;
const settings_1 = require("./settings");
/** Wraps a single Hydrawise zone as a HomeKit Valve accessory. */
class HydrawiseSprinkler {
    accessory;
    service;
    uuid;
    stableKey;
    controllerKey;
    connectionType;
    zone;
    platform;
    constructor(zone, platform, opts) {
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
            this.platform.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [this.accessory]);
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
            }
            else {
                // v1.2.0 "corrupt accessory" recovery path — no Valve service: unregister & recreate fresh.
                this.platform.log.warn(`Cached accessory '${this.zone.name}' has no Valve service. Removing and re-creating.`);
                this.unregisterAccessory(cached);
                createAccessory();
            }
        }
        else {
            createAccessory();
        }
        this.uuid = this.accessory.UUID;
        // Initial characteristic state
        this.service.updateCharacteristic(this.platform.api.hap.Characteristic.Active, this.zone.isRunning ? 1 : 0);
        this.service.updateCharacteristic(this.platform.api.hap.Characteristic.InUse, this.zone.isRunning ? 1 : 0);
        this.service.updateCharacteristic(this.platform.api.hap.Characteristic.RemainingDuration, this.limitMaxRemainingRunningTime(this.zone.remainingRunningTime));
        this.accessory.on("identify" /* PlatformAccessoryEvent.IDENTIFY */, () => {
            this.platform.log.info(`${this.accessory.displayName} identified!`);
        });
        this.service.getCharacteristic(this.platform.api.hap.Characteristic.Active).onSet(async (value) => {
            try {
                if (value === 1) {
                    await this.zone.run(this.platform.overrideRunningTime);
                    this.platform.log.info(`'${this.zone.name}' sprinkler turned on`);
                }
                else {
                    await this.zone.stop();
                    this.platform.log.info(`'${this.zone.name}' sprinkler turned off`);
                }
            }
            catch (err) {
                this.platform.log.error(`Failed to toggle '${this.zone.name}': ${err.message}`);
                throw new this.platform.api.hap.HapStatusError(-70402 /* this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
            }
        });
    }
    stampContext() {
        const ctx = {
            schemaVersion: settings_1.ACCESSORY_CONTEXT_SCHEMA_VERSION,
            connectionType: this.connectionType,
            controllerKey: this.controllerKey,
            stableKey: this.stableKey,
            zoneName: this.zone.name,
            zoneNumber: this.zone.zone,
            cloudRelayID: this.zone.relayID
        };
        this.accessory.context = ctx;
    }
    update(zone) {
        if (this.zone.isRunning != zone.isRunning) {
            this.platform.log.info(`Received new running status for '${zone.name}': ${zone.isRunning ? 'on' : 'off'}`);
            this.service.updateCharacteristic(this.platform.api.hap.Characteristic.Active, zone.isRunning ? 1 : 0);
            this.service.updateCharacteristic(this.platform.api.hap.Characteristic.InUse, zone.isRunning ? 1 : 0);
            this.zone.isRunning = zone.isRunning;
        }
        if (this.zone.remainingRunningTime != zone.remainingRunningTime) {
            this.platform.log.info(`Received new remaining duration for '${zone.name}': ${zone.remainingRunningTime} seconds`);
            this.service.updateCharacteristic(this.platform.api.hap.Characteristic.RemainingDuration, this.limitMaxRemainingRunningTime(zone.remainingRunningTime));
            this.zone.remainingRunningTime = zone.remainingRunningTime;
        }
    }
    unregister() {
        this.platform.log.info(`Unregistering sprinkler accessory for deleted Hydrawise zone: ${this.zone.name}`);
        this.unregisterAccessory(this.accessory);
    }
    unregisterAccessory(accessory) {
        this.platform.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
        this.platform.accessories = this.platform.accessories.filter((item) => item !== accessory);
    }
    /** HomeKit caps RemainingDuration at 3600 seconds. */
    limitMaxRemainingRunningTime(remainingRunningTime) {
        return remainingRunningTime === undefined || remainingRunningTime <= 3600 ? remainingRunningTime : 3600;
    }
}
exports.HydrawiseSprinkler = HydrawiseSprinkler;
//# sourceMappingURL=HydrawiseSprinkler.js.map
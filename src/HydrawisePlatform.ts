/**
 * @author Martijn Dierckx
 * @todo Phase J: stable-key UUID + v1 migration; Phase K: two-stage stale-cache sweep
 */

import { APIEvent } from 'homebridge';
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { DEFAULT_POLLING_INTERVAL_CLOUD, DEFAULT_POLLING_INTERVAL_LOCAL } from './settings';
import { Hydrawise, HydrawiseConnectionType, HydrawiseZone, HydrawiseController } from 'hydrawise-api';
import { HydrawiseSprinkler } from './HydrawiseSprinkler';

export class HydrawisePlatform implements DynamicPlatformPlugin {
  public readonly log: Logger;
  public readonly api: API;
  private readonly hydrawise: Hydrawise;
  private pollingInterval = 0;
  public readonly overrideRunningTime: number | undefined = undefined;

  public accessories: PlatformAccessory[] = [];
  private sprinklers: HydrawiseSprinkler[] = [];
  private intervals: NodeJS.Timeout[] = [];

  constructor(log: Logger, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;

    this.hydrawise = new Hydrawise({
      type: config.type == 'LOCAL' ? HydrawiseConnectionType.LOCAL : HydrawiseConnectionType.CLOUD,
      host: config.host,
      user: config.user,
      password: config.password,
      key: config.api_key
    });

    if (config.running_time !== undefined && typeof config.running_time == 'number') {
      this.overrideRunningTime = config.running_time;
    }

    api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      void this.onLaunch(config);
    });
    api.on(APIEvent.SHUTDOWN, () => this.onShutdown());
  }

  private async onLaunch(config: PlatformConfig): Promise<void> {
    try {
      const controllers = await this.hydrawise.getControllers();
      if (controllers.length === 0) {
        this.log.error('Did not receive any controllers');
        return;
      }

      if (this.overrideRunningTime !== undefined) {
        this.log.debug(`[CONFIG] Overriding the run time for each zone when running: ${this.overrideRunningTime} seconds`);
      }

      if (config.polling_interval !== undefined && typeof config.polling_interval == 'number') {
        this.pollingInterval = config.polling_interval;
      } else if (this.hydrawise.type == HydrawiseConnectionType.LOCAL) {
        this.pollingInterval = DEFAULT_POLLING_INTERVAL_LOCAL;
      } else {
        // Spread CLOUD polls across the period so multi-controller accounts don't burst.
        this.pollingInterval = DEFAULT_POLLING_INTERVAL_CLOUD * controllers.length;
      }
      this.log.debug(`[CONFIG] Polling interval: ${this.pollingInterval} milliseconds`);

      for (const controller of controllers) {
        this.log.debug(`Retrieved a Hydrawise controller: ${controller.name}`);
        await this.pollOnce(controller);
        const handle = setInterval(() => {
          void this.pollOnce(controller);
        }, this.pollingInterval);
        this.intervals.push(handle);
      }
    } catch (err) {
      this.log.error(`Initial controller fetch failed: ${(err as Error).message}`);
    }
  }

  private onShutdown(): void {
    for (const handle of this.intervals) clearInterval(handle);
    this.intervals = [];
  }

  private async pollOnce(controller: HydrawiseController): Promise<void> {
    try {
      const zones = await controller.getZones();
      this.reconcile(controller, zones);
    } catch (err) {
      this.log.error(`Poll failed for ${controller.name}: ${(err as Error).message}`);
    }
  }

  /** Reconcile a single controller's zone list with our sprinkler wrappers. */
  private reconcile(controller: HydrawiseController, zones: HydrawiseZone[]): void {
    // Track which of this controller's sprinklers haven't been seen this poll.
    let toCheckSprinklers = this.sprinklers.filter((item) => item.zone.controller?.id == controller.id);

    for (const zone of zones) {
      const existingSprinkler = this.sprinklers.find((x) => x.zone.relayID == zone.relayID);
      if (existingSprinkler !== undefined) {
        this.log.debug(`Received zone data for existing sprinkler: ${zone.name}`);
        existingSprinkler.update(zone);
        toCheckSprinklers = toCheckSprinklers.filter((item) => item.zone.relayID !== zone.relayID);
      } else {
        this.log.debug(`Received zone data for new/cached sprinkler: ${zone.name}`);
        const newSprinkler = new HydrawiseSprinkler(zone, this);
        this.sprinklers.push(newSprinkler);
      }
    }

    // Zones that disappeared mid-life — drop their sprinklers.
    for (const sprinkler of toCheckSprinklers) {
      this.log.info(`Removing Sprinkler for deleted Hydrawise zone: ${sprinkler.zone.name}`);
      sprinkler.unregister();
      this.sprinklers = this.sprinklers.filter((item) => item !== sprinkler);
    }
  }

  /** Invoked by Homebridge to restore cached accessories from disk at startup. */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info(`Configuring Sprinkler from cache: ${accessory.displayName}`);
    this.accessories.push(accessory);
  }
}

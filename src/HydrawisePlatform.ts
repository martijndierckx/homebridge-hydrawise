/**
 * @author Martijn Dierckx
 * @todo Phase J: stable-key UUID + v1 migration; Phase K: two-stage stale-cache sweep
 */

import { APIEvent } from 'homebridge';
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { DEFAULT_POLLING_INTERVAL_CLOUD, DEFAULT_POLLING_INTERVAL_LOCAL } from './settings';
import { Hydrawise, HydrawiseConnectionType, HydrawiseZone, HydrawiseController } from 'hydrawise-api';
import { HydrawiseSprinkler } from './HydrawiseSprinkler';
import { parseConfig, type ParsedHydrawiseConfig } from './HydrawiseConfig';

export class HydrawisePlatform implements DynamicPlatformPlugin {
  public readonly log: Logger;
  public readonly api: API;
  private readonly cfg: ParsedHydrawiseConfig;
  private readonly hydrawise: Hydrawise;
  private pollingInterval = 0;
  public readonly overrideRunningTime: number | undefined;

  public accessories: PlatformAccessory[] = [];
  private sprinklers: HydrawiseSprinkler[] = [];
  private intervals: NodeJS.Timeout[] = [];
  private startTimeouts: NodeJS.Timeout[] = [];

  constructor(log: Logger, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;
    this.cfg = parseConfig(config, log);
    this.overrideRunningTime = this.cfg.overrideRunningTime;

    this.hydrawise = new Hydrawise({
      type: this.cfg.connectionType,
      host: this.cfg.host,
      user: this.cfg.user,
      password: this.cfg.password,
      key: this.cfg.apiKey
    });

    api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      void this.onLaunch();
    });
    api.on(APIEvent.SHUTDOWN, () => this.onShutdown());
  }

  private async onLaunch(): Promise<void> {
    try {
      const controllers = await this.hydrawise.getControllers();
      if (controllers.length === 0) {
        this.log.error('Did not receive any controllers');
        return;
      }

      if (this.overrideRunningTime !== undefined) {
        this.log.debug(`[CONFIG] Overriding the run time for each zone when running: ${this.overrideRunningTime} seconds`);
      }

      if (this.cfg.pollingIntervalOverride !== undefined) {
        this.pollingInterval = this.cfg.pollingIntervalOverride;
      } else if (this.hydrawise.type == HydrawiseConnectionType.LOCAL) {
        this.pollingInterval = DEFAULT_POLLING_INTERVAL_LOCAL;
      } else {
        // Spread CLOUD polls across the period so multi-controller accounts don't burst.
        this.pollingInterval = DEFAULT_POLLING_INTERVAL_CLOUD * controllers.length;
      }
      this.log.debug(`[CONFIG] Polling interval: ${this.pollingInterval} milliseconds`);

      // Stagger first polls so steady-state remains spread across the interval
      // (controller 0 starts at t=0, controller N at t = N * interval/count).
      const stagger = Math.floor(this.pollingInterval / controllers.length);
      controllers.forEach((controller, index) => {
        this.log.debug(`Retrieved a Hydrawise controller: ${controller.name}`);
        const startAfter = index * stagger;
        if (startAfter === 0) {
          this.startPollingFor(controller);
        } else {
          const t = setTimeout(() => this.startPollingFor(controller), startAfter);
          this.startTimeouts.push(t);
        }
      });
    } catch (err) {
      this.log.error(`Initial controller fetch failed: ${(err as Error).message}`);
    }
  }

  private startPollingFor(controller: HydrawiseController): void {
    void this.pollOnce(controller);
    const handle = setInterval(() => {
      void this.pollOnce(controller);
    }, this.pollingInterval);
    this.intervals.push(handle);
  }

  private onShutdown(): void {
    for (const t of this.startTimeouts) clearTimeout(t);
    for (const h of this.intervals) clearInterval(h);
    this.startTimeouts = [];
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

  private reconcile(controller: HydrawiseController, zones: HydrawiseZone[]): void {
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

    for (const sprinkler of toCheckSprinklers) {
      this.log.info(`Removing Sprinkler for deleted Hydrawise zone: ${sprinkler.zone.name}`);
      sprinkler.unregister();
      this.sprinklers = this.sprinklers.filter((item) => item !== sprinkler);
    }
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info(`Configuring Sprinkler from cache: ${accessory.displayName}`);
    this.accessories.push(accessory);
  }
}

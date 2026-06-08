/**
 * @author Martijn Dierckx
 * @todo Phase K: two-stage stale-cache sweep
 */

import { APIEvent } from 'homebridge';
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { DEFAULT_POLLING_INTERVAL_CLOUD, DEFAULT_POLLING_INTERVAL_LOCAL, ACCESSORY_CONTEXT_SCHEMA_VERSION } from './settings';
import { Hydrawise, HydrawiseConnectionType, HydrawiseZone, HydrawiseController } from 'hydrawise-api';
import { HydrawiseSprinkler } from './HydrawiseSprinkler';
import { parseConfig, type ParsedHydrawiseConfig } from './HydrawiseConfig';
import { computeControllerKey, computeStableKey, computeLegacyUUID } from './stableKey';
import type { HydrawiseAccessoryContext } from './types';

type CachedAccessory = PlatformAccessory<Partial<HydrawiseAccessoryContext>>;

export class HydrawisePlatform implements DynamicPlatformPlugin {
  public readonly log: Logger;
  public readonly api: API;
  private readonly cfg: ParsedHydrawiseConfig;
  private readonly hydrawise: Hydrawise;
  private pollingInterval = 0;
  public readonly overrideRunningTime: number | undefined;

  public accessories: CachedAccessory[] = [];
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
        this.pollingInterval = DEFAULT_POLLING_INTERVAL_CLOUD * controllers.length;
      }
      this.log.debug(`[CONFIG] Polling interval: ${this.pollingInterval} milliseconds`);

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

  /** Reconcile a controller's current zone list with our sprinkler wrappers (stable-key matching). */
  private reconcile(controller: HydrawiseController, zones: HydrawiseZone[]): void {
    const controllerKey = computeControllerKey(controller, this.hydrawise.type);
    let toCheckSprinklers = this.sprinklers.filter((s) => s.controllerKey === controllerKey);

    for (const zone of zones) {
      const stableKey = computeStableKey(zone, controller, this.hydrawise.type);
      const existingSprinkler = this.sprinklers.find((s) => s.stableKey === stableKey);

      if (existingSprinkler !== undefined) {
        this.log.debug(`Received zone data for existing sprinkler: ${zone.name}`);
        existingSprinkler.update(zone);
        toCheckSprinklers = toCheckSprinklers.filter((s) => s !== existingSprinkler);
        continue;
      }

      // Three-step match against cached (but not yet wrapped) accessories.
      const cached = this.findCachedAccessory(zone, controller, controllerKey, stableKey);
      this.log.debug(
        cached ? `Adopting cached accessory for ${zone.name} (${cached.UUID})` : `Creating fresh accessory for ${zone.name}`
      );
      const newSprinkler = new HydrawiseSprinkler(zone, this, {
        stableKey,
        controllerKey,
        connectionType: this.hydrawise.type,
        cachedAccessory: cached
      });
      this.sprinklers.push(newSprinkler);
    }

    // Per-poll removal of zones that disappeared mid-life on THIS controller.
    for (const sprinkler of toCheckSprinklers) {
      this.log.info(`Removing Sprinkler for deleted Hydrawise zone: ${sprinkler.zone.name}`);
      sprinkler.unregister();
      this.sprinklers = this.sprinklers.filter((s) => s !== sprinkler);
    }
  }

  /**
   * Three-step cache match:
   *   1. PRIMARY  — cached accessory whose context.stableKey === this zone's stableKey.
   *   2. SECONDARY (CLOUD-only) — v1 legacy UUID matches AND displayName matches.
   *   3. TERTIARY (LOCAL-only) — displayName matches AND (controllerKey matches OR schemaVersion missing).
   * Returns undefined if no candidate qualifies. Refuses tertiary on duplicate display names.
   */
  private findCachedAccessory(
    zone: HydrawiseZone,
    _controller: HydrawiseController,
    controllerKey: string,
    stableKey: string
  ): CachedAccessory | undefined {
    const unwrapped = this.accessories.filter((a) => !this.sprinklers.some((s) => s.uuid === a.UUID));

    // 1. PRIMARY
    const primary = unwrapped.find((a) => a.context?.stableKey === stableKey);
    if (primary) return primary;

    // 2. SECONDARY (CLOUD) — legacy v1 hashed relayID with a name guard.
    if (this.hydrawise.type === HydrawiseConnectionType.CLOUD) {
      const legacyUUID = computeLegacyUUID(zone, this.api);
      const secondary = unwrapped.find(
        (a) => a.UUID === legacyUUID && a.displayName === zone.name && a.context?.schemaVersion !== ACCESSORY_CONTEXT_SCHEMA_VERSION
      );
      if (secondary) return secondary;
    }

    // 3. TERTIARY (LOCAL) — name + controllerKey-or-legacy.
    if (this.hydrawise.type === HydrawiseConnectionType.LOCAL) {
      const nameMatches = unwrapped.filter((a) => a.displayName === zone.name);
      // Refuse on duplicate names (ambiguous).
      const eligible = nameMatches.filter(
        (a) =>
          a.context?.schemaVersion !== ACCESSORY_CONTEXT_SCHEMA_VERSION ||
          a.context?.controllerKey === controllerKey
      );
      if (eligible.length > 1) {
        this.log.warn(
          `Migration ambiguity: ${eligible.length} cached LOCAL accessories share name '${zone.name}' — skipping name-based fallback for this zone`
        );
        return undefined;
      }
      if (eligible.length === 1) return eligible[0];
    }

    return undefined;
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info(`Configuring Sprinkler from cache: ${accessory.displayName}`);
    this.accessories.push(accessory as CachedAccessory);
  }
}

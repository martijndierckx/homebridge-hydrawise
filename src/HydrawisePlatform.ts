/**
 * @author Martijn Dierckx
 */

import { APIEvent } from 'homebridge';
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import {
  DEFAULT_POLLING_INTERVAL_CLOUD,
  DEFAULT_POLLING_INTERVAL_LOCAL,
  ACCESSORY_CONTEXT_SCHEMA_VERSION,
  PLUGIN_NAME,
  PLATFORM_NAME
} from './settings';
import { Hydrawise, HydrawiseConnectionType, HydrawiseZone, HydrawiseController } from 'hydrawise-api';
import { HydrawiseSprinkler } from './HydrawiseSprinkler';
import { parseConfig, validateConfig, type ParsedHydrawiseConfig } from './HydrawiseConfig';
import { computeControllerKey, computeStableKey, computeLegacyUUID } from './stableKey';
import type { HydrawiseAccessoryContext } from './types';

type CachedAccessory = PlatformAccessory<Partial<HydrawiseAccessoryContext>>;

export class HydrawisePlatform implements DynamicPlatformPlugin {
  public readonly log: Logger;
  public readonly api: API;
  private readonly cfg: ParsedHydrawiseConfig;
  private readonly hydrawise: Hydrawise | undefined;
  private pollingInterval = 0;
  public readonly overrideRunningTime: number | undefined;

  public accessories: CachedAccessory[] = [];
  private sprinklers: HydrawiseSprinkler[] = [];
  private intervals: NodeJS.Timeout[] = [];
  private startTimeouts: NodeJS.Timeout[] = [];

  // Stale-cache sweep state (Phase K)
  private expectedControllerKeys = new Set<string>();
  private firstPollOK = new Set<string>();
  private firstPollZoneCount = new Map<string, number>();
  private matchedUUIDsByController = new Map<string, Set<string>>();
  private controllerSwept = new Set<string>();
  private globalSwept = false;

  constructor(log: Logger, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;
    this.cfg = parseConfig(config, log);
    this.overrideRunningTime = this.cfg.overrideRunningTime;

    const validationError = validateConfig(this.cfg);
    if (validationError !== null) {
      this.log.error(
        `[CONFIG] Plugin disabled — ${validationError}. Cached accessories will be preserved; update your Homebridge config to enable polling.`
      );
      return;
    }

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
    if (this.hydrawise === undefined) return;
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
      } else if (this.cfg.connectionType === HydrawiseConnectionType.LOCAL) {
        this.pollingInterval = DEFAULT_POLLING_INTERVAL_LOCAL;
      } else {
        this.pollingInterval = DEFAULT_POLLING_INTERVAL_CLOUD * controllers.length;
      }
      this.log.debug(`[CONFIG] Polling interval: ${this.pollingInterval} milliseconds`);

      // Stamp expected controllers up front so the sweep knows the full set even before any poll completes.
      this.expectedControllerKeys = new Set(controllers.map((c) => computeControllerKey(c, this.cfg.connectionType)));

      const stagger = Math.floor(this.pollingInterval / controllers.length);
      controllers.forEach((controller, index) => {
        this.log.info(`Retrieved a Hydrawise controller: ${controller.name}`);
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
      const controllerKey = computeControllerKey(controller, this.cfg.connectionType);
      const isFirstSuccessfulPoll = !this.firstPollOK.has(controllerKey);
      this.reconcile(controller, controllerKey, zones);
      if (isFirstSuccessfulPoll) {
        this.firstPollOK.add(controllerKey);
        this.firstPollZoneCount.set(controllerKey, zones.length);
        if (zones.length === 0) {
          this.log.warn(
            `Controller '${controller.name}' returned 0 zones on first poll. ` +
              `If you expected zones here, your controller may be returning all relays as unconfigured ` +
              `(LOCAL: relays with type=110 are filtered as empty slots). Run homebridge with -D for details.`
          );
        }
        this.maybeSweepController(controllerKey);
        this.maybeSweepGlobalV1();
      }
    } catch (err) {
      this.log.error(`Poll failed for ${controller.name}: ${(err as Error).message}`);
    }
  }

  /**
   * Stage 1 sweep — runs once per controller after its first successful poll AND only if that poll
   * returned ≥1 zone. Removes v2-stamped accessories belonging to this controller that weren't matched.
   */
  private maybeSweepController(controllerKey: string): void {
    if (this.controllerSwept.has(controllerKey)) return;
    if ((this.firstPollZoneCount.get(controllerKey) ?? 0) === 0) return;
    const matched = this.matchedUUIDsByController.get(controllerKey) ?? new Set();
    const toSweep = this.accessories.filter(
      (a) =>
        a.context?.schemaVersion === ACCESSORY_CONTEXT_SCHEMA_VERSION &&
        a.context?.controllerKey === controllerKey &&
        !matched.has(a.UUID)
    );
    for (const a of toSweep) {
      this.log.info(`Stale accessory swept (controller ${controllerKey}): ${a.displayName}`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [a]);
      this.accessories = this.accessories.filter((x) => x !== a);
      this.sprinklers = this.sprinklers.filter((s) => s.uuid !== a.UUID);
    }
    this.controllerSwept.add(controllerKey);
  }

  /**
   * Stage 2 sweep — runs once globally, after every expected controller has had a first
   * successful poll AND at least one of them returned ≥1 zone. Removes v1 (un-stamped) accessories
   * that weren't adopted by any controller.
   */
  private maybeSweepGlobalV1(): void {
    if (this.globalSwept) return;
    for (const ck of this.expectedControllerKeys) {
      if (!this.firstPollOK.has(ck)) return;
    }
    let anyHasZones = false;
    for (const n of this.firstPollZoneCount.values()) {
      if (n > 0) {
        anyHasZones = true;
        break;
      }
    }
    if (!anyHasZones) return;

    const matchedAcrossAll = new Set<string>();
    for (const set of this.matchedUUIDsByController.values()) {
      for (const uuid of set) matchedAcrossAll.add(uuid);
    }
    const toSweep = this.accessories.filter(
      (a) => a.context?.schemaVersion !== ACCESSORY_CONTEXT_SCHEMA_VERSION && !matchedAcrossAll.has(a.UUID)
    );
    for (const a of toSweep) {
      this.log.info(`Stale v1 accessory swept: ${a.displayName}`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [a]);
      this.accessories = this.accessories.filter((x) => x !== a);
      this.sprinklers = this.sprinklers.filter((s) => s.uuid !== a.UUID);
    }
    this.globalSwept = true;
  }

  /** Reconcile a controller's current zone list with our sprinkler wrappers (stable-key matching). */
  private reconcile(controller: HydrawiseController, controllerKey: string, zones: HydrawiseZone[]): void {
    // Excluded relays: remove any existing accessory (active or cached-from-reboot) and drop from the working set.
    const isExcluded = (z: HydrawiseZone): boolean => this.cfg.excludeRelays.includes(z.zone);
    for (const zone of zones.filter(isExcluded)) {
      this.removeExcludedZone(zone, controller, controllerKey);
    }
    const activeZones = zones.filter((z) => !isExcluded(z));

    let toCheckSprinklers = this.sprinklers.filter((s) => s.controllerKey === controllerKey);
    const matchedThisPoll = new Set<string>();

    for (const zone of activeZones) {
      const stableKey = computeStableKey(zone, controller, this.cfg.connectionType);
      const existingSprinkler = this.sprinklers.find((s) => s.stableKey === stableKey);

      if (existingSprinkler !== undefined) {
        this.log.debug(`Received zone data for existing sprinkler: ${zone.name}`);
        existingSprinkler.update(zone);
        toCheckSprinklers = toCheckSprinklers.filter((s) => s !== existingSprinkler);
        matchedThisPoll.add(existingSprinkler.uuid);
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
        connectionType: this.cfg.connectionType,
        cachedAccessory: cached
      });
      this.sprinklers.push(newSprinkler);
      matchedThisPoll.add(newSprinkler.uuid);
    }

    this.matchedUUIDsByController.set(controllerKey, matchedThisPoll);

    // Per-poll removal of zones that disappeared mid-life on THIS controller.
    for (const sprinkler of toCheckSprinklers) {
      this.log.info(`Removing Sprinkler for deleted Hydrawise zone: ${sprinkler.zone.name}`);
      sprinkler.unregister();
      this.sprinklers = this.sprinklers.filter((s) => s !== sprinkler);
    }
  }

  /** Remove an accessory for a relay that is in the exclude list — active sprinkler or a cached accessory restored on reboot. */
  private removeExcludedZone(zone: HydrawiseZone, controller: HydrawiseController, controllerKey: string): void {
    const stableKey = computeStableKey(zone, controller, this.cfg.connectionType);
    const sprinkler = this.sprinklers.find((s) => s.stableKey === stableKey);
    if (sprinkler !== undefined) {
      this.log.info(`Removing excluded zone (relay ${zone.zone}): ${zone.name}`);
      sprinkler.unregister();
      this.sprinklers = this.sprinklers.filter((s) => s !== sprinkler);
      return;
    }
    const cached = this.findCachedAccessory(zone, controller, controllerKey, stableKey);
    if (cached !== undefined) {
      this.log.info(`Removing excluded zone from cache (relay ${zone.zone}): ${zone.name}`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cached]);
      this.accessories = this.accessories.filter((a) => a !== cached);
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
    if (this.cfg.connectionType === HydrawiseConnectionType.CLOUD) {
      const legacyUUID = computeLegacyUUID(zone, this.api);
      const secondary = unwrapped.find(
        (a) => a.UUID === legacyUUID && a.displayName === zone.name && a.context?.schemaVersion !== ACCESSORY_CONTEXT_SCHEMA_VERSION
      );
      if (secondary) return secondary;
    }

    // 3. TERTIARY (LOCAL) — name + controllerKey-or-legacy.
    if (this.cfg.connectionType === HydrawiseConnectionType.LOCAL) {
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

import type { API } from 'homebridge';
import { HydrawiseConnectionType, type HydrawiseController, type HydrawiseZone } from 'hydrawise-api';
/** Lowercase + strip a single trailing slash. Preserves port (so `host:8080` stays distinct from `host`). */
export declare function sanitizeHost(host: string): string;
/**
 * Returns a stable identifier for the controller across reboots.
 * - CLOUD: `controller.id` (cloud assigns stable IDs)
 * - LOCAL: `serialNumber` when present, else the sanitized host (host is required by config).
 */
export declare function computeControllerKey(controller: HydrawiseController, connectionType: HydrawiseConnectionType): string;
/**
 * Returns a stable per-zone key, prefixed by the connection type so LOCAL and CLOUD accessories
 * for the same physical zone deliberately produce different UUIDs.
 *
 * - LOCAL: `local:${controllerKey}:${zone.zone}` (zone.zone is the stable 1-based relay number)
 * - CLOUD: `cloud:${controllerKey}:${zone.relayID}` (relayID is stable in cloud)
 */
export declare function computeStableKey(zone: HydrawiseZone, controller: HydrawiseController, connectionType: HydrawiseConnectionType): string;
/** The v1 UUID formula — useful for adopting legacy cached accessories during migration. */
export declare function computeLegacyUUID(zone: HydrawiseZone, api: API): string;
//# sourceMappingURL=stableKey.d.ts.map
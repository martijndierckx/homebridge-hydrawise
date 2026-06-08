import type { API } from 'homebridge';
import { HydrawiseConnectionType, type HydrawiseController, type HydrawiseZone } from 'hydrawise-api';

/** Lowercase + strip a single trailing slash. Preserves port (so `host:8080` stays distinct from `host`). */
export function sanitizeHost(host: string): string {
  return host.toLowerCase().replace(/\/$/, '');
}

/**
 * Returns a stable identifier for the controller across reboots.
 * - CLOUD: `controller.id` (cloud assigns stable IDs)
 * - LOCAL: `serialNumber` when present, else the sanitized host (host is required by config).
 */
export function computeControllerKey(controller: HydrawiseController, connectionType: HydrawiseConnectionType): string {
  if (connectionType === HydrawiseConnectionType.CLOUD) {
    if (controller.id === undefined) {
      throw new Error('CLOUD controller missing id — cannot compute controllerKey');
    }
    return String(controller.id);
  }
  if (controller.serialNumber !== undefined && controller.serialNumber.length > 0) {
    return controller.serialNumber;
  }
  if (controller.host !== undefined && controller.host.length > 0) {
    return sanitizeHost(controller.host);
  }
  throw new Error('LOCAL controller missing both serialNumber and host — cannot compute controllerKey');
}

/**
 * Returns a stable per-zone key, prefixed by the connection type so LOCAL and CLOUD accessories
 * for the same physical zone deliberately produce different UUIDs.
 *
 * - LOCAL: `local:${controllerKey}:${zone.zone}` (zone.zone is the stable 1-based relay number)
 * - CLOUD: `cloud:${controllerKey}:${zone.relayID}` (relayID is stable in cloud)
 */
export function computeStableKey(
  zone: HydrawiseZone,
  controller: HydrawiseController,
  connectionType: HydrawiseConnectionType
): string {
  const controllerKey = computeControllerKey(controller, connectionType);
  if (connectionType === HydrawiseConnectionType.CLOUD) {
    return `cloud:${controllerKey}:${zone.relayID}`;
  }
  return `local:${controllerKey}:${zone.zone}`;
}

/** The v1 UUID formula — useful for adopting legacy cached accessories during migration. */
export function computeLegacyUUID(zone: HydrawiseZone, api: API): string {
  return api.hap.uuid.generate(zone.relayID.toString());
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeHost = sanitizeHost;
exports.computeControllerKey = computeControllerKey;
exports.computeStableKey = computeStableKey;
exports.computeLegacyUUID = computeLegacyUUID;
const hydrawise_api_1 = require("hydrawise-api");
/** Lowercase + strip a single trailing slash. Preserves port (so `host:8080` stays distinct from `host`). */
function sanitizeHost(host) {
    return host.toLowerCase().replace(/\/$/, '');
}
/**
 * Returns a stable identifier for the controller across reboots.
 * - CLOUD: `controller.id` (cloud assigns stable IDs)
 * - LOCAL: `serialNumber` when present, else the sanitized host (host is required by config).
 */
function computeControllerKey(controller, connectionType) {
    if (connectionType === hydrawise_api_1.HydrawiseConnectionType.CLOUD) {
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
function computeStableKey(zone, controller, connectionType) {
    const controllerKey = computeControllerKey(controller, connectionType);
    if (connectionType === hydrawise_api_1.HydrawiseConnectionType.CLOUD) {
        return `cloud:${controllerKey}:${zone.relayID}`;
    }
    return `local:${controllerKey}:${zone.zone}`;
}
/** The v1 UUID formula — useful for adopting legacy cached accessories during migration. */
function computeLegacyUUID(zone, api) {
    return api.hap.uuid.generate(zone.relayID.toString());
}
//# sourceMappingURL=stableKey.js.map
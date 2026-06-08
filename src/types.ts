import type { HydrawiseConnectionType } from 'hydrawise-api';

/** v2-stamped context on every accessory; missing/older = legacy v1. */
export interface HydrawiseAccessoryContext {
  schemaVersion: 2;
  connectionType: HydrawiseConnectionType;
  controllerKey: string;
  /** LOCAL only — the 1-based relay number. */
  zoneNumber?: number;
  /** CLOUD only — Hydrawise cloud relay_id. */
  cloudRelayID?: number;
  /** Snapshot of `zone.name` at the time the accessory was stamped. Used for diagnostics + tertiary migration. */
  zoneName: string;
  /** The canonical key hashed into accessory.UUID for v2 accessories. Migrated v1 accessories store this but keep their original UUID. */
  stableKey: string;
}

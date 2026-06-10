export const PLATFORM_NAME = 'HydrawisePlatform';
export const PLUGIN_NAME = 'homebridge-hydrawise';

/** Default polling interval (ms) for LOCAL connections when not overridden via config. */
export const DEFAULT_POLLING_INTERVAL_LOCAL = 1000;

/** Default polling interval (ms) for CLOUD connections (per controller) when not overridden via config. */
export const DEFAULT_POLLING_INTERVAL_CLOUD = 12000;

/** Schema version stamped on `accessory.context` from v2 onward. Anything else is treated as legacy v1. */
export const ACCESSORY_CONTEXT_SCHEMA_VERSION = 2;

/** Consecutive missed polls a zone must be absent for before its accessory is removed. */
export const MAX_MISSED_POLLS = 3;

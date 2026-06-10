"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_MISSED_POLLS = exports.ACCESSORY_CONTEXT_SCHEMA_VERSION = exports.DEFAULT_POLLING_INTERVAL_CLOUD = exports.DEFAULT_POLLING_INTERVAL_LOCAL = exports.PLUGIN_NAME = exports.PLATFORM_NAME = void 0;
exports.PLATFORM_NAME = 'HydrawisePlatform';
exports.PLUGIN_NAME = 'homebridge-hydrawise';
/** Default polling interval (ms) for LOCAL connections when not overridden via config. */
exports.DEFAULT_POLLING_INTERVAL_LOCAL = 1000;
/** Default polling interval (ms) for CLOUD connections (per controller) when not overridden via config. */
exports.DEFAULT_POLLING_INTERVAL_CLOUD = 12000;
/** Schema version stamped on `accessory.context` from v2 onward. Anything else is treated as legacy v1. */
exports.ACCESSORY_CONTEXT_SCHEMA_VERSION = 2;
/** Consecutive missed polls a zone must be absent for before its accessory is removed. */
exports.MAX_MISSED_POLLS = 3;
//# sourceMappingURL=settings.js.map
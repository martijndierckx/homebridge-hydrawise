# Changelog

## 2.1.0

### Fixed

- **Issue #42 — LOCAL valves without a watering schedule are no longer deleted from HomeKit when they stop running.** Previously, a relay that had never been scheduled would disappear from HomeKit after its first poll because `hydrawise-api` did not surface it. Requires `hydrawise-api ≥ 2.0.2`, which now returns all LOCAL relays regardless of schedule status.

### Added

- `exclude_relays` config option (LOCAL connections only) — accepts an array of relay numbers to hide from HomeKit. On startup the plugin logs a **"DETECTED ZONES"** line listing every relay number so users can easily identify which ones to exclude.

### Changed

- Accessory removal is now **debounced**: a zone must be absent from three consecutive polls before it is unregistered from HomeKit. This prevents transient API blips or brief connectivity hiccups from silently dropping zones.

## 2.0.1

### Fixed

- **Zero accessories after a fresh install or controller reset.** Caused by a bug in `hydrawise-api`'s LOCAL zone filter that dropped real zones with `lastwaterepoch === 0` (never watered). Bumped `hydrawise-api` to `^2.0.1`, which restores the original `type === 110` filter for unconfigured relay slots.

### Changed

- `Retrieved a Hydrawise controller: …` promoted from `debug` to `info` so users get a visible "the plugin reached the controller" signal at default log level.
- First poll returning zero zones now emits a `warn` instead of disappearing into debug-level silence, with a pointer to the LOCAL filter behavior.

## 2.0.0

### Fixed

- **"General room" bug.** After a Hydrawise controller restarts, accessories now stay in their assigned HomeKit rooms instead of reappearing in the "General" room. Root cause: UUIDs were derived from `zone.relayID`, which the controller regenerates on every boot for LOCAL connections; v2 derives UUIDs from a stable composite key (`local:<serial-or-host>:<zone-number>` for LOCAL, `cloud:<controller-id>:<relay-id>` for CLOUD). Existing accessories are automatically migrated and keep their room assignments.

### Added

- Two-stage stale-cache sweep:
  - **Stage 1 (per-controller):** after each controller's first successful poll with ≥1 zone, removes its v2-stamped accessories that no longer match any zone. A controller returning zero zones skips its own sweep (prevents false-positive wipes during transient outages).
  - **Stage 2 (global):** after every controller has had a first successful poll AND at least one returned ≥1 zone, removes legacy v1 accessories that weren't adopted by any controller.
- Stagger multi-controller polling start so steady-state requests stay spread across the poll interval.
- `APIEvent.SHUTDOWN` cleanup of `setInterval` / `setTimeout` handles.
- Vitest test suite (25 cases) covering stable-key math, migration paths, bug-fix regression, sweep gating, polling resilience, and shutdown cleanup.

### Changed

- Engine: `homebridge ^1.6.0 || ^2.0.0`, `node ^18.20 || ^20.18 || ^22.12 || ^24`. Recent HB 1.x users remain supported.
- Toolchain bumped to TypeScript 6, ESLint v10 (flat config), `typescript-eslint` v8 unified, Prettier 3, rimraf 6, nodemon 3.
- Characteristic handlers converted to Promise-based `.onSet`. Throws `HapStatusError(SERVICE_COMMUNICATION_FAILURE)` on underlying API failures.
- All internal callbacks/promise-chains rewritten to async/await.
- Config parsing extracted to `src/HydrawiseConfig.ts` — invalid values are logged and ignored (preserves v1's lenient behavior).
- Polling per controller wrapped in try/catch — one failing poll logs and returns without disrupting others.
- Repository URL switched from `git://` to `https://`.

### Removed

- `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` (subsumed by the unified `typescript-eslint` package).
- Legacy `setInterval` import from `timers` (it's a global).
- Old `.eslintrc` (replaced by `eslint.config.mjs` flat config).
- `preferGlobal: true` (legacy npm cruft).

### Migration notes

See the README "Upgrading from v1.x" section for the corner-case scenarios where a one-time room reassignment may occur (LOCAL controller swap / IP change, LOCAL ↔ CLOUD type flip, Hydrawise-side zone rename before upgrade). Hydrawise depends on `hydrawise-api@^2.0.0` (also a major-bump release; see its CHANGELOG).

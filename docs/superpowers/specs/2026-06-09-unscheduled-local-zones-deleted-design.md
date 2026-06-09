# Design: Fix #42 — unscheduled LOCAL valves deleted on stop

**Date:** 2026-06-09
**Issue:** [#42 — None scheduled Zones get deleted](https://github.com/martijndierckx/homebridge-hydrawise/issues/42)
**Status:** Approved design — ready for implementation plan

## Problem

On a LOCAL connection, valves that are **configured but not in any watering
schedule** (e.g. the reporter's "Wasserhahn" and "Dusche") disappear from
HomeKit shortly after they stop running. Manually starting such a valve makes it
appear; stopping it deletes the accessory — losing its room and automation
bindings. This is a regression in the 2.0.x line.

### Root cause (confirmed from live `get_sched_json.php` output)

For the LOCAL API, a relay's `type` field encodes **scheduling state**, not
program type:

- `type` 6 / 9 → relay has a watering schedule
- `type` 110 → relay has **no** schedule — this covers *both* genuinely-empty
  slots *and* real, configured valves the user simply hasn't scheduled

`hydrawise-api`'s `parseZones()` drops every relay with `type === 110`
(LOCAL only). So an unscheduled valve is filtered out of every idle poll. When
manually started the controller moves it out of the `type:110` idle state, so it
reappears and the plugin creates an accessory; when it stops it reverts to
`type:110`, vanishes from the next poll, and the plugin's `reconcile()`
hard-deletes the accessory.

The per-poll deletion in `reconcile()` is not itself new (v1 did the same). The
regression is the `type === 110` filter — which replaced an earlier, equally
lossy `lastwaterepoch !== 0` filter. Neither single field can distinguish a
configured-unscheduled valve from an empty slot:

| relay | name | type | lastwaterepoch | normalRuntime | timestr | desired |
|------:|------|-----:|---------------:|--------------:|---------|---------|
| 4 | Wasserhahn | 110 | 1781029504 | 45 | "" | keep |
| 8 | Dusche | 110 | 1781029504 | 15 | "" | keep |
| 10 | Beet | 110 | 0 | 0 | "" | (empty) |
| 11 | Zone 11 | 110 | 0 | 60 | "" | (empty) |
| 1,2,3,5,6,7 | scheduled | 9 | nonzero | 45 | "02:00"… | keep |
| 9 | Hecke | 6 | nonzero | 60 | "10:00" | keep |

CLOUD is unaffected — `parseZones()` applies **no** filter to CLOUD responses
(the cloud API pre-filters to configured zones).

## Decision

Stop guessing which `type:110` relays are "empty". **Surface all LOCAL relays**
and let the user curate the list via config. This is a LOCAL-only change; CLOUD
behaviour is unchanged.

Rejected alternatives:
- Heuristic empty-slot detection (default `Zone N` name + all-zero config):
  fragile, locale/firmware dependent, and reintroduces the guessing we're trying
  to remove.
- Dynamic custom Homebridge UI listing detected valves with checkboxes: much
  larger build (separate `homebridge-ui` server + frontend handling
  credentials); deferred, not needed to fix the bug.
- Exclude by `relay_id`: rejected because `relay_id` is not reliably unique in
  the LOCAL response (observed duplicate: relay 4 and relay 11 share
  `relay_id` 6408537). Use the physical `relay` **number** instead.

## Changes

### 1. `hydrawise-api` (separate repo — LOCAL only)

Remove the `type === 110` filter in `parseZones()`. All LOCAL relays become
zones, including empty slots. CLOUD path untouched. Ship as a new `hydrawise-api`
patch release; this plugin bumps its dependency to pull it in.

Consequence: empty slots (e.g. "Zone 11") now appear in HomeKit by default until
excluded — handled by change #2.

### 2. Plugin — relay exclusion config

A list of `relay` **numbers** to exclude, e.g. `"exclude_relays": [11]`.

- **`HydrawiseConfig.ts`** — parse `exclude_relays` into `excludeRelays: number[]`.
  Non-numbers are logged and ignored (consistent with existing lenient parsing).
  Absent/empty → `[]`.
- **`HydrawisePlatform.reconcile()`** — in the per-zone loop, branch on exclusion
  **before** the adopt/create logic. For a zone whose `zone.zone` (relay number)
  is in `excludeRelays`:
  - never wrap/create a sprinkler for it, and
  - **actively remove any accessory that already exists for it**, so the relay
    leaves HomeKit rather than lingering as a ghost. This covers all entry
    states:
    - an active sprinkler (relay was previously included) → `unregister()` +
      drop from `sprinklers`;
    - a **cached accessory restored on reboot** (`configureAccessory()` populated
      `this.accessories`, but the relay is now excluded) → locate it via the
      existing `findCachedAccessory` three-step match (PRIMARY stableKey,
      SECONDARY/TERTIARY name) and `unregisterPlatformAccessories`, dropping it
      from `this.accessories`.

  Because the API now surfaces **all** LOCAL relays every poll, an excluded relay
  is always present in the live zone list, so this branch reliably fires after a
  reboot. **Reboot requirement (explicit):** after restarting Homebridge with a
  relay number newly added to `exclude_relays`, that relay's cached accessory
  MUST be unregistered on the first reconcile — verified by test.
- **`config.schema.json`** — add an `exclude_relays` array-of-numbers field under
  "Advanced Settings". The label and help text must make the **LOCAL-only** scope
  explicit so users don't expect it to affect CLOUD:
  - **title:** `Excluded zones (LOCAL only)`
  - **description:** `LOCAL connections only. Relay numbers to hide from HomeKit
    — e.g. empty/unused relay slots. Use the number shown in the "DETECTED ZONES"
    log on Homebridge startup (the [N] value). Has no effect on CLOUD
    connections.`
  - The field is shown only when `model.type == 'LOCAL'` (mirrors the existing
    `host`/`user` LOCAL conditions in the form), so it doesn't surface for CLOUD
    setups at all.
- **Scope:** LOCAL is single-controller, so relay numbers are unambiguous. The
  field is harmless if set on CLOUD but is documented as a LOCAL feature.

### 3. Plugin — startup zone discovery log

After a controller's **first successful poll**, emit one grouped info block
(once per controller, not per-poll):

```
DETECTED ZONES:
- [1] - Garden
- [11] - Zone 11
```

`[N]` is the relay number to put in `exclude_relays`.

### 4. Plugin — debounce removal (both connection types)

In `reconcile()`, do not delete on a single missed poll. Track consecutive
misses per sprinkler and only `unregister()` after **3 consecutive** missed
polls. Protects every zone's HomeKit bindings against transient API/network
blips. (With the filter removed, type:110 valves no longer miss polls, so this
is a general safety net rather than the primary fix.)

## Testing (Vitest)

- `HydrawiseConfig.test.ts` — `exclude_relays` parsing: valid list, invalid
  entries ignored+logged, absent → `[]`.
- `reconcile` / `staleSweep.test.ts`:
  - excluded relay number is never registered;
  - **reboot path:** a cached accessory (present in `this.accessories` via
    `configureAccessory`, no live sprinkler) whose relay number is in
    `exclude_relays` is unregistered on the first reconcile;
  - an active sprinkler whose relay is added to the exclude list is removed on
    next reconcile;
  - a zone missing for < 3 polls survives; missing for ≥ 3 polls is removed.
- Characterization: a LOCAL `type:110` zone with a real name produces an
  accessory (guards against the filter regression returning).

## Defaults

- Config key: `exclude_relays`
- Debounce threshold: 3 consecutive missed polls

## Coordination / sequencing

The complete fix needs both repos:
1. `hydrawise-api`: remove LOCAL `type === 110` filter → patch release.
2. `homebridge-hydrawise`: bump `hydrawise-api`, add `exclude_relays`, the
   DETECTED ZONES log, and reconcile debounce → patch/minor release.

The plugin-side changes (exclusion + debounce + log) are valuable independently,
but unscheduled valves only become *discoverable without a manual run* once the
API filter is removed.

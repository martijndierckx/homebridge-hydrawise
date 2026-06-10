# Issue #42 — Unscheduled LOCAL Zones Deleted: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop LOCAL configured-but-unscheduled valves from being deleted from HomeKit when they stop running, and let users hide unwanted relays by number.

**Architecture:** Two repos. (A) `hydrawise-api` (`~/hydrawise-api`) drops the lossy LOCAL `type === 110` filter so all relays surface. (B) `homebridge-hydrawise` (`~/homebridge-hydrawise`) adds an `exclude_relays` config list (relay numbers), removes excluded relays' accessories even after a reboot, debounces per-poll accessory removal (3 consecutive misses), and logs a grouped `DETECTED ZONES` block on startup. CLOUD behaviour is unchanged throughout.

**Tech Stack:** TypeScript, Vitest, Homebridge dynamic platform plugin API.

**Spec:** [docs/superpowers/specs/2026-06-09-unscheduled-local-zones-deleted-design.md](../specs/2026-06-09-unscheduled-local-zones-deleted-design.md)

---

## File Structure

**Repo A — `~/hydrawise-api`:**
- Modify: `src/Hydrawise.ts` (`parseZones` — remove LOCAL `type === 110` filter)
- Modify: `test/parseLocalStatus.test.ts` (flip the exclusion assertion)
- Modify: `package.json` (version bump)

**Repo B — `~/homebridge-hydrawise`:**
- Modify: `src/HydrawiseConfig.ts` (parse `exclude_relays` → `excludeRelays: number[]`)
- Modify: `src/settings.ts` (add `MAX_MISSED_POLLS`)
- Modify: `src/HydrawiseSprinkler.ts` (add `missedPolls` counter)
- Modify: `src/HydrawisePlatform.ts` (exclusion removal, debounce, DETECTED ZONES log)
- Modify: `config.schema.json` (LOCAL-only `exclude_relays` field)
- Modify: `package.json` (bump `hydrawise-api` dep + plugin version)
- Test: `test/unit/HydrawiseConfig.test.ts`, `test/platform/exclusion.test.ts` (new), `test/platform/debounce.test.ts` (new), `test/platform/detectedZones.test.ts` (new)

---

# PART A — `hydrawise-api` (surface all LOCAL relays)

> All Part A commands run in `~/hydrawise-api`.

## Task A1: Remove the LOCAL `type === 110` filter

**Files:**
- Modify: `test/parseLocalStatus.test.ts:10-16`
- Modify: `src/Hydrawise.ts:214-224`

- [ ] **Step 1: Update the existing test to assert the new behavior**

In `test/parseLocalStatus.test.ts`, replace the first `it(...)` block (currently "excludes relays with type == 110") with:

```ts
  it('includes relays with type == 110 (unscheduled / empty slots now surfaced)', async () => {
    setupFetchMock(localFixture);
    const h = new Hydrawise({ type: HydrawiseConnectionType.LOCAL, host: 'h', password: 'p' });
    const zones = await h.getZones();
    expect(zones).toHaveLength(3);
    expect(zones.map((z) => z.name)).toEqual(['Front Lawn', 'Back Lawn', 'Zone 3']);
  });
```

(The fixture `test/fixtures/local-get-sched.json` already contains a third relay "Zone 3" with `type: 110`, relay 3 — no fixture change needed.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/parseLocalStatus.test.ts -t "includes relays with type"`
Expected: FAIL — `expected length 2 to be 3` (the filter still drops Zone 3).

- [ ] **Step 3: Remove the filter**

In `src/Hydrawise.ts`, inside `parseZones`, delete the filter block so the loop becomes:

```ts
    for (const z of data.relays) {
      const init = this.zoneFromRow(z, data.time, running, controller);
      zones.push(new HydrawiseZone(init));
    }
```

(Remove the `// LOCAL responses include all relay slots...` comment block and the `if (this.type === HydrawiseConnectionType.LOCAL && z.type === 110) { continue; }` statement.)

- [ ] **Step 4: Run the full local-status suite**

Run: `npx vitest run test/parseLocalStatus.test.ts`
Expected: PASS (all cases, including the never-watered `lastwaterepoch=0` regression test which still holds).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: completes with no TypeScript errors.

- [ ] **Step 6: Bump version**

In `package.json`, bump the patch version (e.g. `2.0.1` → `2.0.2`). Note the new version string — Part B Task B8 pins it.

- [ ] **Step 7: Commit**

```bash
git add src/Hydrawise.ts test/parseLocalStatus.test.ts package.json
git commit -m "fix: surface all LOCAL relays — drop type===110 filter (homebridge-hydrawise#42)"
```

---

# PART B — `homebridge-hydrawise` (exclusion, debounce, discovery log)

> All Part B commands run in `~/homebridge-hydrawise`, on branch `fix/issue-42-unscheduled-zones`.

## Task B1: Parse `exclude_relays` config

**Files:**
- Modify: `src/HydrawiseConfig.ts:4-12` (interface) and `:38-65` (parser)
- Test: `test/unit/HydrawiseConfig.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/HydrawiseConfig.test.ts` inside the `describe('parseConfig', ...)` block:

```ts
  it('parses exclude_relays into a number array', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3, 11] } as any, log as any);
    expect(cfg.excludeRelays).toEqual([3, 11]);
  });

  it('defaults exclude_relays to an empty array when absent', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p' } as any, log as any);
    expect(cfg.excludeRelays).toEqual([]);
  });

  it('warns and drops invalid exclude_relays entries', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3, 'x', -1, 2.5] } as any, log as any);
    expect(cfg.excludeRelays).toEqual([3]);
    expect(log.lines.some((l) => l.level === 'warn' && l.msg.includes('exclude_relays'))).toBe(true);
  });

  it('warns and ignores exclude_relays when not an array', () => {
    const log = new MockLogger();
    const cfg = parseConfig({ platform: 'X', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: 'nope' } as any, log as any);
    expect(cfg.excludeRelays).toEqual([]);
    expect(log.lines.some((l) => l.level === 'warn' && l.msg.includes('exclude_relays'))).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/HydrawiseConfig.test.ts -t "exclude_relays"`
Expected: FAIL — `cfg.excludeRelays` is `undefined`.

- [ ] **Step 3: Add the field to the interface**

In `src/HydrawiseConfig.ts`, add to `ParsedHydrawiseConfig`:

```ts
  excludeRelays: number[];
```

- [ ] **Step 4: Initialize the default and parse**

In `parseConfig`, add `excludeRelays: []` to the initial `parsed` object literal, then add this block before `return parsed;`:

```ts
  if (raw['exclude_relays'] !== undefined) {
    if (Array.isArray(raw['exclude_relays'])) {
      for (const v of raw['exclude_relays']) {
        if (typeof v === 'number' && Number.isInteger(v) && v > 0) {
          parsed.excludeRelays.push(v);
        } else {
          log.warn(`[CONFIG] Ignoring invalid exclude_relays entry (expected a positive relay number): ${String(v)}`);
        }
      }
    } else {
      log.warn(`[CONFIG] Ignoring invalid exclude_relays (must be an array of relay numbers): ${String(raw['exclude_relays'])}`);
    }
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/unit/HydrawiseConfig.test.ts`
Expected: PASS (new and existing cases).

- [ ] **Step 6: Commit**

```bash
git add src/HydrawiseConfig.ts test/unit/HydrawiseConfig.test.ts
git commit -m "feat: parse exclude_relays config into excludeRelays number[]"
```

---

## Task B2: Add the debounce constant

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Add the constant**

Append to `src/settings.ts`:

```ts
/** Consecutive missed polls a zone must be absent for before its accessory is removed. */
export const MAX_MISSED_POLLS = 3;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/settings.ts
git commit -m "chore: add MAX_MISSED_POLLS debounce constant"
```

---

## Task B3: Add a per-sprinkler missed-poll counter

**Files:**
- Modify: `src/HydrawiseSprinkler.ts:17-25`

- [ ] **Step 1: Add the field**

In `src/HydrawiseSprinkler.ts`, add a public field to the `HydrawiseSprinkler` class alongside the other public fields (after `public zone: HydrawiseZone;`):

```ts
  /** Consecutive polls this sprinkler's zone has been absent from its controller. Reset to 0 when seen. */
  public missedPolls = 0;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/HydrawiseSprinkler.ts
git commit -m "chore: add missedPolls counter to HydrawiseSprinkler"
```

---

## Task B4: Exclude relays in reconcile (incl. reboot removal)

**Files:**
- Modify: `src/HydrawisePlatform.ts` (`reconcile`, lines ~209-249; add `removeExcludedZone` helper)
- Test: `test/platform/exclusion.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `test/platform/exclusion.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockHydrawiseController, MockHydrawiseZone } from '../mocks/mockHydrawiseApi';
import { createMockApi, MockLogger, APIEvent, MockPlatformAccessory } from '../mocks/mockHomebridgeApi';

const controllerHolder: { controllers: MockHydrawiseController[]; type: 'LOCAL' | 'CLOUD' } = {
  controllers: [],
  type: 'LOCAL'
};

vi.mock('hydrawise-api', async () => {
  const { MockHydrawiseZone: Z, MockHydrawiseController: C } = await import('../mocks/mockHydrawiseApi');
  class HydrawiseMockClass {
    public type: 'LOCAL' | 'CLOUD';
    constructor() {
      this.type = controllerHolder.type;
    }
    async getControllers() {
      return controllerHolder.controllers;
    }
  }
  return {
    Hydrawise: HydrawiseMockClass,
    HydrawiseConnectionType: { LOCAL: 'LOCAL', CLOUD: 'CLOUD' },
    HydrawiseZone: Z,
    HydrawiseController: C
  };
});

import { HydrawisePlatform } from '../../src/HydrawisePlatform';

const tick = (n = 8) =>
  Array.from({ length: n }, () => new Promise<void>((r) => setImmediate(r))).reduce((p, q) => p.then(() => q), Promise.resolve());

function stampedV2(api: any, name: string, stableKey: string, controllerKey: string, zoneNumber: number) {
  const a = new MockPlatformAccessory(name, api.hap.uuid.generate(stableKey));
  a.addService(api.hap.Service.Valve, 'Sprinkler');
  a.context = { schemaVersion: 2, connectionType: 'LOCAL', controllerKey, zoneName: name, stableKey, zoneNumber };
  return a;
}

describe('exclude_relays', () => {
  beforeEach(() => {
    controllerHolder.controllers = [];
    controllerHolder.type = 'LOCAL';
  });

  it('never registers an excluded relay', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden'), new MockHydrawiseZone(1003, 3, 'Zone 3')]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3] } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    const names = platform.accessories.map((a) => a.displayName);
    expect(names).toContain('Garden');
    expect(names).not.toContain('Zone 3');
  });

  it('removes a cached accessory on reboot when its relay is now excluded', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    // Simulate reboot: "Zone 3" was registered previously and is restored from cache.
    const cached = stampedV2(api, 'Zone 3', 'local:h:3', 'h', 3);
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden'), new MockHydrawiseZone(1003, 3, 'Zone 3')]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3] } as any,
      api as any
    );
    platform.configureAccessory(cached as any);
    expect(platform.accessories.map((a) => a.displayName)).toContain('Zone 3');

    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    expect(platform.accessories.map((a) => a.displayName)).not.toContain('Zone 3');
    expect(api.unregistered.some((a: any) => a.displayName === 'Zone 3')).toBe(true);
  });

  it('removes an active sprinkler whose relay becomes excluded across polls', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    // Same zone list both polls; exclusion is configured from the start, so it must be gone after poll 1.
    c.pushZones([new MockHydrawiseZone(1003, 3, 'Zone 3')]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3] } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();

    expect(platform.accessories.map((a) => a.displayName)).not.toContain('Zone 3');
  });
});
```

> **Note:** The mock API (`test/mocks/mockHomebridgeApi.ts`) already exposes a flat `unregistered: MockPlatformAccessory[]` populated by `unregisterPlatformAccessories` — no mock changes needed.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/platform/exclusion.test.ts`
Expected: FAIL — excluded "Zone 3" is still registered (no exclusion logic yet).

- [ ] **Step 3: Implement exclusion in reconcile**

In `src/HydrawisePlatform.ts`, replace the start of `reconcile` (the line `let toCheckSprinklers = ...`) so excluded zones are handled and stripped first:

```ts
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
```

(Only the loop header changes from `for (const zone of zones)` to `for (const zone of activeZones)`; the loop body is unchanged.)

- [ ] **Step 4: Add the `removeExcludedZone` helper**

In `src/HydrawisePlatform.ts`, add this method (e.g. directly after `reconcile`):

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/platform/exclusion.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 6: Run the full suite (guard against regressions in the sweep/reconcile)**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/HydrawisePlatform.ts test/platform/exclusion.test.ts
git commit -m "feat: exclude_relays — skip and unregister excluded relays incl. on reboot"
```

---

## Task B5: Debounce per-poll accessory removal

**Files:**
- Modify: `src/HydrawisePlatform.ts` (`reconcile` — existing-match reset + removal loop, lines ~218-248)
- Test: `test/platform/debounce.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `test/platform/debounce.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockHydrawiseController, MockHydrawiseZone } from '../mocks/mockHydrawiseApi';
import { createMockApi, MockLogger, APIEvent } from '../mocks/mockHomebridgeApi';

const controllerHolder: { controllers: MockHydrawiseController[]; type: 'LOCAL' | 'CLOUD' } = {
  controllers: [],
  type: 'LOCAL'
};

vi.mock('hydrawise-api', async () => {
  const { MockHydrawiseZone: Z, MockHydrawiseController: C } = await import('../mocks/mockHydrawiseApi');
  class HydrawiseMockClass {
    public type: 'LOCAL' | 'CLOUD';
    constructor() {
      this.type = controllerHolder.type;
    }
    async getControllers() {
      return controllerHolder.controllers;
    }
  }
  return {
    Hydrawise: HydrawiseMockClass,
    HydrawiseConnectionType: { LOCAL: 'LOCAL', CLOUD: 'CLOUD' },
    HydrawiseZone: Z,
    HydrawiseController: C
  };
});

import { HydrawisePlatform } from '../../src/HydrawisePlatform';

const tick = (n = 8) =>
  Array.from({ length: n }, () => new Promise<void>((r) => setImmediate(r))).reduce((p, q) => p.then(() => q), Promise.resolve());

describe('removal debounce', () => {
  beforeEach(() => {
    controllerHolder.controllers = [];
    controllerHolder.type = 'LOCAL';
  });

  it('keeps a zone that is missing for fewer than MAX_MISSED_POLLS polls', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    // poll 1: present, poll 2: absent, poll 3: absent (2 consecutive misses < 3)
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden')]);
    c.pushZones([]);
    c.pushZones([]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick(); // poll 1
    await (platform as any).pollOnce(c); // poll 2 (miss 1)
    await (platform as any).pollOnce(c); // poll 3 (miss 2)

    expect(platform.accessories.map((a) => a.displayName)).toContain('Garden');
  });

  it('removes a zone after MAX_MISSED_POLLS consecutive misses', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden')]);
    c.pushZones([]);
    c.pushZones([]);
    c.pushZones([]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick(); // poll 1: present
    await (platform as any).pollOnce(c); // miss 1
    await (platform as any).pollOnce(c); // miss 2
    await (platform as any).pollOnce(c); // miss 3 -> removed

    expect(platform.accessories.map((a) => a.displayName)).not.toContain('Garden');
  });

  it('resets the miss counter when a zone reappears', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    const garden = new MockHydrawiseZone(1001, 1, 'Garden');
    c.pushZones([garden]); // poll 1 present
    c.pushZones([]); // miss 1
    c.pushZones([]); // miss 2
    c.pushZones([garden]); // present -> reset
    c.pushZones([]); // miss 1
    c.pushZones([]); // miss 2
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p' } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();
    for (let i = 0; i < 5; i++) await (platform as any).pollOnce(c);

    // After reset, only 2 consecutive misses — still present.
    expect(platform.accessories.map((a) => a.displayName)).toContain('Garden');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/platform/debounce.test.ts`
Expected: FAIL — "Garden" is removed on the first miss (current code deletes immediately).

- [ ] **Step 3: Import the constant**

In `src/HydrawisePlatform.ts`, add `MAX_MISSED_POLLS` to the existing import from `./settings`:

```ts
import {
  DEFAULT_POLLING_INTERVAL_CLOUD,
  DEFAULT_POLLING_INTERVAL_LOCAL,
  ACCESSORY_CONTEXT_SCHEMA_VERSION,
  MAX_MISSED_POLLS,
  PLUGIN_NAME,
  PLATFORM_NAME
} from './settings';
```

- [ ] **Step 4: Reset the counter on a match**

In `reconcile`, in the existing-sprinkler branch (where `existingSprinkler !== undefined`), add a reset right after `existingSprinkler.update(zone);`:

```ts
        existingSprinkler.update(zone);
        existingSprinkler.missedPolls = 0;
```

- [ ] **Step 5: Debounce the removal loop**

In `reconcile`, replace the final removal loop:

```ts
    // Per-poll removal of zones that disappeared mid-life on THIS controller.
    for (const sprinkler of toCheckSprinklers) {
      this.log.info(`Removing Sprinkler for deleted Hydrawise zone: ${sprinkler.zone.name}`);
      sprinkler.unregister();
      this.sprinklers = this.sprinklers.filter((s) => s !== sprinkler);
    }
```

with a debounced version:

```ts
    // Per-poll: zones absent from THIS controller's poll. Debounce removal so a transient
    // disappearance doesn't destroy the accessory (and its HomeKit room/automation bindings).
    for (const sprinkler of toCheckSprinklers) {
      sprinkler.missedPolls += 1;
      if (sprinkler.missedPolls >= MAX_MISSED_POLLS) {
        this.log.info(`Removing Sprinkler for deleted Hydrawise zone: ${sprinkler.zone.name}`);
        sprinkler.unregister();
        this.sprinklers = this.sprinklers.filter((s) => s !== sprinkler);
      } else {
        this.log.debug(
          `Zone '${sprinkler.zone.name}' absent from poll (${sprinkler.missedPolls}/${MAX_MISSED_POLLS}) — keeping for now`
        );
      }
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run test/platform/debounce.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS. If a pre-existing test asserted immediate single-poll removal, update it to poll `MAX_MISSED_POLLS` times (the new contract) and note the change in the commit.

- [ ] **Step 8: Commit**

```bash
git add src/HydrawisePlatform.ts test/platform/debounce.test.ts
git commit -m "feat: debounce accessory removal (3 consecutive missed polls)"
```

---

## Task B6: Log a grouped DETECTED ZONES block on first poll

**Files:**
- Modify: `src/HydrawisePlatform.ts` (`pollOnce`, lines ~127-145; add `logDetectedZones` helper)
- Test: `test/platform/detectedZones.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `test/platform/detectedZones.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockHydrawiseController, MockHydrawiseZone } from '../mocks/mockHydrawiseApi';
import { createMockApi, MockLogger, APIEvent } from '../mocks/mockHomebridgeApi';

const controllerHolder: { controllers: MockHydrawiseController[]; type: 'LOCAL' | 'CLOUD' } = {
  controllers: [],
  type: 'LOCAL'
};

vi.mock('hydrawise-api', async () => {
  const { MockHydrawiseZone: Z, MockHydrawiseController: C } = await import('../mocks/mockHydrawiseApi');
  class HydrawiseMockClass {
    public type: 'LOCAL' | 'CLOUD';
    constructor() {
      this.type = controllerHolder.type;
    }
    async getControllers() {
      return controllerHolder.controllers;
    }
  }
  return {
    Hydrawise: HydrawiseMockClass,
    HydrawiseConnectionType: { LOCAL: 'LOCAL', CLOUD: 'CLOUD' },
    HydrawiseZone: Z,
    HydrawiseController: C
  };
});

import { HydrawisePlatform } from '../../src/HydrawisePlatform';

const tick = (n = 8) =>
  Array.from({ length: n }, () => new Promise<void>((r) => setImmediate(r))).reduce((p, q) => p.then(() => q), Promise.resolve());

describe('DETECTED ZONES log', () => {
  beforeEach(() => {
    controllerHolder.controllers = [];
    controllerHolder.type = 'LOCAL';
  });

  it('logs a grouped block listing every detected relay (including excluded) once', async () => {
    const api = createMockApi();
    const log = new MockLogger();
    const c = new MockHydrawiseController(undefined, 'http://h/', 'h');
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden'), new MockHydrawiseZone(1003, 3, 'Zone 3')]);
    c.pushZones([new MockHydrawiseZone(1001, 1, 'Garden'), new MockHydrawiseZone(1003, 3, 'Zone 3')]);
    controllerHolder.controllers = [c];

    const platform = new HydrawisePlatform(
      log as any,
      { platform: 'HydrawisePlatform', name: 'H', type: 'LOCAL', host: 'h', password: 'p', exclude_relays: [3] } as any,
      api as any
    );
    api.emit(APIEvent.DID_FINISH_LAUNCHING);
    await tick();
    await (platform as any).pollOnce(c); // second poll must NOT log the block again

    const infos = log.lines.filter((l) => l.level === 'info').map((l) => l.msg);
    expect(infos.filter((m) => m === 'DETECTED ZONES:')).toHaveLength(1);
    expect(infos).toContain('- [1] - Garden');
    expect(infos).toContain('- [3] - Zone 3'); // excluded relays still listed so users can find the number
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/platform/detectedZones.test.ts`
Expected: FAIL — no `DETECTED ZONES:` line is logged.

- [ ] **Step 3: Call the logger on the first successful poll**

In `src/HydrawisePlatform.ts`, in `pollOnce`, inside the `if (isFirstSuccessfulPoll) { ... }` block, add a call right after `this.firstPollZoneCount.set(controllerKey, zones.length);`:

```ts
        this.logDetectedZones(zones);
```

(Pass the raw `zones` from `controller.getZones()` — i.e. before exclusion — so users can see the numbers of relays they may want to exclude.)

- [ ] **Step 4: Add the `logDetectedZones` helper**

In `src/HydrawisePlatform.ts`, add:

```ts
  /** One-time grouped log of all relays a controller reported, so users can find the number to put in exclude_relays. */
  private logDetectedZones(zones: HydrawiseZone[]): void {
    if (zones.length === 0) return;
    const lines = ['DETECTED ZONES:', ...zones.map((z) => `- [${z.zone}] - ${z.name}`)];
    for (const line of lines) this.log.info(line);
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/platform/detectedZones.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/HydrawisePlatform.ts test/platform/detectedZones.test.ts
git commit -m "feat: log grouped DETECTED ZONES block on first poll"
```

---

## Task B7: Add the LOCAL-only `exclude_relays` config field

**Files:**
- Modify: `config.schema.json`

- [ ] **Step 1: Add the property**

In `config.schema.json`, add to `schema.properties` (after `running_time`):

```json
      "exclude_relays": {
        "title": "Excluded zones (LOCAL only)",
        "type": "array",
        "items": {
          "type": "integer",
          "minimum": 1
        },
        "description": "LOCAL connections only. Relay numbers to hide from HomeKit — e.g. empty/unused relay slots. Use the number shown in the \"DETECTED ZONES\" log on Homebridge startup (the [N] value). Has no effect on CLOUD connections."
      }
```

- [ ] **Step 2: Add it to the form, gated on LOCAL**

In `config.schema.json`, add an entry to the "Advanced Settings" fieldset `items` array (after the `polling_interval` entry):

```json
        {
          "key": "exclude_relays",
          "type": "array",
          "condition": {
            "functionBody": "return model.type == 'LOCAL'"
          },
          "items": {
            "title": "Relay number",
            "type": "number"
          }
        }
```

- [ ] **Step 3: Validate the JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('config.schema.json','utf8')); console.log('valid json')"`
Expected: prints `valid json`.

- [ ] **Step 4: Commit**

```bash
git add config.schema.json
git commit -m "feat: add LOCAL-only exclude_relays field to config schema"
```

---

## Task B8: Bump dependency + plugin version, update CHANGELOG, build

**Files:**
- Modify: `package.json` (dep + version)
- Modify: `CHANGELOG.md` (if present)

- [ ] **Step 1: Pin the new hydrawise-api version**

In `package.json`, set the `hydrawise-api` dependency to the version published in Part A Task A1 Step 6 (e.g. `^2.0.2`). Then install:

Run: `npm install`
Expected: lockfile updates; `node_modules/hydrawise-api/package.json` shows the new version.

> If `hydrawise-api` isn't yet published to npm, install from the local build instead: `npm install ~/hydrawise-api` (or `npm link`), and note in the commit that the registry bump follows once published.

- [ ] **Step 2: Bump the plugin version**

In `package.json`, bump the plugin version (e.g. `2.0.3` → `2.1.0` — new `exclude_relays` feature warrants a minor).

- [ ] **Step 3: Update CHANGELOG**

If `CHANGELOG.md` exists, add an entry:

```markdown
## 2.1.0
- Fix (#42): LOCAL valves that aren't in a watering schedule are no longer deleted from HomeKit when they stop running (requires hydrawise-api ≥ 2.0.2, which surfaces all LOCAL relays).
- Add: `exclude_relays` config option (LOCAL only) to hide relays by number; see the new "DETECTED ZONES" startup log for the numbers.
- Improve: accessory removal is now debounced (3 consecutive missed polls) so transient API blips no longer drop zones.
```

- [ ] **Step 4: Build and run the full suite**

Run: `npm run build && npx vitest run`
Expected: build succeeds; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: bump hydrawise-api dep and release v2.1.0 (fixes #42)"
```

---

## Final verification

- [ ] **Run both suites green**

Run (Part A): `cd ~/hydrawise-api && npx vitest run`
Run (Part B): `cd ~/homebridge-hydrawise && npm run build && npx vitest run`
Expected: all green.

- [ ] **Manual smoke (optional, against a real LOCAL controller)**

Start Homebridge with `-D`, confirm:
- the `DETECTED ZONES:` block lists all relays with `[number] - name`;
- an unscheduled valve (e.g. relay 4) appears and is NOT deleted after it stops;
- adding its relay number to `exclude_relays` and restarting removes it from HomeKit.

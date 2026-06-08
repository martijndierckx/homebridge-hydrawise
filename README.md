# homebridge-hydrawise

A [Homebridge](https://github.com/homebridge/homebridge) plugin that exposes [Hydrawise](https://hydrawise.com) irrigation zones as HomeKit Valve accessories.

Supported on Homebridge **1.6.0+** and **2.0**, with Node.js 18.20+, 20.18+, 22.12+ or 24+.

## Installation

1. Install Homebridge: `npm install -g homebridge`
2. Install this plugin: `npm install -g homebridge-hydrawise`
3. Configure as a platform — see below.

## Configuration

```jsonc
{
  "platforms": [
    {
      "platform": "HydrawisePlatform",
      "name": "Hydrawise",
      "type": "CLOUD",
      "api_key": "YOUR API KEY"
    }
  ]
}
```

For a local connection:

```jsonc
{
  "platforms": [
    {
      "platform": "HydrawisePlatform",
      "name": "Hydrawise",
      "type": "LOCAL",
      "host": "192.168.1.10",
      "password": "YOUR CONTROLLER PASSWORD"
    }
  ]
}
```

### Fields

| Field | Required | Description |
|---|---|---|
| `platform` | yes | Must be `"HydrawisePlatform"`. |
| `name` | yes | Any display name. |
| `type` | yes | `"CLOUD"` or `"LOCAL"`. Prefer LOCAL when possible — no rate-limit (HTTP 429) and no command delays. LOCAL requires controller firmware below v3.0.0. |
| `api_key` | CLOUD | From "Account Details" on the [Hydrawise platform](https://app.hydrawise.com/config/account/details). |
| `host` | LOCAL | Controller hostname or IP. **Use a static IP or mDNS hostname** — see Upgrading from v1.x below. |
| `user` | no | LOCAL only. Defaults to `admin`. |
| `password` | LOCAL | Controller password (from the controller's web UI settings). |
| `polling_interval` | no | Milliseconds. Defaults: 1000 (LOCAL), 12000 × controller count (CLOUD). Minimum 200. |
| `running_time` | no | Seconds. Overrides the configured run time when HomeKit triggers a zone. |

## Upgrading from v1.x

v2 fixes the long-standing **"General room" bug**: after a Hydrawise controller restarts, zones now stay in their assigned HomeKit rooms instead of reappearing in the "General" room. The upgrade is automatic for most setups — existing accessories are adopted and their room assignments are preserved.

Documented one-time room reassignments may occur in these corner cases:

- **LOCAL controller swap** — replacing the controller (new serial number) or changing the host (DHCP-assigned IP changed) yields a new identity. Recommendation: pin a static IP for your controller, or use an mDNS hostname.
- **Switching `type` from LOCAL ↔ CLOUD** — accessories for the same physical zone get different identities under the two connection modes (intentional, since cloud zone layout may not match local). Old accessories are removed after the first successful poll under the new mode.
- **Zone renamed in the Hydrawise UI before upgrading** — the migration uses the zone name as a fallback identifier. Renaming the zone in *HomeKit* does NOT cause this; only renames on the Hydrawise side.

## Notes

- HomeKit caps the displayed `RemainingDuration` at 3600 seconds (1 hour). Runs longer than that still complete fully; only the displayed countdown is truncated.
- Multi-controller cloud accounts have their polling staggered automatically so requests don't all fire at once.
- New controllers added in Hydrawise after Homebridge has started require a Homebridge restart to be detected.
- Bug reports: <https://github.com/martijndierckx/homebridge-hydrawise/issues>

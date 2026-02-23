# Match Stats API — IW4MAdmin Plugin

A JavaScript plugin for [IW4MAdmin](https://github.com/RaidMax/IW4M-Admin) that collects per-match player statistics (kills, deaths, damage, score, team) and POSTs them to an external API when each match ends.

## Installation

1. Copy `MatchStatsAPI.js` into your IW4MAdmin **Plugins** folder.
2. Start (or restart) IW4MAdmin — the plugin loads automatically and writes its default configuration on first run.
3. Edit the configuration to point at your API (see below), then reload or restart IW4MAdmin.

If you previously deployed files with different names (for example `MatchStats_API.js`), keep only one active copy in the Plugins folder to avoid loading stale code.

## Configuration

Configuration is managed through IW4MAdmin's built-in config system. On first load the plugin writes default values into:

```
<IW4MAdmin>/Configuration/ScriptPluginSettings.json
```

All script plugin settings share this file. This plugin's settings are stored under the key `"Match Stats API CB1"` → `"config"`. Edit that file directly to change settings, then restart IW4MAdmin to pick up the changes.

| Key | Type | Default | Description |
|---|---|---|---|
| `apiKey` | string | *(empty)* | Bearer token sent in the `Authorization` header of every request. |
| `includeClientIp` | boolean | `false` | If `true`, each player object in the payload includes their IP address. |
| `maxRetries` | number | `1` | Number of retry attempts when a POST fails. The plugin makes up to `1 + maxRetries` total attempts before discarding the data. |

The endpoint is fixed in the plugin to:

`https://api.360-arena.com/match_stats`

In normal use, you only need to set `apiKey`.

## When Does the Sync Run?

Stats are collected continuously during a match and sent **once at match end**:

1. **Match start** — all per-server tracking counters (kills, deaths, damage) are reset. A unique match ID (UUID) and start timestamp are generated.
2. **During the match** — every kill event increments the attacker's kill count and the victim's death count, and accumulates killing-blow damage. Periodic client-data updates capture each player's score and team.
3. **Match end** (`ShutdownGame` in the game log) — the plugin assembles the full payload from the accumulated data plus the current client list and POSTs it to the fixed ingest URL. Match data is only cleared after the API confirms receipt; on failure the plugin retries up to `maxRetries` times.

No data is sent mid-match; there is exactly **one POST per completed match per server**.

## In-Game Commands

| Command | Alias | Permission | Description |
|---|---|---|---|
| `!matchstats` | `!ms` | User | Shows current tracking status, API URL, and last submit status. |
| `!msdebug [on/off]` | `!msd` | User | Toggles verbose debug mode and prints last dispatch/error counters. |

## API Payloads

All payload keys use **snake_case** to align with typical Rails/API conventions.

### Match Stats (`POST → https://api.360-arena.com/match_stats`)

Sent automatically at the end of every match.

```json
{
  "match_id":         "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "server_id":        "192.168.1.10:28960",
  "server_name":      "My Game Server - Search & Destroy",
  "map_name":         "mp_crash",
  "game":             "IW4",
  "game_type":        "sd",
  "match_start_utc":  "2026-02-21T22:05:00.000Z",
  "match_end_utc":    "2026-02-21T22:15:00.000Z",
  "duration_seconds": 600,
  "players": [
    {
      "client_id":           123,
      "network_id":          "110000100000000",
      "name":                "PlayerName",
      "score":               1500,
      "kills":               12,
      "deaths":              4,
      "killing_blow_damage": 2400,
      "team":                "allies",
      "ip":                  "1.2.3.4"
    }
  ]
}
```

> **`match_id`** is a UUID generated at match start. Your backend can use this to enforce uniqueness and safely ignore duplicate submissions caused by retries or network glitches.

> **`server_id`** is the server's `IP:Port` string, which is stable across IW4MAdmin database rebuilds (unlike the auto-increment integer ID).

> **`game`** identifies the Call of Duty title — e.g. `IW3` (CoD4), `IW4` (MW2), `IW5` (MW3), `T5` (BO1), `T6` (BO2). The `game_type` field is the game *mode* shortcode (e.g. `war` = TDM, `dom` = Domination, `sd` = Search & Destroy).

> **`killing_blow_damage`** is the sum of final-hit damage from kills, not total damage dealt during the match. IW4MAdmin only exposes per-kill damage (the damage of the shot that secured the kill), so a player who deals significant chip damage but gets no kills will show `0`. Keep this in mind when interpreting the data.

> The payload includes bots and human players. The `ip` field is only included when `includeClientIp` is `true`.

**Headers sent with every request:**

- `Content-Type: application/json`
- `Authorization: Bearer <apiKey>` (only if `apiKey` is set)

## Building Your API Endpoint

Your receiving API needs to handle one route:

1. **`POST /match_stats`** — accept the match payload, validate the bearer token, and store the data. Use `match_id` as a unique key to safely handle duplicate submissions. Return a JSON body; the plugin checks for `success` and `errors` fields to determine whether to retry.

The endpoint should return a JSON body. Non-JSON responses trigger a retry.

## Troubleshooting

- **No data sent** — run `!ms` and `!msdebug on` and watch IW4MAdmin logs for `Match Stats API` lines.
- **Runtime error mentioning `substring` on response** — you're running an older script build. Deploy the latest `MatchStatsAPI.js` and restart IW4MAdmin.
- **Commands show unknown but plugin logs still appear** — some IW4MAdmin builds don't register JS commands consistently. This plugin includes a fallback command handler; ensure the startup log shows the latest plugin version.
- **Timeout errors** — increase `timeoutMs` or check network connectivity between the IW4MAdmin host and your API.
- **"All attempts failed"** — the POST failed on every attempt (initial + retries). Check your API availability, then consider increasing `maxRetries`.
- **Stale match data after a server crash** — if a game server crashes mid-match without emitting `ShutdownGame`, the in-memory match data for that server lingers until the next match starts on the same server, at which point it is overwritten. This is not a memory leak in practice, but means the crashed match's stats are lost.
- Check the IW4MAdmin log for entries prefixed with `Match Stats API` for detailed diagnostics.

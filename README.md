# Match Stats API - IW4MAdmin Plugin

JavaScript plugin for [IW4MAdmin](https://github.com/RaidMax/IW4M-Admin) that exports **sanitized leaderboard snapshots** using IW4M Webfront API (default) or SQLite (optional fallback).

This plugin no longer sends raw per-match kill-event payloads. It now sends curated cumulative player totals suitable for a global leaderboard.

It can also post Discord population alerts and (optionally) accept admin commands from a Discord channel.

## What It Does

- Triggers sync at match end (`MatchEnded`).
- Reads cumulative stats from IW4M Webfront API (`/api/stats/top`) by default.
- Optional fallback: reads directly from SQLite when `statsSource` is set to `db`.
- Sends only changed players using a persisted `updated_at` cursor.
- Batches payloads for reliability.
- Uses `ClientEnterMatch` to cache the latest live display names and prefer them over stale aliases.

## Installation

1. Build and copy `dist/MatchStatsAPI.js` into your IW4MAdmin `Plugins` folder.
2. Restart IW4MAdmin.
3. Open plugin settings in:

```
<IW4MAdmin>/Configuration/ScriptPluginSettings.json
```

Plugin settings are stored under your script plugin entry key in the `config` object.

## Discord Setup (Easy Guide)

### A) Alerts only (no Discord commands)

1. In Discord, create an **Incoming Webhook** for your alert channel.
2. Copy webhook URL.
3. In plugin config, set:
   - `discordWebhookUrl`
   - (optional) `discordThresholdLow` and `discordThresholdHigh`

Minimal example:

```json
{
  "discordWebhookUrl": "https://discord.com/api/webhooks/...",
  "discordThresholdLow": 6,
  "discordThresholdHigh": 10
}
```

### B) Alerts + Discord admin commands

1. Create a Discord bot in the Discord Developer Portal.
2. Invite bot to your server with permission to:
   - Read Message History
   - View Channels
   - Send Messages
3. Enable Message Content intent for the bot (required to read command text).
4. Copy the bot token.
5. Turn on Developer Mode in Discord, then copy:
   - Channel ID (where commands will be read)
   - User IDs for admins who are allowed to run commands
6. In plugin config, set:
   - `discordBotToken`
   - `discordChannelId`
   - `discordAllowedUserIds` (comma-separated IDs)
   - optional `discordCommandPrefix` (default `!iw4`)

Command example config:

```json
{
  "discordBotToken": "BotTokenHere",
  "discordChannelId": "123456789012345678",
  "discordAllowedUserIds": "111111111111111111,222222222222222222",
  "discordCommandPrefix": "!iw4",
  "discordPollIntervalSeconds": 15
}
```

### C) Complete example (alerts + commands)

```json
{
  "apiKey": "YOUR_360_API_KEY",
  "apiUrl": "https://api.360-arena.com/iw4m/leaderboard_snapshots",
  "statsSource": "webfront",
  "webfrontBaseUrl": "http://127.0.0.1:1624",
  "webfrontClientId": "",
  "webfrontPassword": "",
  "webfrontPageSize": 200,
  "webfrontMaxPages": 250,
  "dbPath": "C:\\IW4Madmin\\Database\\Database.db",
  "maxRetries": 1,
  "maxRowsPerRequest": 500,
  "minSecondsBetweenSyncs": 20,
  "discordWebhookUrl": "https://discord.com/api/webhooks/...",
  "discordThresholdLow": 6,
  "discordThresholdHigh": 10,
  "discordBotToken": "BotTokenHere",
  "discordChannelId": "123456789012345678",
  "discordAllowedUserIds": "111111111111111111,222222222222222222",
  "discordCommandPrefix": "!iw4",
  "discordPollIntervalSeconds": 15
}
```

## Configuration

| Key | Type | Default | Description |
|---|---|---|---|
| `apiKey` | string | *(empty)* | Bearer token sent in `Authorization` header. |
| `apiUrl` | string | `https://api.360-arena.com/iw4m/leaderboard_snapshots` | Snapshot ingest endpoint. |
| `statsSource` | string | `webfront` | Data source mode: `webfront` (recommended) or `db`. |
| `webfrontBaseUrl` | string | `http://127.0.0.1:1624` | IW4M Webfront base URL. |
| `webfrontClientId` | string | *(empty)* | Optional client ID for Webfront login. |
| `webfrontPassword` | string | *(empty)* | Optional password for Webfront login. |
| `webfrontPageSize` | number | `200` | Rows per `/api/stats/top` page request. |
| `webfrontMaxPages` | number | `250` | Safety cap for number of pages per sync run. |
| `dbPath` | string | `C:\IW4Madmin\Database\Database.db` | Absolute SQLite DB file path on the IW4MAdmin host. |
| `maxRetries` | number | `1` | Retry attempts per failed POST. Total attempts = `1 + maxRetries`. |
| `maxRowsPerRequest` | number | `500` | Number of player rows per HTTP batch. |
| `minSecondsBetweenSyncs` | number | `20` | Per-server cooldown to ignore duplicate `MatchEnded` triggers. |
| `discordWebhookUrl` | string | *(empty)* | Discord Incoming Webhook URL for population alerts. |
| `discordThresholdLow` | number | `6` | First alert threshold; sends alert when player count rises above this value. |
| `discordThresholdHigh` | number | `10` | Second alert threshold; sends alert when player count rises above this value. |
| `discordBotToken` | string | *(empty)* | Discord bot token for command polling/replies. Optional. |
| `discordChannelId` | string | *(empty)* | Channel ID used for Discord command polling. Optional. |
| `discordAllowedUserIds` | string | *(empty)* | Comma-separated Discord user IDs allowed to run commands. |
| `discordCommandPrefix` | string | `!iw4` | Prefix required before Discord commands (example: `!iw4 map mp_terminal`). |
| `discordPollIntervalSeconds` | number | `15` | Minimum interval between Discord polling requests. |

## Triggering

Sync runs on each match end signal. If a sync is already running, one follow-up sync is queued.

Because data is cumulative and cursor-based, duplicate triggers do not duplicate leaderboard totals on a correctly implemented API.

Discord command polling runs on game activity events (join/leave/match end) and is throttled by `discordPollIntervalSeconds`.

## Discord Behavior

- Population alerts are tracked per server and fire once when crossing `discordThresholdLow`, then once when crossing `discordThresholdHigh`.
- Alert state resets when server population drops back to/below each threshold.
- If bot settings are configured (`discordBotToken`, `discordChannelId`, `discordAllowedUserIds`), allowed users can run commands:
  - `!iw4 help`
  - `!iw4 servers` (shows each server key)
  - `!iw4 map mp_terminal` (works when exactly one server is active)
  - `!iw4 @<server_key> changemap mp_rust` (target one server explicitly)
  - `!iw4 @<server_key> say Server restarting in 2 minutes`
- Replies are posted back to the same Discord channel with success/failure status.

### Notes on command execution

- Commands can target each server explicitly with `@<server_key>`.
- If only one active server is known, commands without `@<server_key>` execute on that server.
- If multiple active servers are known, the plugin requires `@<server_key>` to avoid accidental commands on the wrong server.
- The plugin attempts multiple IW4M command execution APIs for compatibility.
- On first bot poll after startup, existing channel messages are ignored and only newer messages are processed.

## Sanitized Payload

The plugin posts JSON with this shape:

```json
{
  "schema_version": 1,
  "source": "iw4m_leaderboard_snapshot",
  "batch_id": "uuid",
  "batch_index": 0,
  "batch_count": 3,
  "cursor_from_utc": "2026-02-27 01:00:00.0000000",
  "cursor_to_utc": "2026-02-27 01:05:00.0000000",
  "triggered_by": {
    "event": "match_end",
    "occurred_at_utc": "2026-02-27T01:05:03.120Z",
    "server_id": "1118226566",
    "server_name": "Gun Game",
    "map_name": "mp_terminal",
    "game": "IW4",
    "game_type": "dm"
  },
  "captured_at_utc": "2026-02-27T01:05:04.030Z",
  "players": [
    {
      "network_id": "110000112345678",
      "game_name": "13",
      "display_name": "PlayerOne",
      "searchable_name": "playerone",
      "total_kills": 1234,
      "total_deaths": 987,
      "total_time_played_seconds": 45678,
      "average_spm": 312.42,
      "average_skill": 1.042,
      "average_zscore": 0.3311,
      "average_elo_rating": 998.42,
      "average_rolling_weighted_kdr": 1.17,
      "total_connections": 85,
      "total_connection_time_seconds": 93211,
      "last_connection_utc": "2026-02-27 01:04:44.5500000",
      "source_updated_at_utc": "2026-02-27 01:04:44.5500000",
      "stat_hash": "110000112345678:13:2026-02-27 01:04:44.5500000:1234:987:45678"
    }
  ]
}
```

## Security Notes

- The plugin does **not** export password/salt/2FA fields.
- The plugin does **not** export client IP addresses.
- Run your API over HTTPS and validate bearer tokens.

## In-Game Commands

| Command | Alias | Permission | Description |
|---|---|---|---|
| `!matchstats` | `!ms` | User | Shows snapshot mode, last status, row counts, and cursor. |
| `!msdebug [on/off]` | `!msd` | User | Toggles verbose plugin logging and prints last API error. |

## API Expectations

Your endpoint should:

1. Validate bearer token.
2. Treat each player row as an idempotent upsert (recommended key: `network_id + game_name`, with `source_updated_at_utc` staleness checks).
3. Handle batched payloads.
4. Return JSON. Non-JSON responses are treated as retryable failure.

## Troubleshooting

- **No rows sent**: check if `cursor_from_utc` is ahead of source updates; clear cursor in plugin settings if needed.
- **Webfront read error**: confirm `webfrontBaseUrl` is reachable from IW4MAdmin host (usually `http://127.0.0.1:1624`).
- **DB read error**: only applies when `statsSource` is `db`; confirm `dbPath` exists and SQLite provider is available in IW4M script runtime.
- **401/403**: verify `apiKey` and API auth middleware.
- **Repeated retries**: inspect IW4MAdmin logs for `Match Stats API` entries and API response body snippet.

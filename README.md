# Match Stats API - IW4MAdmin Plugin

JavaScript plugin for [IW4MAdmin](https://github.com/RaidMax/IW4M-Admin) that exports **IW4M totals directly from IW4M's configured database context** and posts them to your ingestion API.

This plugin uses IW4M's internal `IDatabaseContextFactory` service (not Webfront stats endpoints and not a direct sqlite file read).

## What It Does

- Triggers sync at match end (`MatchEnded`).
- Reads cumulative player totals from IW4M data tables via `IDatabaseContextFactory`.
- Uses a persisted `updated_at` cursor to send only changed rows.
- Batches payloads for reliability.
- Uses `ClientEnterMatch` to cache latest live display names and prefer them over stale aliases.
- Can post Discord population alerts and optionally process Discord admin commands.

## Installation

1. Build and copy `dist/MatchStatsAPI.js` into your IW4MAdmin `Plugins` folder.
2. Restart IW4MAdmin.
3. Open plugin settings in:

```
<IW4MAdmin>/Configuration/ScriptPluginSettings.json
```

Plugin settings are stored under your script plugin entry key in the `config` object.

## Configuration

| Key | Type | Default | Description |
|---|---|---|---|
| `apiKey` | string | *(empty)* | Bearer token sent in `Authorization` header. |
| `apiUrl` | string | `https://api.360-arena.com/iw4m/leaderboard_snapshots` | Ingest endpoint. |
| `maxRetries` | number | `1` | Retry attempts per failed POST. Total attempts = `1 + maxRetries`. |
| `maxRowsPerRequest` | number | `500` | Number of DB rows per HTTP batch. |
| `minSecondsBetweenSyncs` | number | `20` | Per-server cooldown to ignore duplicate `MatchEnded` triggers. |
| `discordWebhookUrl` | string | *(empty)* | Discord Incoming Webhook URL for population alerts. |
| `discordThresholdLow` | number | `6` | First alert threshold; sends alert when player count rises above this value. |
| `discordThresholdHigh` | number | `10` | Second alert threshold; sends alert when player count rises above this value. |
| `discordBotToken` | string | *(empty)* | Discord bot token for command polling/replies. Optional. |
| `discordChannelId` | string | *(empty)* | Channel ID used for Discord command polling. Optional. |
| `discordAllowedUserIds` | string | *(empty)* | Comma-separated Discord user IDs allowed to run commands. |
| `discordCommandPrefix` | string | `!iw4` | Prefix required before Discord commands (example: `!iw4 map mp_terminal`). |
| `discordPollIntervalSeconds` | number | `15` | Minimum interval between Discord polling requests. |

Example:

```json
{
  "apiKey": "YOUR_360_API_KEY",
  "apiUrl": "https://api.360-arena.com/iw4m/leaderboard_snapshots",
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

## Triggering

Sync runs on each match end signal. If a sync is already running, one follow-up sync is queued.

The plugin uses a `source_updated_at_utc` cursor so duplicate triggers do not re-send old rows.

Discord command polling runs on game activity events (join/leave/match end) and is throttled by `discordPollIntervalSeconds`.

## Payload Shape

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
  "rows": [
    {
      "client_id": 42,
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

## Discord Behavior

- Population alerts are tracked per server and fire once when crossing `discordThresholdLow`, then once when crossing `discordThresholdHigh`.
- Alert state resets when server population drops back to/below each threshold.
- If bot settings are configured (`discordBotToken`, `discordChannelId`, `discordAllowedUserIds`), allowed users can run commands:
  - `!iw4 help`
  - `!iw4 servers` (shows each server key)
  - `!iw4 map mp_terminal` (works when exactly one server is active)
  - `!iw4 @<server_key> changemap mp_rust` (target one server explicitly)
  - `!iw4 @<server_key> say Server restarting in 2 minutes`

## Security Notes

- The plugin does **not** export password/salt/2FA fields.
- The plugin does **not** export IP address fields.
- Run your API over HTTPS and validate bearer tokens.

## In-Game Commands

| Command | Alias | Permission | Description |
|---|---|---|---|
| `!matchstats` | `!ms` | User | Shows current status, row counts, and cursor. |
| `!msdebug [on/off]` | `!msd` | User | Toggles verbose plugin logging and prints last API error. |

## API Expectations

Your endpoint should:

1. Validate bearer token.
2. Treat each row as an idempotent upsert (recommended key: `network_id + game_name`, with `source_updated_at_utc` staleness checks).
3. Handle batched payloads.
4. Return JSON. Non-JSON responses are treated as retryable failure.

## Troubleshooting

- **No rows sent**: cursor may be ahead of source updates; clear `leaderboardCursorUtc` in script plugin settings.
- **DB context read error**: verify IW4M version supports script access to `IDatabaseContextFactory` and check IW4M logs for plugin startup errors.
- **401/403**: verify `apiKey` and API auth middleware.
- **Repeated retries**: inspect IW4M logs for `Match Stats API` entries and API response snippets.

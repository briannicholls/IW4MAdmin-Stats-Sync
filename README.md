# Match Stats API - IW4MAdmin Plugin

JavaScript plugin for [IW4MAdmin](https://github.com/RaidMax/IW4M-Admin) that exports **sanitized leaderboard snapshots** from IW4MAdmin's SQLite database.

This plugin no longer sends raw per-match kill-event payloads. It now sends curated cumulative player totals suitable for a global leaderboard.

## What It Does

- Triggers sync at match end (`MatchEnded`).
- Reads cumulative stats from SQLite (`EFClientStatistics`, `EFClients`, `EFAlias`).
- Sends only changed players using a persisted `updated_at` cursor.
- Batches payloads for reliability.
- Uses `ClientEnterMatch` to cache the latest live display names and prefer them over stale aliases.

## Installation

1. Copy `MatchStatsAPI.js` into your IW4MAdmin `Plugins` folder.
2. Restart IW4MAdmin.
3. Update plugin settings in:

```
<IW4MAdmin>/Configuration/ScriptPluginSettings.json
```

Plugin settings are stored under your script plugin entry key in the `config` object.

## Configuration

| Key | Type | Default | Description |
|---|---|---|---|
| `apiKey` | string | *(empty)* | Bearer token sent in `Authorization` header. |
| `apiUrl` | string | `https://api.360-arena.com/iw4m/leaderboard_snapshots` | Snapshot ingest endpoint. |
| `dbPath` | string | `C:\IW4Madmin\Database\Database.db` | Absolute SQLite DB file path on the IW4MAdmin host. |
| `maxRetries` | number | `1` | Retry attempts per failed POST. Total attempts = `1 + maxRetries`. |
| `maxRowsPerRequest` | number | `500` | Number of player rows per HTTP batch. |
| `minSecondsBetweenSyncs` | number | `20` | Per-server cooldown to ignore duplicate `MatchEnded` triggers. |

## Triggering

Sync runs on each match end signal. If a sync is already running, one follow-up sync is queued.

Because data is cumulative and cursor-based, duplicate triggers do not duplicate leaderboard totals on a correctly implemented API.

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
- **DB read error**: confirm `dbPath` exists and IW4MAdmin process can read it.
- **401/403**: verify `apiKey` and API auth middleware.
- **Repeated retries**: inspect IW4MAdmin logs for `Match Stats API` entries and API response body snippet.

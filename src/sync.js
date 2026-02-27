import { chunkRows, maxSourceUpdatedAt, generateUUID } from './utils.js';
import { readLeaderboardRows } from './db.js';
import { readLeaderboardRowsFromWebfront } from './webfront.js';
import { postPayload } from './api.js';

export function enqueueSync(plugin, trigger) {
    if (plugin.runtime.isSyncInFlight) {
        plugin.runtime.queuedSync = true;
        plugin.logDebug('{Name}: Sync already in flight, queueing another run', plugin.name);
        return;
    }

    plugin.runtime.isSyncInFlight = true;
    plugin.runtime.queuedSync = false;

    try {
        runSync(plugin, trigger, () => {
            plugin.runtime.isSyncInFlight = false;
            if (plugin.runtime.queuedSync) {
                plugin.runtime.queuedSync = false;
                enqueueSync(plugin, {
                    event: 'queued_follow_up',
                    occurred_at_utc: new Date().toISOString(),
                    server_id: 'unknown',
                    server_name: '',
                    map_name: '',
                    game: '',
                    game_type: ''
                });
            }
        });
    } catch (error) {
        plugin.runtime.isSyncInFlight = false;
        plugin.debugState.lastStatus = 'sync_exception';
        plugin.debugState.lastError = error && error.message ? error.message : 'unknown sync exception';
        plugin.debugState.totalFailures += 1;
        plugin.logger.logError('{Name}: Sync failed before dispatch - {Error}', plugin.name, plugin.debugState.lastError);
    }
}

function runSync(plugin, trigger, done) {
    const cursorFrom = plugin.runtime.lastCursorUtc || null;
    readRows(plugin, cursorFrom, (error, rows) => {
        if (error) {
            plugin.debugState.lastStatus = 'read_error';
            plugin.debugState.lastError = error && error.message ? error.message : 'unknown read error';
            plugin.debugState.totalFailures += 1;
            plugin.logger.logError('{Name}: Failed to read leaderboard data from {Source} - {Error}',
                plugin.name,
                plugin.config.statsSource || 'webfront',
                plugin.debugState.lastError);
            done();
            return;
        }

        const rowCount = rows.length;

        plugin.debugState.lastRowsRead = rowCount;
        plugin.debugState.lastRowsSent = 0;
        plugin.debugState.lastCursorFrom = cursorFrom || '';

        if (rowCount === 0) {
            plugin.debugState.lastStatus = 'no_changes';
            plugin.debugState.lastError = '';
            plugin.logger.logInformation('{Name}: No leaderboard changes since cursor {Cursor}', plugin.name, cursorFrom || '(none)');
            done();
            return;
        }

        const cursorTo = maxSourceUpdatedAt(rows);
        plugin.debugState.lastCursorTo = cursorTo || '';
        const batchId = generateUUID();
        plugin.runtime.recentBatchId = batchId;
        const chunks = chunkRows(rows, plugin.config.maxRowsPerRequest);

        plugin.logger.logInformation('{Name}: Syncing {Rows} leaderboard rows in {Batches} batch(es)', plugin.name, rowCount, chunks.length);

        sendBatchSequence(plugin, chunks, 0, {
            batchId: batchId,
            trigger: trigger,
            cursorFrom: cursorFrom,
            cursorTo: cursorTo
        }, () => {
            plugin.runtime.lastCursorUtc = cursorTo || plugin.runtime.lastCursorUtc;
            if (plugin.runtime.lastCursorUtc) {
                plugin.configWrapper.setValue('leaderboardCursorUtc', plugin.runtime.lastCursorUtc);
            }
            plugin.debugState.lastStatus = 'accepted';
            plugin.debugState.lastError = '';
            plugin.logger.logInformation('{Name}: Leaderboard sync completed. Cursor now {Cursor}', plugin.name, plugin.runtime.lastCursorUtc || '(none)');
            done();
        }, () => {
            done();
        });
    });
}

function readRows(plugin, cursorFrom, done) {
    if ((plugin.config.statsSource || 'webfront') === 'db') {
        const rows = readLeaderboardRows(
            plugin.config.dbPath, cursorFrom, plugin.runtime.liveNameByNetworkId,
            plugin.logger, plugin.debugState, plugin.name
        );
        done(null, rows);
        return;
    }

    readLeaderboardRowsFromWebfront(plugin, cursorFrom, done);
}

function sendBatchSequence(plugin, chunks, index, meta, onComplete, onFailure) {
    if (index >= chunks.length) {
        onComplete();
        return;
    }

    const rows = chunks[index];
    const payload = {
        schema_version: 1,
        source: 'iw4m_leaderboard_snapshot',
        batch_id: meta.batchId,
        batch_index: index,
        batch_count: chunks.length,
        cursor_from_utc: meta.cursorFrom,
        cursor_to_utc: meta.cursorTo,
        triggered_by: meta.trigger,
        captured_at_utc: new Date().toISOString(),
        players: rows
    };

    const logDebugBound = plugin.logDebug.bind(plugin);

    postPayload(plugin.config, plugin.pluginHelper, plugin.logger, plugin.debugState, plugin.name, logDebugBound, payload, 1, (ok) => {
        if (!ok) {
            onFailure();
            return;
        }
        plugin.debugState.lastRowsSent += rows.length;
        sendBatchSequence(plugin, chunks, index + 1, meta, onComplete, onFailure);
    });
}

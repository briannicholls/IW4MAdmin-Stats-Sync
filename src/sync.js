import { chunkRows, maxSourceUpdatedAt, generateUUID } from './utils.js';
import { readIngestionRowsFromDatabaseContext } from './db.js';
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
        plugin.logger.logError('{Name} v{Version}: Sync failed before dispatch - {Error}', plugin.name, plugin.version, plugin.debugState.lastError);
    }
}

function runSync(plugin, trigger, done) {
    const cursorFrom = plugin.runtime.lastCursorUtc || null;
    readRows(plugin, cursorFrom, trigger, (error, rows) => {
        if (error) {
            plugin.debugState.lastStatus = 'read_error';
            plugin.debugState.lastError = error && error.message ? error.message : 'unknown read error';
            plugin.debugState.totalFailures += 1;
            plugin.logger.logError('{Name} v{Version}: Failed to read leaderboard data from {Source} - {Error}',
                plugin.name,
                plugin.version,
                'db_context',
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
            plugin.logger.logInformation('{Name} v{Version}: No leaderboard changes since cursor {Cursor}', plugin.name, plugin.version, cursorFrom || '(none)');
            done();
            return;
        }

        const cursorTo = maxSourceUpdatedAt(rows);
        plugin.debugState.lastCursorTo = cursorTo || '';
        const batchId = generateUUID();
        plugin.runtime.recentBatchId = batchId;
        const chunks = chunkRows(rows, plugin.config.maxRowsPerRequest);

        if (rows.length > 0) {
            const first = rows[0];
            plugin.logger.logInformation('{Name}: First payload row preview client_id={ClientId} network_id={NetworkId} display={Display} searchable={Searchable} game={Game} updated_at={UpdatedAt}',
                plugin.name,
                first.client_id,
                first.network_id,
                first.display_name || '(blank)',
                first.searchable_name || '(blank)',
                first.game_name || '(blank)',
                first.source_updated_at_utc || '(blank)');
        }

        plugin.logger.logInformation('{Name} v{Version}: Syncing {Rows} leaderboard rows in {Batches} batch(es)', plugin.name, plugin.version, rowCount, chunks.length);

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
            plugin.logger.logInformation('{Name} v{Version}: Leaderboard sync completed. Cursor now {Cursor}', plugin.name, plugin.version, plugin.runtime.lastCursorUtc || '(none)');
            done();
        }, () => {
            done();
        });
    });
}

function readRows(plugin, cursorFrom, trigger, done) {
    readIngestionRowsFromDatabaseContext(plugin, cursorFrom, trigger, (dbError, rows) => {
        if (!dbError) {
            done(null, rows);
            return;
        }
        done(dbError, []);
    });
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
        rows: rows
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

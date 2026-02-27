// =============================================================================
// MatchStatsAPI.js - IW4MAdmin JavaScript Plugin
// =============================================================================
// Sends sanitized global leaderboard snapshots from IW4MAdmin SQLite data.
//
// Trigger model:
//   - MatchEnded: kicks off a sync run
//   - ClientEnterMatch: caches latest live player names (display override)
//
// Data model:
//   - Reads cumulative totals from EFClientStatistics + EFClients + EFAlias
//   - Sends only curated fields (no passwords/secrets/IP address)
//   - Uses an updated-at cursor to ship only changed rows after first sync
//
// =============================================================================

const init = (registerNotify, serviceResolver, configWrapper, pluginHelper) => {
    registerNotify('IGameEventSubscriptions.MatchEnded',
        (matchEndEvent, token) => plugin.onMatchEnded(matchEndEvent, token));

    registerNotify('IGameEventSubscriptions.ClientEnterMatch',
        (enterEvent, token) => plugin.onClientEnterMatch(enterEvent, token));

    registerNotify('IGameEventSubscriptions.ClientEnteredCommand',
        (commandEvent, token) => plugin.onClientEnteredCommand(commandEvent, token));

    plugin.onLoad(serviceResolver, configWrapper, pluginHelper);
    return plugin;
};

const DEFAULT_API_URL = 'https://api.360-arena.com/iw4m/leaderboard_snapshots';
const DEFAULT_DB_PATH = 'C:\\IW4Madmin\\Database\\Database.db';

const plugin = {
    author: 'b_five',
    version: '2.0',
    name: 'Match Stats API',
    logger: null,
    manager: null,
    configWrapper: null,
    pluginHelper: null,

    config: {
        apiKey: '',
        apiUrl: DEFAULT_API_URL,
        dbPath: DEFAULT_DB_PATH,
        maxRetries: 1,
        maxRowsPerRequest: 500,
        minSecondsBetweenSyncs: 20
    },

    debugEnabled: false,
    debugState: {
        lastDispatchAt: null,
        lastStatus: 'none',
        lastError: '',
        lastResponse: '',
        totalPosts: 0,
        totalFailures: 0,
        lastRowsRead: 0,
        lastRowsSent: 0,
        lastCursorFrom: '',
        lastCursorTo: ''
    },

    runtime: {
        isSyncInFlight: false,
        queuedSync: false,
        lastTriggerAtMsByServer: {},
        lastCursorUtc: null,
        recentBatchId: null,
        liveNameByNetworkId: {}
    },

    onLoad: function (serviceResolver, configWrapper, pluginHelper) {
        this.configWrapper = configWrapper;
        this.pluginHelper = pluginHelper;
        this.manager = serviceResolver.resolveService('IManager');
        this.logger = serviceResolver.resolveService('ILogger', ['ScriptPluginV2']);

        this.configWrapper.setName(this.name);

        const stored = this.configWrapper.getValue('config', (newCfg) => {
            if (newCfg) {
                plugin.config = plugin.sanitizeConfig(newCfg);
                plugin.logger.logInformation('{Name} config reloaded. API={Url} DB={Db}',
                    plugin.name, plugin.config.apiUrl, plugin.config.dbPath);
            }
        });

        if (stored != null) {
            this.config = this.sanitizeConfig(stored);
            if (this.shouldPersistSanitizedConfig(stored, this.config)) {
                this.configWrapper.setValue('config', this.config);
                this.logger.logInformation('{Name}: Config migrated with new defaults/keys', this.name);
            }
        } else {
            this.configWrapper.setValue('config', this.config);
        }

        const savedCursor = this.configWrapper.getValue('leaderboardCursorUtc', null);
        if (savedCursor != null) {
            this.runtime.lastCursorUtc = String(savedCursor);
        }

        this.logger.logInformation(
            '{Name} {Version} by {Author} loaded. API={Url} DB={Db} Cursor={Cursor}',
            this.name,
            this.version,
            this.author,
            this.config.apiUrl,
            this.config.dbPath,
            this.runtime.lastCursorUtc || '(none)'
        );

        if (!this.config.apiKey) {
            this.logger.logWarning('{Name}: apiKey is empty. The API will likely reject requests with 401.', this.name);
        }
    },

    onClientEnterMatch: function (enterEvent, _token) {
        const client = this.extractClientFromEvent(enterEvent);
        if (!client) return;

        const networkId = this.normalizeNetworkId(client.networkId);
        if (!networkId) return;

        const liveName = this.cleanName(client.cleanedName || client.name || '');
        if (!liveName) return;

        this.runtime.liveNameByNetworkId[networkId] = liveName;
        this.logDebug('{Name}: Live name cached net={Net} name={Player}', this.name, networkId, liveName);
    },

    onMatchEnded: function (matchEndEvent, _token) {
        const server = matchEndEvent ? matchEndEvent.server : null;
        const serverKey = this.getServerKey(server);
        const nowMs = Date.now();
        const minGapMs = Math.max(5, parseInt(this.config.minSecondsBetweenSyncs, 10) || 20) * 1000;
        const prevMs = this.runtime.lastTriggerAtMsByServer[serverKey] || 0;

        if (nowMs - prevMs < minGapMs) {
            this.logDebug('{Name}: Ignoring duplicate trigger on {Server} (cooldown)', this.name, serverKey);
            return;
        }
        this.runtime.lastTriggerAtMsByServer[serverKey] = nowMs;

        const trigger = {
            event: 'match_end',
            occurred_at_utc: new Date().toISOString(),
            server_id: server ? server.toString() : 'unknown',
            server_name: server && (server.serverName || server.hostname) ? (server.serverName || server.hostname) : '',
            map_name: server && server.currentMap ? (server.currentMap.name || '') : '',
            game: server && server.gameName ? server.gameName.toString() : '',
            game_type: server && server.gameType ? server.gameType.toString() : ''
        };

        this.logger.logInformation('{Name}: MatchEnded trigger received on {Server}; starting leaderboard sync', this.name, serverKey);
        this.enqueueSync(trigger);
    },

    enqueueSync: function (trigger) {
        if (this.runtime.isSyncInFlight) {
            this.runtime.queuedSync = true;
            this.logDebug('{Name}: Sync already in flight, queueing another run', this.name);
            return;
        }

        this.runtime.isSyncInFlight = true;
        this.runtime.queuedSync = false;

        try {
            this.runSync(trigger, () => {
                this.runtime.isSyncInFlight = false;
                if (this.runtime.queuedSync) {
                    this.runtime.queuedSync = false;
                    this.enqueueSync({
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
            this.runtime.isSyncInFlight = false;
            this.debugState.lastStatus = 'sync_exception';
            this.debugState.lastError = error && error.message ? error.message : 'unknown sync exception';
            this.debugState.totalFailures += 1;
            this.logger.logError('{Name}: Sync failed before dispatch - {Error}', this.name, this.debugState.lastError);
        }
    },

    runSync: function (trigger, done) {
        const cursorFrom = this.runtime.lastCursorUtc || null;
        const rows = this.readLeaderboardRows(cursorFrom);
        const rowCount = rows.length;

        this.debugState.lastRowsRead = rowCount;
        this.debugState.lastRowsSent = 0;
        this.debugState.lastCursorFrom = cursorFrom || '';

        if (rowCount === 0) {
            this.debugState.lastStatus = 'no_changes';
            this.debugState.lastError = '';
            this.logger.logInformation('{Name}: No leaderboard changes since cursor {Cursor}', this.name, cursorFrom || '(none)');
            done();
            return;
        }

        const cursorTo = this.maxSourceUpdatedAt(rows);
        this.debugState.lastCursorTo = cursorTo || '';
        const batchId = this.generateUUID();
        this.runtime.recentBatchId = batchId;
        const chunks = this.chunkRows(rows, this.config.maxRowsPerRequest);

        this.logger.logInformation('{Name}: Syncing {Rows} leaderboard rows in {Batches} batch(es)', this.name, rowCount, chunks.length);

        this.sendBatchSequence(chunks, 0, {
            batchId: batchId,
            trigger: trigger,
            cursorFrom: cursorFrom,
            cursorTo: cursorTo
        }, () => {
            this.runtime.lastCursorUtc = cursorTo || this.runtime.lastCursorUtc;
            if (this.runtime.lastCursorUtc) {
                this.configWrapper.setValue('leaderboardCursorUtc', this.runtime.lastCursorUtc);
            }
            this.debugState.lastStatus = 'accepted';
            this.debugState.lastError = '';
            this.logger.logInformation('{Name}: Leaderboard sync completed. Cursor now {Cursor}', this.name, this.runtime.lastCursorUtc || '(none)');
            done();
        }, () => {
            done();
        });
    },

    sendBatchSequence: function (chunks, index, meta, onComplete, onFailure) {
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

        this.postPayload(payload, 1, (ok) => {
            if (!ok) {
                onFailure();
                return;
            }
            this.debugState.lastRowsSent += rows.length;
            this.sendBatchSequence(chunks, index + 1, meta, onComplete, onFailure);
        });
    },

    postPayload: function (payload, attempt, done) {
        try {
            const bodyJson = JSON.stringify(payload);

            const stringDict = System.Collections.Generic.Dictionary(System.String, System.String);
            const headers = new stringDict();
            if (this.config.apiKey) {
                headers.add('Authorization', 'Bearer ' + this.config.apiKey);
            }

            const pluginScript = importNamespace('IW4MAdmin.Application.Plugin.Script');
            const request = new pluginScript.ScriptPluginWebRequest(
                this.config.apiUrl,
                bodyJson,
                'POST',
                'application/json',
                headers
            );

            const currentAttempt = attempt;
            const maxRetries = this.config.maxRetries || 1;

            this.pluginHelper.requestUrl(request, (response) => {
                plugin.onApiResponse(response, payload, currentAttempt, maxRetries, done);
            });

            this.debugState.lastDispatchAt = new Date().toISOString();
            this.debugState.lastStatus = 'dispatched';
            this.debugState.totalPosts += 1;
            this.logDebug('{Name}: POST dispatched to {Url} ({Bytes} bytes, attempt {Attempt})',
                this.name, this.config.apiUrl, bodyJson.length, attempt);
        } catch (ex) {
            this.debugState.lastStatus = 'exception';
            this.debugState.lastError = ex && ex.message ? ex.message : 'unknown request exception';
            this.debugState.totalFailures += 1;
            this.logger.logError('{Name}: Failed to dispatch payload - {Error}', this.name, this.debugState.lastError);
            done(false);
        }
    },

    onApiResponse: function (response, payload, attempt, maxRetries, done) {
        const responseText = this.responseToText(response);

        if (!response) {
            this.debugState.lastStatus = 'empty_response';
            this.debugState.lastError = 'empty API response';
            this.debugState.totalFailures += 1;
            this.logger.logWarning('{Name}: Empty response from API (attempt {Attempt})', this.name, attempt);
            this.handleRetry(payload, attempt, maxRetries, done);
            return;
        }

        try {
            const parsed = this.parseApiResponse(response, responseText);
            if (this.isApiFailure(parsed, responseText)) {
                this.debugState.lastStatus = 'rejected';
                this.debugState.lastResponse = this.snippet(responseText);
                this.debugState.lastError = this.extractApiError(parsed) || 'API rejected payload';
                this.debugState.totalFailures += 1;
                this.logger.logWarning('{Name}: API rejected batch {Batch}/{Count} (attempt {Attempt}) - {Response}',
                    this.name,
                    Number(payload.batch_index) + 1,
                    payload.batch_count,
                    attempt,
                    this.snippet(responseText));
                this.handleRetry(payload, attempt, maxRetries, done);
                return;
            }

            this.debugState.lastStatus = 'accepted';
            this.debugState.lastResponse = this.snippet(responseText);
            this.debugState.lastError = '';
            this.logger.logInformation('{Name}: API accepted batch {Batch}/{Count}',
                this.name,
                Number(payload.batch_index) + 1,
                payload.batch_count);
            done(true);
        } catch (e) {
            this.debugState.lastStatus = 'non_json';
            this.debugState.lastResponse = this.snippet(responseText);
            this.debugState.lastError = 'non-JSON API response: ' + (e && e.message ? e.message : 'parse error');
            this.debugState.totalFailures += 1;
            this.logger.logWarning('{Name}: Non-JSON API response (attempt {Attempt}): {Response}',
                this.name,
                attempt,
                this.snippet(responseText));
            this.handleRetry(payload, attempt, maxRetries, done);
        }
    },

    handleRetry: function (payload, attempt, maxRetries, done) {
        if (attempt < maxRetries + 1) {
            this.logger.logInformation('{Name}: Retrying POST (attempt {Next} of {Max})',
                this.name,
                attempt + 1,
                maxRetries + 1);
            this.postPayload(payload, attempt + 1, done);
            return;
        }

        this.logger.logError('{Name}: All {Max} attempt(s) failed for batch {Batch}/{Count}',
            this.name,
            maxRetries + 1,
            Number(payload.batch_index) + 1,
            payload.batch_count);
        done(false);
    },

    readLeaderboardRows: function (cursorFromUtc) {
        const rows = [];
        let connection = null;
        let reader = null;

        const sql = this.buildLeaderboardQuery(cursorFromUtc);
        this.logDebug('{Name}: SQL query prepared (cursor={Cursor})', this.name, cursorFromUtc || '(none)');

        try {
            const fileNs = importNamespace('System.IO');
            if (!fileNs || !fileNs.File || !fileNs.File.Exists(this.config.dbPath)) {
                throw new Error('SQLite DB file not found at configured dbPath: ' + this.config.dbPath);
            }

            const sqliteNs = this.getSqliteProvider();
            const dbNull = System.DBNull.Value;
            connection = new sqliteNs.SQLiteConnection('Data Source=' + this.config.dbPath + ';Read Only=True;');
            connection.Open();

            const command = connection.CreateCommand();
            command.CommandText = sql;
            reader = command.ExecuteReader();

            while (reader.Read()) {
                const networkId = this.dbValueToString(reader['NetworkId'], dbNull);
                if (!networkId) continue;

                const sourceUpdatedAt = this.dbValueToString(reader['SourceUpdatedAt'], dbNull);
                const liveName = this.runtime.liveNameByNetworkId[networkId] || '';
                const aliasName = this.dbValueToString(reader['AliasName'], dbNull);
                const displayName = this.cleanName(liveName || aliasName || ('client_' + networkId));

                rows.push({
                    network_id: networkId,
                    game_name: this.dbValueToString(reader['GameName'], dbNull),
                    display_name: displayName,
                    searchable_name: this.dbValueToString(reader['SearchableName'], dbNull),
                    total_kills: this.dbValueToInt(reader['Kills'], dbNull),
                    total_deaths: this.dbValueToInt(reader['Deaths'], dbNull),
                    total_time_played_seconds: this.dbValueToInt(reader['TimePlayed'], dbNull),
                    average_spm: this.dbValueToFloat(reader['SPM'], dbNull),
                    average_skill: this.dbValueToFloat(reader['Skill'], dbNull),
                    average_zscore: this.dbValueToFloat(reader['ZScore'], dbNull),
                    average_elo_rating: this.dbValueToFloat(reader['EloRating'], dbNull),
                    average_rolling_weighted_kdr: this.dbValueToFloat(reader['RollingWeightedKDR'], dbNull),
                    total_connections: this.dbValueToInt(reader['Connections'], dbNull),
                    total_connection_time_seconds: this.dbValueToInt(reader['TotalConnectionTime'], dbNull),
                    last_connection_utc: this.dbValueToString(reader['LastConnection'], dbNull),
                    source_updated_at_utc: sourceUpdatedAt,
                    stat_hash: this.computeStatHash(
                        networkId,
                        this.dbValueToString(reader['GameName'], dbNull),
                        sourceUpdatedAt,
                        this.dbValueToInt(reader['Kills'], dbNull),
                        this.dbValueToInt(reader['Deaths'], dbNull),
                        this.dbValueToInt(reader['TimePlayed'], dbNull)
                    )
                });
            }
        } catch (error) {
            this.debugState.lastStatus = 'db_error';
            this.debugState.lastError = error && error.message ? error.message : 'unknown db error';
            this.debugState.totalFailures += 1;
            this.logger.logError('{Name}: Failed to read SQLite data from {Db} - {Error}',
                this.name,
                this.config.dbPath,
                this.debugState.lastError);
            return [];
        } finally {
            try { if (reader) reader.Close(); } catch (_) { }
            try { if (connection) connection.Close(); } catch (_) { }
        }

        return rows;
    },

    getSqliteProvider: function () {
        try {
            return importNamespace('System.Data.SQLite');
        } catch (_) {
            throw new Error('System.Data.SQLite namespace is unavailable in IW4M script runtime');
        }
    },

    buildLeaderboardQuery: function (cursorFromUtc) {
        let whereClause = 'WHERE c.Active = 1 AND c.NetworkId IS NOT NULL AND c.NetworkId != 0';
        if (cursorFromUtc) {
            whereClause += " AND COALESCE(s.UpdatedAt, c.LastConnection, c.FirstConnection) > '"
                + this.escapeSqlLiteral(cursorFromUtc)
                + "'";
        }

        return [
            'SELECT',
            '  c.NetworkId AS NetworkId,',
            '  c.GameName AS GameName,',
            '  COALESCE(a.Name, \"\") AS AliasName,',
            '  COALESCE(a.SearchableName, \"\") AS SearchableName,',
            '  SUM(s.Kills) AS Kills,',
            '  SUM(s.Deaths) AS Deaths,',
            '  SUM(s.TimePlayed) AS TimePlayed,',
            '  AVG(s.SPM) AS SPM,',
            '  AVG(s.Skill) AS Skill,',
            '  AVG(s.ZScore) AS ZScore,',
            '  AVG(s.EloRating) AS EloRating,',
            '  AVG(s.RollingWeightedKDR) AS RollingWeightedKDR,',
            '  MAX(c.Connections) AS Connections,',
            '  MAX(c.TotalConnectionTime) AS TotalConnectionTime,',
            '  MAX(c.LastConnection) AS LastConnection,',
            '  MAX(COALESCE(s.UpdatedAt, c.LastConnection, c.FirstConnection)) AS SourceUpdatedAt',
            'FROM EFClientStatistics s',
            'INNER JOIN EFClients c ON c.ClientId = s.ClientId',
            'LEFT JOIN EFAlias a ON a.AliasId = c.CurrentAliasId',
            whereClause,
            'GROUP BY c.NetworkId, c.GameName, a.Name, a.SearchableName',
            'ORDER BY SourceUpdatedAt ASC, c.NetworkId ASC'
        ].join(' ');
    },

    chunkRows: function (rows, chunkSize) {
        const out = [];
        const size = Math.max(1, parseInt(chunkSize, 10) || 500);
        for (let i = 0; i < rows.length; i += size) {
            out.push(rows.slice(i, i + size));
        }
        return out;
    },

    maxSourceUpdatedAt: function (rows) {
        let maxValue = null;
        for (let i = 0; i < rows.length; i++) {
            const value = rows[i] && rows[i].source_updated_at_utc ? String(rows[i].source_updated_at_utc) : '';
            if (!value) continue;
            if (maxValue == null || value > maxValue) {
                maxValue = value;
            }
        }
        return maxValue;
    },

    extractClientFromEvent: function (eventObj) {
        if (!eventObj) return null;
        if (eventObj.client) return eventObj.client;
        if (eventObj.origin) return eventObj.origin;
        return null;
    },

    normalizeNetworkId: function (value) {
        if (value == null) return '';
        const normalized = String(value).trim();
        if (!normalized || normalized === '0') return '';
        return normalized;
    },

    cleanName: function (name) {
        return String(name == null ? '' : name).replace(/[\x00-\x1F\x7F]/g, '').trim();
    },

    escapeSqlLiteral: function (value) {
        return String(value == null ? '' : value).replace(/'/g, "''");
    },

    dbValueToString: function (value, dbNull) {
        if (value == null || value === dbNull) return '';
        return String(value);
    },

    dbValueToInt: function (value, dbNull) {
        if (value == null || value === dbNull) return 0;
        const parsed = parseInt(String(value), 10);
        return Number.isFinite(parsed) ? parsed : 0;
    },

    dbValueToFloat: function (value, dbNull) {
        if (value == null || value === dbNull) return 0;
        const parsed = parseFloat(String(value));
        return Number.isFinite(parsed) ? Number(parsed.toFixed(4)) : 0;
    },

    computeStatHash: function (networkId, gameName, sourceUpdatedAt, kills, deaths, timePlayed) {
        const parts = [
            String(networkId || ''),
            String(gameName || ''),
            String(sourceUpdatedAt || ''),
            String(kills || 0),
            String(deaths || 0),
            String(timePlayed || 0)
        ];
        return parts.join(':');
    },

    responseToText: function (response) {
        if (response == null) return '';
        if (typeof response === 'string') return response;

        try {
            if (typeof response.body === 'string') return response.body;
            if (typeof response.content === 'string') return response.content;
            if (typeof response.data === 'string') return response.data;
        } catch (_) { }

        try {
            return JSON.stringify(response);
        } catch (_) {
            try {
                return String(response);
            } catch (_) {
                return '';
            }
        }
    },

    parseApiResponse: function (rawResponse, textResponse) {
        if (rawResponse && typeof rawResponse === 'object') {
            if (rawResponse.success !== undefined || rawResponse.errors !== undefined) {
                return rawResponse;
            }
            if (rawResponse.body && typeof rawResponse.body === 'string') {
                return JSON.parse(rawResponse.body);
            }
        }
        return JSON.parse(textResponse);
    },

    isApiFailure: function (parsed, textResponse) {
        if (!parsed || typeof parsed !== 'object') return true;
        if (parsed.errors || parsed.error || parsed.success === false) return true;
        if (parsed.status && Number(parsed.status) >= 400) return true;
        if (parsed.statusCode && Number(parsed.statusCode) >= 400) return true;
        if (parsed.Message || parsed.ExceptionMessage || parsed.exception) return true;

        const body = String(textResponse || '').toLowerCase();
        if (body.indexOf('misused header name') !== -1 || body.indexOf('exception') !== -1) {
            return true;
        }
        return false;
    },

    extractApiError: function (parsed) {
        if (!parsed || typeof parsed !== 'object') return '';
        if (typeof parsed.Message === 'string' && parsed.Message !== '') return parsed.Message;
        if (typeof parsed.ExceptionMessage === 'string' && parsed.ExceptionMessage !== '') return parsed.ExceptionMessage;
        if (typeof parsed.error === 'string' && parsed.error !== '') return parsed.error;
        if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
            const first = parsed.errors[0];
            if (typeof first === 'string') return first;
            if (first && typeof first.message === 'string') return first.message;
        }
        return '';
    },

    snippet: function (text) {
        const s = text == null ? '' : String(text);
        return s.length > 220 ? s.substring(0, 220) : s;
    },

    parseCommand: function (commandEvent) {
        const cmd = commandEvent.commandName || commandEvent.command || '';
        const argData = commandEvent.data || commandEvent.message || '';

        if (cmd && String(cmd).trim() !== '') {
            return {
                command: String(cmd).trim(),
                args: String(argData || '').trim()
            };
        }

        const text = String(argData || '').trim();
        if (!text || text.charAt(0) !== '!') return null;

        const body = text.substring(1).trim();
        if (!body) return null;

        const firstSpace = body.indexOf(' ');
        if (firstSpace === -1) {
            return { command: body, args: '' };
        }

        return {
            command: body.substring(0, firstSpace),
            args: body.substring(firstSpace + 1).trim()
        };
    },

    onClientEnteredCommand: function (commandEvent, _token) {
        if (!commandEvent || !commandEvent.origin) return;

        const parsed = this.parseCommand(commandEvent);
        if (!parsed || !parsed.command) return;

        const command = parsed.command.toLowerCase();
        if (command === 'ms' || command === 'matchstats') {
            this.tellStatus(commandEvent);
            return;
        }

        if (command === 'msd' || command === 'msdebug') {
            this.toggleDebugFromCommand(commandEvent, parsed.args);
        }
    },

    tellStatus: function (commandEvent) {
        commandEvent.origin.tell(
            'Match Stats API: ENABLED' +
            ' | Mode: leaderboard snapshot' +
            ' | Last=' + this.debugState.lastStatus +
            ' | Rows(read/sent)=' + this.debugState.lastRowsRead + '/' + this.debugState.lastRowsSent +
            ' | Cursor=' + (this.runtime.lastCursorUtc || '(none)')
        );
    },

    toggleDebugFromCommand: function (commandEvent, args) {
        const arg = String(args || '').trim().toLowerCase();
        if (arg === 'on') this.debugEnabled = true;
        else if (arg === 'off') this.debugEnabled = false;
        else this.debugEnabled = !this.debugEnabled;

        commandEvent.origin.tell(
            'MS Debug ' + (this.debugEnabled ? 'ON' : 'OFF') +
            ' | last=' + this.debugState.lastStatus +
            ' | posts=' + this.debugState.totalPosts +
            ' | failures=' + this.debugState.totalFailures
        );

        if (this.debugState.lastError) {
            commandEvent.origin.tell('MS Debug error: ' + this.debugState.lastError);
        }
    },

    sanitizeConfig: function (cfg) {
        const source = cfg || {};
        const parsedRetries = parseInt(source.maxRetries, 10);
        const parsedBatchSize = parseInt(source.maxRowsPerRequest, 10);
        const parsedCooldown = parseInt(source.minSecondsBetweenSyncs, 10);

        const apiKey = source.apiKey == null ? '' : String(source.apiKey).trim();
        const apiUrl = source.apiUrl == null || String(source.apiUrl).trim() === ''
            ? DEFAULT_API_URL
            : String(source.apiUrl).trim();
        const dbPath = source.dbPath == null || String(source.dbPath).trim() === ''
            ? DEFAULT_DB_PATH
            : String(source.dbPath).trim();

        return {
            apiKey: apiKey,
            apiUrl: apiUrl,
            dbPath: dbPath,
            maxRetries: Number.isFinite(parsedRetries) && parsedRetries >= 0 ? parsedRetries : 1,
            maxRowsPerRequest: Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 500,
            minSecondsBetweenSyncs: Number.isFinite(parsedCooldown) && parsedCooldown > 0 ? parsedCooldown : 20
        };
    },

    shouldPersistSanitizedConfig: function (stored, sanitized) {
        const source = stored || {};

        const sourceApiKey = source.apiKey == null ? '' : String(source.apiKey).trim();
        const sourceApiUrl = source.apiUrl == null ? '' : String(source.apiUrl).trim();
        const sourceDbPath = source.dbPath == null ? '' : String(source.dbPath).trim();
        const sourceRetries = parseInt(source.maxRetries, 10);
        const sourceBatchSize = parseInt(source.maxRowsPerRequest, 10);
        const sourceCooldown = parseInt(source.minSecondsBetweenSyncs, 10);

        if (sourceApiKey !== sanitized.apiKey) return true;
        if (sourceApiUrl !== sanitized.apiUrl) return true;
        if (sourceDbPath !== sanitized.dbPath) return true;
        if (!(Number.isFinite(sourceRetries) && sourceRetries >= 0 && sourceRetries === sanitized.maxRetries)) return true;
        if (!(Number.isFinite(sourceBatchSize) && sourceBatchSize > 0 && sourceBatchSize === sanitized.maxRowsPerRequest)) return true;
        if (!(Number.isFinite(sourceCooldown) && sourceCooldown > 0 && sourceCooldown === sanitized.minSecondsBetweenSyncs)) return true;

        return false;
    },

    logDebug: function () {
        if (!this.debugEnabled || !this.logger) return;
        this.logger.logInformation.apply(this.logger, arguments);
    },

    getServerKey: function (server) {
        if (!server) return 'unknown';
        try {
            const key = server.toString();
            if (key && key !== '') return key;
        } catch (_) { }
        return (server.listenAddress || server.id || 'unknown').toString();
    },

    generateUUID: function () {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
};

const commands = [
    {
        name: 'matchstats',
        description: 'shows current leaderboard snapshot sync status',
        alias: 'ms',
        permission: 'User',
        targetRequired: false,
        arguments: [],
        execute: (gameEvent) => {
            plugin.tellStatus(gameEvent);
        }
    },
    {
        name: 'msdebug',
        description: 'toggles debug logging and shows last API status',
        alias: 'msd',
        permission: 'User',
        targetRequired: false,
        arguments: [],
        execute: (gameEvent) => {
            const arg = (gameEvent.data || '').trim().toLowerCase();
            plugin.toggleDebugFromCommand(gameEvent, arg);
        }
    }
];

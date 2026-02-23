// =============================================================================
// MatchStatsAPI.js — IW4MAdmin JavaScript Plugin
// =============================================================================
// Collects per-match player stats (kills, deaths, damage, etc.) and POSTs
// them to an external API endpoint when each match ends.
//
// INSTALLATION
//   1. Copy this file into your IW4MAdmin "Plugins" folder.
//   2. Start/restart IW4MAdmin — the plugin loads automatically.
//   3. Edit the JSON config file written on first load (see below).
//
// CONFIGURATION (stored automatically on first load)
//   apiKey               – bearer / API key sent in headers    (default: empty)
//   includeClientIp      – include player IP in payload        (default: false)
//   maxRetries           – retry attempts on failed POST       (default: 1)
//
// COMMANDS
//   !matchstats (!ms)  – [User] show current plugin status
//   !msdebug           – [User] toggle debug logging on/off
//
// MATCH STATS PAYLOAD  (POST → apiUrl)
//   {
//     "match_id":         "<uuid>",
//     "server_id":        "<IP:port>",
//     "server_name":      "<server hostname>",
//     "map_name":         "<current map>",
//     "game":             "<game code, e.g. IW4, T6>",
//     "game_type":        "<game mode, e.g. sd, dom, war>",
//     "match_start_utc":  "<ISO timestamp>",
//     "match_end_utc":    "<ISO timestamp>",
//     "duration_seconds": 600,
//     "players": [
//       {
//         "client_id":           123,
//         "network_id":          "110000100000000",
//         "name":                "PlayerName",
//         "score":               1500,
//         "kills":               12,
//         "deaths":              4,
//         "killing_blow_damage": 2400,
//         "team":                "allies",
//         "ip":                  "1.2.3.4"   // only if includeClientIp is true
//       },
//       ...
//     ]
//   }
//
// =============================================================================

const init = (registerNotify, serviceResolver, configWrapper, pluginHelper) => {
    // Subscribe to the MatchEnded event fired when the game log prints ShutdownGame
    registerNotify('IGameEventSubscriptions.MatchEnded',
        (matchEndEvent, token) => plugin.onMatchEnded(matchEndEvent, token));

    // Subscribe to kill events so we can accumulate stats during the match
    registerNotify('IGameEventSubscriptions.ClientKilled',
        (killEvent, token) => plugin.onClientKilled(killEvent, token));

    // Subscribe to match start to reset per-match trackers
    registerNotify('IGameEventSubscriptions.MatchStarted',
        (matchStartEvent, token) => plugin.onMatchStarted(matchStartEvent, token));

    // Subscribe to client data updates to capture score snapshots
    registerNotify('IGameServerEventSubscriptions.ClientDataUpdated',
        (updateEvent, token) => plugin.onClientDataUpdated(updateEvent, token));

    plugin.onLoad(serviceResolver, configWrapper, pluginHelper);
    return plugin;
};

const FIXED_API_URL = 'https://api.360-arena.com/match_stats';

const plugin = {
    author: 'b_five',
    version: '1.3',
    name: 'Match Stats API CB1',
    logger: null,
    manager: null,
    configWrapper: null,
    pluginHelper: null,

    // --------------- configuration defaults ---------------
    config: {
        apiKey: '',
        includeClientIp: false,
        maxRetries: 1
    },

    debugEnabled: false,
    debugState: {
        lastDispatchAt: null,
        lastStatus: 'none',
        lastError: '',
        lastResponse: '',
        totalPosts: 0,
        totalFailures: 0
    },

    // --------------- per-server match trackers ---------------
    // Keyed by server endpoint string → { matchId, startedAt, kills, deaths, damage, ... }
    matchData: {},

    // =====================================================================
    //  Lifecycle
    // =====================================================================

    onLoad: function (serviceResolver, configWrapper, pluginHelper) {
        this.configWrapper = configWrapper;
        this.pluginHelper = pluginHelper;
        this.manager = serviceResolver.resolveService('IManager');
        this.logger = serviceResolver.resolveService('ILogger', ['ScriptPluginV2']);

        // --- load persisted config or write defaults ---
        this.configWrapper.setName(this.name);
        const stored = this.configWrapper.getValue('config', newCfg => {
            if (newCfg) {
                plugin.config = plugin.sanitizeConfig(newCfg);
                plugin.logger.logInformation('{Name} config reloaded. URL={Url}',
                    plugin.name, FIXED_API_URL);
            }
        });

        if (stored != null) {
            this.config = this.sanitizeConfig(stored);
        } else {
            this.configWrapper.setValue('config', this.config);
        }

        this.logger.logInformation(
            '{Name} {Version} by {Author} loaded. API={Url}',
            this.name, this.version, this.author, FIXED_API_URL
        );

        if (!this.config.apiKey) {
            this.logger.logWarning('{Name}: apiKey is empty. The API will likely reject requests with 401.', this.name);
        }
    },

    // =====================================================================
    //  Event Handlers
    // =====================================================================

    /** Reset per-match data when a new match begins. */
    onMatchStarted: function (matchStartEvent, _token) {
        const serverKey = this.getServerKey(matchStartEvent.server);
        this.matchData[serverKey] = {
            matchId: this.generateUUID(),
            startedAt: new Date(),
            kills: {},
            deaths: {},
            damage: {}
        };

        this.logger.logDebug('{Name}: Match started on {Server} (matchId={MatchId}) — trackers reset',
            this.name, serverKey, this.matchData[serverKey].matchId);
    },

    /** Accumulate kill / death / damage tallies during the match. */
    onClientKilled: function (killEvent, _token) {
        const serverKey = this.getServerKey(killEvent.server);
        this.ensureServerData(serverKey);

        const attackerId = killEvent.attacker ? killEvent.attacker.clientId : null;
        const victimId = killEvent.victim ? killEvent.victim.clientId : null;

        // Tally kills for attacker (skip self-kills)
        if (attackerId != null && attackerId !== victimId) {
            this.matchData[serverKey].kills[attackerId] =
                (this.matchData[serverKey].kills[attackerId] || 0) + 1;
        }

        // Tally deaths for victim
        if (victimId != null) {
            this.matchData[serverKey].deaths[victimId] =
                (this.matchData[serverKey].deaths[victimId] || 0) + 1;
        }

        // Accumulate damage dealt
        if (attackerId != null && killEvent.damage != null) {
            this.matchData[serverKey].damage[attackerId] =
                (this.matchData[serverKey].damage[attackerId] || 0) + parseInt(killEvent.damage);
        }
    },

    /** Capture latest score from periodic client data updates. */
    onClientDataUpdated: function (updateEvent, _token) {
        const serverKey = this.getServerKey(updateEvent.server);
        this.ensureServerData(serverKey);

        if (!this.matchData[serverKey].scores) {
            this.matchData[serverKey].scores = {};
        }
        if (!this.matchData[serverKey].teams) {
            this.matchData[serverKey].teams = {};
        }

        if (updateEvent.clients) {
            const clients = this.toClientArray(updateEvent.clients);
            for (let i = 0; i < clients.length; i++) {
                const client = clients[i];
                if (!client) continue;
                this.matchData[serverKey].scores[client.clientId] = client.score || 0;
                this.matchData[serverKey].teams[client.clientId] = client.teamName || '';
            }
        }
    },

    /**
     * Main handler — fires when the game log prints ShutdownGame.
     * Gathers all accumulated data + live client info and POSTs to the API.
     */
    onMatchEnded: function (matchEndEvent, _token) {
        const server = matchEndEvent.server;
        if (!server) {
            this.logger.logWarning('{Name}: MatchEnded event had no server reference', this.name);
            return;
        }

        const serverKey = this.getServerKey(server);
        this.ensureServerData(serverKey);

        const players = [];
        try {
            const connectedClients = this.getConnectedClients(server);

            for (let i = 0; i < connectedClients.length; i++) {
                const client = connectedClients[i];
                if (!client) continue;

                const cid = client.clientId;
                const playerEntry = {
                    client_id: cid,
                    network_id: client.networkId ? client.networkId.toString() : '',
                    name: client.cleanedName || client.name || '',
                    score: (this.matchData[serverKey].scores || {})[cid] || client.score || 0,
                    kills: this.matchData[serverKey].kills[cid] || 0,
                    deaths: this.matchData[serverKey].deaths[cid] || 0,
                    killing_blow_damage: this.matchData[serverKey].damage[cid] || 0,
                    team: (this.matchData[serverKey].teams || {})[cid] || ''
                };

                if (this.config.includeClientIp && client.iPAddressString) {
                    playerEntry.ip = client.iPAddressString;
                }

                players.push(playerEntry);
            }

            this.logDebug('{Name}: Collected {Count} clients from server object', this.name, connectedClients.length);
        } catch (e) {
            this.logger.logWarning('{Name}: Error building player list — {Error}', this.name, e.message);
        }

        const endTime = new Date();
        const startTime = this.matchData[serverKey].startedAt || endTime;
        const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

        const payload = {
            match_id: this.matchData[serverKey].matchId || this.generateUUID(),
            server_id: server.toString(),
            server_name: server.serverName || server.hostname || '',
            map_name: server.currentMap ? (server.currentMap.name || '') : '',
            game: server.gameName ? server.gameName.toString() : '',
            game_type: server.gameType ? server.gameType.toString() : '',
            match_start_utc: startTime.toISOString(),
            match_end_utc: endTime.toISOString(),
            duration_seconds: durationSeconds,
            players: players
        };

        this.logger.logInformation(
            '{Name}: Match ended on {Server} with {Count} players — sending to API',
            this.name, serverKey, players.length
        );

        this.postMatchStats(payload, serverKey);
    },

    // =====================================================================
    //  HTTP POST
    // =====================================================================

    /**
     * POST the match payload to the configured API endpoint.
     * Cleans up matchData only after a successful response.
     * Retries up to config.maxRetries times on failure.
     */
    postMatchStats: function (payload, serverKey, attempt) {
        attempt = attempt || 1;

        try {
            const bodyJson = JSON.stringify(payload);

            const stringDict = System.Collections.Generic.Dictionary(System.String, System.String);
            const headers = new stringDict();
            headers.add('Content-Type', 'application/json');

            if (this.config.apiKey) {
                headers.add('Authorization', 'Bearer ' + this.config.apiKey);
            }

            const pluginScript = importNamespace('IW4MAdmin.Application.Plugin.Script');
            const request = new pluginScript.ScriptPluginWebRequest(
                FIXED_API_URL,
                bodyJson,
                'POST',
                'application/json',
                headers
            );

            const currentAttempt = attempt;
            const maxRetries = this.config.maxRetries || 1;
            const capturedPayload = payload;
            const capturedServerKey = serverKey;

            this.pluginHelper.requestUrl(request, (response) => {
                plugin.onApiResponse(response, capturedServerKey, capturedPayload, currentAttempt, maxRetries);
            });

            this.debugState.lastDispatchAt = new Date().toISOString();
            this.debugState.lastStatus = 'dispatched';
            this.debugState.totalPosts += 1;
            this.logDebug('{Name}: POST dispatched to {Url} ({Bytes} bytes, attempt {Attempt})',
                this.name, FIXED_API_URL, bodyJson.length, attempt);

        } catch (ex) {
            this.debugState.lastStatus = 'exception';
            this.debugState.lastError = ex.message || 'unknown error';
            this.debugState.totalFailures += 1;
            this.logger.logError('{Name}: Failed to POST match stats — {Error}',
                this.name, ex.message);
            delete this.matchData[serverKey];
        }
    },

    /** Handle the API response: check for success, retry on failure, clean up on success. */
    onApiResponse: function (response, serverKey, payload, attempt, maxRetries) {
        if (!response) {
            this.debugState.lastStatus = 'empty_response';
            this.debugState.lastError = 'empty API response';
            this.debugState.totalFailures += 1;
            this.logger.logWarning('{Name}: Empty response from API (attempt {Attempt})',
                this.name, attempt);
            this.handleRetry(serverKey, payload, attempt, maxRetries);
            return;
        }

        try {
            const parsed = JSON.parse(response);

            if (parsed.errors || parsed.success === false) {
                this.debugState.lastStatus = 'rejected';
                this.debugState.lastResponse = response.substring(0, 200);
                this.debugState.lastError = 'API rejected payload';
                this.debugState.totalFailures += 1;
                this.logger.logWarning('{Name}: API rejected the payload (attempt {Attempt}) — {Response}',
                    this.name, attempt, response.substring(0, 200));
                this.handleRetry(serverKey, payload, attempt, maxRetries);
                return;
            }

            this.debugState.lastStatus = 'accepted';
            this.debugState.lastResponse = response.substring(0, 200);
            this.debugState.lastError = '';
            this.logger.logInformation('{Name}: API accepted match data — {Response}',
                this.name, response.substring(0, 200));
            delete this.matchData[serverKey];

        } catch (_) {
            this.debugState.lastStatus = 'non_json';
            this.debugState.lastResponse = (response || '').substring(0, 200);
            this.debugState.lastError = 'non-JSON API response';
            this.debugState.totalFailures += 1;
            this.logger.logWarning('{Name}: Non-JSON API response (attempt {Attempt}): {Response}',
                this.name, attempt, (response || '').substring(0, 200));
            this.handleRetry(serverKey, payload, attempt, maxRetries);
        }
    },

    sanitizeConfig: function (cfg) {
        const source = cfg || {};
        const parsedRetries = parseInt(source.maxRetries, 10);
        return {
            apiKey: source.apiKey || '',
            includeClientIp: source.includeClientIp === true,
            maxRetries: Number.isFinite(parsedRetries) && parsedRetries >= 0 ? parsedRetries : 1
        };
    },

    logDebug: function () {
        if (!this.debugEnabled || !this.logger) return;
        this.logger.logInformation.apply(this.logger, arguments);
    },

    /** Retry a failed POST or give up and discard the data. */
    handleRetry: function (serverKey, payload, attempt, maxRetries) {
        if (attempt < maxRetries + 1) {
            this.logger.logInformation('{Name}: Retrying POST (attempt {Next} of {Max})...',
                this.name, attempt + 1, maxRetries + 1);
            this.postMatchStats(payload, serverKey, attempt + 1);
        } else {
            this.logger.logError('{Name}: All {Max} attempt(s) failed — match data for {Server} has been lost',
                this.name, maxRetries + 1, serverKey);
            delete this.matchData[serverKey];
        }
    },

    // =====================================================================
    //  Helpers
    // =====================================================================

    /** Derive a stable key using IP:Port so it survives database rebuilds. */
    getServerKey: function (server) {
        if (!server) return 'unknown';
        try {
            var key = server.toString();
            if (key && key !== '') return key;
        } catch (_) { }
        return (server.listenAddress || server.id || 'unknown').toString();
    },

    getConnectedClients: function (server) {
        if (!server) return [];

        const candidates = [];

        try {
            if (typeof server.getClientsAsList === 'function') {
                candidates.push(server.getClientsAsList());
            }
        } catch (_) { }

        try {
            if (typeof server.getClients === 'function') {
                candidates.push(server.getClients());
            }
        } catch (_) { }

        try {
            if (server.clients) {
                candidates.push(server.clients);
            }
        } catch (_) { }

        try {
            if (server.connectedClients) {
                candidates.push(server.connectedClients);
            }
        } catch (_) { }

        for (let i = 0; i < candidates.length; i++) {
            const clients = this.toClientArray(candidates[i]);
            if (clients.length > 0) {
                return clients;
            }
        }

        return [];
    },

    toClientArray: function (collection) {
        if (!collection) return [];

        if (Array.isArray(collection)) return collection;

        try {
            if (typeof collection.getEnumerator === 'function') {
                const iter = collection.getEnumerator();
                const out = [];
                while (iter.moveNext()) {
                    out.push(iter.current);
                }
                return out;
            }
        } catch (_) { }

        try {
            if (typeof collection.toArray === 'function') {
                return collection.toArray();
            }
        } catch (_) { }

        try {
            if (typeof collection.forEach === 'function') {
                const out = [];
                collection.forEach(function (item) { out.push(item); });
                return out;
            }
        } catch (_) { }

        try {
            if (typeof collection.values === 'function') {
                const out = [];
                const iter = collection.values();
                while (true) {
                    const next = iter.next();
                    if (next.done) break;
                    out.push(next.value);
                }
                return out;
            }
        } catch (_) { }

        return [];
    },

    /** Lazily initialise the tracker object for a server. */
    ensureServerData: function (serverKey) {
        if (!this.matchData[serverKey]) {
            this.matchData[serverKey] = {
                matchId: this.generateUUID(),
                startedAt: new Date(),
                kills: {},
                deaths: {},
                damage: {},
                scores: {},
                teams: {}
            };
        }
    },

    /** Generate a v4 UUID (Jint doesn't provide crypto.randomUUID). */
    generateUUID: function () {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
};

// IW4MAdmin requires this top-level array even if no custom commands are defined.
const commands = [
    {
        name: 'matchstats',
        description: 'shows current match stat tracking status',
        alias: 'ms',
        permission: 'User',
        targetRequired: false,
        arguments: [],
        execute: (gameEvent) => {
            const serverKey = plugin.getServerKey(gameEvent.owner);
            const data = plugin.matchData[serverKey];
            const tracked = data ? Object.keys(data.kills || {}).length : 0;

            gameEvent.origin.tell(
                'Match Stats API: ENABLED' +
                ' | Tracking ' + tracked + ' player(s) this match' +
                ' | API: ' + FIXED_API_URL +
                ' | Last: ' + plugin.debugState.lastStatus
            );
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
            if (arg === 'on') plugin.debugEnabled = true;
            else if (arg === 'off') plugin.debugEnabled = false;
            else plugin.debugEnabled = !plugin.debugEnabled;

            gameEvent.origin.tell(
                'MS Debug ' + (plugin.debugEnabled ? 'ON' : 'OFF') +
                ' | last=' + plugin.debugState.lastStatus +
                ' | posts=' + plugin.debugState.totalPosts +
                ' | failures=' + plugin.debugState.totalFailures
            );

            if (plugin.debugState.lastError) {
                gameEvent.origin.tell('MS Debug error: ' + plugin.debugState.lastError);
            }
        }
    }
];

// =============================================================================
// MatchStatsAPI.js — IW4MAdmin JavaScript Plugin
// =============================================================================
// Collects per-match player stats (kills, deaths, damage, etc.) and POSTs
// them to an external API endpoint when each match ends.  Also provides a
// !verify command for account-ownership verification (2FA-style linking).
//
// INSTALLATION
//   1. Copy this file into your IW4MAdmin "Plugins" folder.
//   2. Start/restart IW4MAdmin — the plugin loads automatically.
//   3. Configure via the IW4MAdmin web or JSON config (see below).
//
// CONFIGURATION (stored automatically on first load)
//   enabled              – master on/off switch                (default: true)
//   apiUrl               – the URL to POST match data to      (default: placeholder)
//   verifyUrl            – the URL to POST verify requests to  (default: placeholder)
//   apiKey               – bearer / API key sent in headers    (default: empty)
//   timeoutMs            – HTTP request timeout in ms          (default: 5000)
//   broadcastOnMatchEnd  – tell players stats were submitted   (default: false)
//   includeClientIp      – include player IP in payload        (default: false)
//
// COMMANDS
//   !matchstats (!ms)  – [Moderator] show current tracking status
//   !verify <code> (!vfy) – [User] link game account to web profile
//
// MATCH STATS PAYLOAD  (POST → apiUrl)
//   {
//     "serverId":   "<server id>",
//     "serverName": "<server hostname>",
//     "mapName":    "<current map>",
//     "gameType":   "<game type>",
//     "matchEndUtc":"<ISO timestamp>",
//     "players": [
//       {
//         "clientId":    123,
//         "networkId":   "110000100000000",
//         "name":        "PlayerName",
//         "score":       1500,
//         "kills":       12,
//         "deaths":      4,
//         "team":        "allies",
//         "ip":          "1.2.3.4"          // only if includeClientIp is true
//       },
//       ...
//     ]
//   }
//
// VERIFY PAYLOAD  (POST → verifyUrl)
//   {
//     "networkId":  "110000100000000",
//     "clientId":   123,
//     "name":       "PlayerName",
//     "code":       "A3X9"
//   }
//
// EXPECTED VERIFY RESPONSE
//   { "success": true,  "message": "Account verified successfully!" }
//   { "success": false, "message": "Invalid or expired code." }
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

const plugin = {
    author: 'b_five',
    version: '1.0',
    name: 'Match Stats API',
    logger: null,
    manager: null,
    configWrapper: null,
    pluginHelper: null,

    // --------------- configuration defaults ---------------
    config: {
        enabled: true,
        apiUrl: 'https://your-api.example.com/api/matchstats',
        verifyUrl: 'https://your-api.example.com/api/verify',
        apiKey: '',
        timeoutMs: 5000,
        broadcastOnMatchEnd: false,
        includeClientIp: false
    },

    // --------------- per-server match trackers ---------------
    // Keyed by server endpoint string → { kills: {}, deaths: {}, damage: {} }
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
                plugin.logger.logInformation('{Name} config reloaded. Enabled={Enabled}, URL={Url}',
                    plugin.name, newCfg.enabled, newCfg.apiUrl);
                plugin.config = newCfg;
            }
        });

        if (stored != null) {
            this.config = stored;
        } else {
            this.configWrapper.setValue('config', this.config);
        }

        this.logger.logInformation(
            '{Name} {Version} by {Author} loaded. Enabled={Enabled}, API={Url}',
            this.name, this.version, this.author, this.config.enabled, this.config.apiUrl
        );
    },

    // =====================================================================
    //  Event Handlers
    // =====================================================================

    /** Reset per-match data when a new match begins. */
    onMatchStarted: function (matchStartEvent, _token) {
        if (!this.config.enabled) return;

        const serverKey = this.getServerKey(matchStartEvent.server);
        this.matchData[serverKey] = {
            kills: {},   // clientId → kill count
            deaths: {},  // clientId → death count
            damage: {}   // clientId → total damage dealt
        };

        this.logger.logDebug('{Name}: Match started on {Server} — trackers reset',
            this.name, serverKey);
    },

    /** Accumulate kill / death / damage tallies during the match. */
    onClientKilled: function (killEvent, _token) {
        if (!this.config.enabled) return;

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
        if (!this.config.enabled) return;

        const serverKey = this.getServerKey(updateEvent.server);
        this.ensureServerData(serverKey);

        if (!this.matchData[serverKey].scores) {
            this.matchData[serverKey].scores = {};
        }
        if (!this.matchData[serverKey].teams) {
            this.matchData[serverKey].teams = {};
        }

        if (updateEvent.clients) {
            const clientsEnum = updateEvent.clients.getEnumerator
                ? updateEvent.clients
                : updateEvent.clients;

            try {
                const iter = clientsEnum.getEnumerator();
                while (iter.moveNext()) {
                    const client = iter.current;
                    if (client && !client.isBot) {
                        this.matchData[serverKey].scores[client.clientId] = client.score || 0;
                        this.matchData[serverKey].teams[client.clientId] = client.teamName || '';
                    }
                }
            } catch (e) {
                // Fallback: some collections expose forEach or direct indexing
                this.logger.logDebug('{Name}: Could not enumerate clients in data update: {Error}',
                    this.name, e.message);
            }
        }
    },

    /**
     * Main handler — fires when the game log prints ShutdownGame.
     * Gathers all accumulated data + live client info and POSTs to the API.
     */
    onMatchEnded: function (matchEndEvent, _token) {
        if (!this.config.enabled) return;

        const server = matchEndEvent.server;
        if (!server) {
            this.logger.logWarning('{Name}: MatchEnded event had no server reference', this.name);
            return;
        }

        const serverKey = this.getServerKey(server);
        this.ensureServerData(serverKey);

        // Build the players array from current server clients + accumulated stats
        const players = [];
        try {
            const connectedClients = server.getClientsAsList();
            const iter = connectedClients.getEnumerator();

            while (iter.moveNext()) {
                const client = iter.current;
                if (!client || client.isBot) continue;

                const cid = client.clientId;
                const playerEntry = {
                    clientId: cid,
                    networkId: client.networkId ? client.networkId.toString() : '',
                    name: client.cleanedName || client.name || '',
                    score: (this.matchData[serverKey].scores || {})[cid] || client.score || 0,
                    kills: this.matchData[serverKey].kills[cid] || 0,
                    deaths: this.matchData[serverKey].deaths[cid] || 0,
                    damage: this.matchData[serverKey].damage[cid] || 0,
                    team: (this.matchData[serverKey].teams || {})[cid] || ''
                };

                if (this.config.includeClientIp && client.iPAddressString) {
                    playerEntry.ip = client.iPAddressString;
                }

                players.push(playerEntry);
            }
        } catch (e) {
            this.logger.logWarning('{Name}: Error building player list — {Error}', this.name, e.message);
        }

        // Construct the payload
        const payload = {
            serverId: server.id ? server.id.toString() : '',
            serverName: server.serverName || server.hostname || '',
            mapName: server.currentMap ? (server.currentMap.name || '') : '',
            gameType: server.gameType ? server.gameType.toString() : '',
            matchEndUtc: new Date().toISOString(),
            playerCount: players.length,
            players: players
        };

        this.logger.logInformation(
            '{Name}: Match ended on {Server} with {Count} players — sending to API',
            this.name, serverKey, players.length
        );

        // Send it
        this.postMatchStats(payload);

        // Optional in-game broadcast
        if (this.config.broadcastOnMatchEnd && players.length > 0) {
            try {
                server.broadcast('Match stats have been recorded!');
            } catch (e) {
                this.logger.logDebug('{Name}: Could not broadcast end-of-match message: {Error}',
                    this.name, e.message);
            }
        }

        // Clear accumulated data for this server
        delete this.matchData[serverKey];
    },

    // =====================================================================
    //  HTTP POST
    // =====================================================================

    /**
     * POST the match payload to the configured API endpoint.
     * Uses IW4MAdmin's ScriptPluginWebRequest + pluginHelper.requestUrl()
     * for async HTTP (the same mechanism used by VPNDetection.js).
     */
    postMatchStats: function (payload) {
        if (!this.config.apiUrl || this.config.apiUrl === 'https://your-api.example.com/api/matchstats') {
            this.logger.logWarning('{Name}: API URL is not configured — skipping POST', this.name);
            return;
        }

        try {
            const bodyJson = JSON.stringify(payload);

            // Build headers dictionary
            const stringDict = System.Collections.Generic.Dictionary(System.String, System.String);
            const headers = new stringDict();
            headers.add('Content-Type', 'application/json');

            if (this.config.apiKey) {
                headers.add('Authorization', 'Bearer ' + this.config.apiKey);
            }

            // Create the web request via IW4MAdmin's built-in helper
            const pluginScript = importNamespace('IW4MAdmin.Application.Plugin.Script');
            const request = new pluginScript.ScriptPluginWebRequest(
                this.config.apiUrl,
                bodyJson,
                'POST',
                'application/json',
                headers
            );

            // Fire the async request with a callback
            this.pluginHelper.requestUrl(request, (response) => {
                plugin.onApiResponse(response);
            });

            this.logger.logDebug('{Name}: POST dispatched to {Url} ({Bytes} bytes)',
                this.name, this.config.apiUrl, bodyJson.length);

        } catch (ex) {
            this.logger.logError('{Name}: Failed to POST match stats — {Error}',
                this.name, ex.message);
        }
    },

    /** Handle the API response / log success or failure. */
    onApiResponse: function (response) {
        if (!response) {
            this.logger.logWarning('{Name}: Empty response from API', this.name);
            return;
        }

        try {
            const parsed = JSON.parse(response);
            this.logger.logInformation('{Name}: API responded — {Response}',
                this.name, response.substring(0, 200));
        } catch (_) {
            // Response wasn't JSON — just log the first 200 chars
            this.logger.logInformation('{Name}: API response (non-JSON): {Response}',
                this.name, (response || '').substring(0, 200));
        }
    },

    // =====================================================================
    //  Account Verification
    // =====================================================================

    /**
     * POST a verification code + player identity to the configured verify endpoint.
     * Called when a player runs !verify <code> in-game.
     *
     * @param {object} client  – the EFClient who ran the command
     * @param {string} code    – the short-lived code from the web app
     */
    postVerification: function (client, code) {
        if (!this.config.verifyUrl ||
            this.config.verifyUrl === 'https://your-api.example.com/api/verify') {
            this.logger.logWarning('{Name}: Verify URL is not configured — skipping', this.name);
            client.tell('Verification is not configured on this server.');
            return;
        }

        try {
            const payload = {
                networkId: client.networkId ? client.networkId.toString() : '',
                clientId: client.clientId,
                name: client.cleanedName || client.name || '',
                code: code
            };

            const bodyJson = JSON.stringify(payload);

            // Build headers dictionary
            const stringDict = System.Collections.Generic.Dictionary(System.String, System.String);
            const headers = new stringDict();
            headers.add('Content-Type', 'application/json');

            if (this.config.apiKey) {
                headers.add('Authorization', 'Bearer ' + this.config.apiKey);
            }

            // Create the web request
            const pluginScript = importNamespace('IW4MAdmin.Application.Plugin.Script');
            const request = new pluginScript.ScriptPluginWebRequest(
                this.config.verifyUrl,
                bodyJson,
                'POST',
                'application/json',
                headers
            );

            // Capture a reference to tell the player the result
            const playerRef = client;

            this.pluginHelper.requestUrl(request, (response) => {
                plugin.onVerifyResponse(response, playerRef);
            });

            this.logger.logInformation(
                '{Name}: Verification request sent for {Player} (networkId={Nid})',
                this.name, client.cleanedName || client.name, payload.networkId
            );

            client.tell('Verifying your code, please wait...');

        } catch (ex) {
            this.logger.logError('{Name}: Failed to POST verification — {Error}',
                this.name, ex.message);
            client.tell('An error occurred while verifying. Please try again.');
        }
    },

    /**
     * Handle the verification API response and relay the result to the player.
     *
     * Expects JSON: { "success": true/false, "message": "..." }
     */
    onVerifyResponse: function (response, client) {
        if (!response) {
            this.logger.logWarning('{Name}: Empty response from verify API', this.name);
            if (client) client.tell('Verification failed — no response from server.');
            return;
        }

        try {
            const parsed = JSON.parse(response);

            if (parsed.success) {
                this.logger.logInformation('{Name}: Verification succeeded for {Player}',
                    this.name, client ? (client.cleanedName || client.name) : 'unknown');
                if (client) client.tell(parsed.message || 'Account verified successfully!');
            } else {
                this.logger.logInformation('{Name}: Verification failed for {Player} — {Msg}',
                    this.name, client ? (client.cleanedName || client.name) : 'unknown',
                    parsed.message || 'unknown reason');
                if (client) client.tell(parsed.message || 'Verification failed. Check your code and try again.');
            }
        } catch (_) {
            this.logger.logWarning('{Name}: Unexpected verify response: {Response}',
                this.name, (response || '').substring(0, 200));
            if (client) client.tell('Verification failed — unexpected response from server.');
        }
    },

    // =====================================================================
    //  Helpers
    // =====================================================================

    /** Derive a stable key for a server instance. */
    getServerKey: function (server) {
        if (!server) return 'unknown';
        return (server.id || server.listenAddress || 'unknown').toString();
    },

    /** Lazily initialise the tracker object for a server. */
    ensureServerData: function (serverKey) {
        if (!this.matchData[serverKey]) {
            this.matchData[serverKey] = {
                kills: {},
                deaths: {},
                damage: {},
                scores: {},
                teams: {}
            };
        }
    }
};

// IW4MAdmin requires this top-level array even if no custom commands are defined.
const commands = [
    {
        name: 'matchstats',
        description: 'shows current match stat tracking status',
        alias: 'ms',
        permission: 'Moderator',
        targetRequired: false,
        arguments: [],
        execute: (gameEvent) => {
            const serverKey = plugin.getServerKey(gameEvent.owner);
            const data = plugin.matchData[serverKey];
            const tracked = data ? Object.keys(data.kills || {}).length : 0;

            gameEvent.origin.tell(
                'Match Stats API: ' + (plugin.config.enabled ? 'ENABLED' : 'DISABLED') +
                ' | Tracking ' + tracked + ' player(s) this match' +
                ' | API: ' + plugin.config.apiUrl
            );
        }
    },
    {
        name: 'verify',
        description: 'links your game account to your web profile using a verification code',
        alias: 'vfy',
        permission: 'User',
        targetRequired: false,
        arguments: [{
            name: 'code',
            required: true
        }],
        execute: (gameEvent) => {
            if (!plugin.config.enabled) {
                gameEvent.origin.tell('Match Stats API plugin is currently disabled.');
                return;
            }

            const code = (gameEvent.data || '').trim();
            if (!code) {
                gameEvent.origin.tell('Usage: !verify <code>  — enter the code shown on the website.');
                return;
            }

            // Basic format sanity check — codes should be short alphanumeric strings
            if (code.length > 16 || !/^[a-zA-Z0-9]+$/.test(code)) {
                gameEvent.origin.tell('Invalid code format. Codes are short alphanumeric strings.');
                return;
            }

            plugin.postVerification(gameEvent.origin, code);
        }
    }
];

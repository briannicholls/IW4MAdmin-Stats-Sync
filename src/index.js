import { defaultConfig, sanitizeConfig } from './config.js';
import { cleanName, normalizeNetworkId, getServerKey, extractClientFromEvent, parseCommand } from './utils.js';
import { enqueueSync } from './sync.js';
import { trackServerPopulation, pollDiscordCommands } from './discord.js';

const plugin = {
    author: 'b_five',
    version: '2.0',
    name: 'Match Stats API',
    logger: null,
    manager: null,
    configWrapper: null,
    pluginHelper: null,

    config: Object.assign({}, defaultConfig),

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
        liveNameByNetworkId: {},
        activeNetworkIdsByServer: {},
        playerCountByServer: {},
        discordAlertStateByServer: {},
        serverByKey: {},
        lastActiveServerKey: '',
        lastDiscordPollAtMs: 0,
        discordPollInFlight: false,
        lastDiscordMessageId: ''
    },

    onLoad: function (serviceResolver, configWrapper, pluginHelper) {
        this.configWrapper = configWrapper;
        this.pluginHelper = pluginHelper;
        this.manager = serviceResolver.resolveService('IManager');
        this.logger = serviceResolver.resolveService('ILogger', ['ScriptPluginV2']);

        this.configWrapper.setName(this.name);

        const stored = this.configWrapper.getValue('config', (newCfg) => {
            if (newCfg) {
                plugin.config = sanitizeConfig(newCfg);
                plugin.logger.logInformation('{Name} config reloaded. API={Url} source={Source}',
                    plugin.name, plugin.config.apiUrl, plugin.config.statsSource);
            }
        });

        if (stored != null) {
            this.config = sanitizeConfig(stored);
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

        const savedDiscordMessageId = this.configWrapper.getValue('discordLastMessageId', null);
        if (savedDiscordMessageId != null) {
            this.runtime.lastDiscordMessageId = String(savedDiscordMessageId);
        }

        this.logger.logInformation(
            '{Name} {Version} by {Author} loaded. API={Url} source={Source} Cursor={Cursor}',
            this.name,
            this.version,
            this.author,
            this.config.apiUrl,
            this.config.statsSource,
            this.runtime.lastCursorUtc || '(none)'
        );

        if (!this.config.apiKey) {
            this.logger.logWarning('{Name}: apiKey is empty. The API will likely reject requests with 401.', this.name);
        }
    },

    onClientEnterMatch: function (enterEvent, _token) {
        const client = extractClientFromEvent(enterEvent);
        if (!client) return;

        const networkId = normalizeNetworkId(client.networkId);
        if (!networkId) return;

        const liveName = cleanName(client.cleanedName || client.name || '');
        if (!liveName) return;

        this.runtime.liveNameByNetworkId[networkId] = liveName;
        this.logDebug('{Name}: Live name cached net={Net} name={Player}', this.name, networkId, liveName);

        trackServerPopulation(this, enterEvent);
        pollDiscordCommands(this, enterEvent && enterEvent.server ? enterEvent.server : null);
    },

    onMatchEnded: function (matchEndEvent, _token) {
        const server = matchEndEvent ? matchEndEvent.server : null;
        const serverKey = getServerKey(server);
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
        trackServerPopulation(this, matchEndEvent);
        pollDiscordCommands(this, server);
        enqueueSync(this, trigger);
    },

    onClientEnteredCommand: function (commandEvent, _token) {
        if (!commandEvent || !commandEvent.origin) return;

        const parsed = parseCommand(commandEvent);
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
            ' | Source=' + (this.config.statsSource || 'webfront') +
            ' | Last=' + this.debugState.lastStatus +
            ' | Rows(read/sent)=' + this.debugState.lastRowsRead + '/' + this.debugState.lastRowsSent +
            ' | Cursor=' + (this.runtime.lastCursorUtc || '(none)')
        );
    },

    shouldPersistSanitizedConfig: function (stored, sanitized) {
        const source = stored || {};
        const sourceApiKey = source.apiKey == null ? '' : String(source.apiKey).trim();
        const sourceApiUrl = source.apiUrl == null ? '' : String(source.apiUrl).trim();
        const sourceStatsSource = source.statsSource == null ? '' : String(source.statsSource).trim().toLowerCase();
        const sourceWebfrontBaseUrl = source.webfrontBaseUrl == null ? '' : String(source.webfrontBaseUrl).trim().replace(/\/+$/, '');
        const sourceWebfrontClientId = source.webfrontClientId == null ? '' : String(source.webfrontClientId).trim();
        const sourceWebfrontPassword = source.webfrontPassword == null ? '' : String(source.webfrontPassword).trim();
        const sourceWebfrontPageSize = parseInt(source.webfrontPageSize, 10);
        const sourceWebfrontMaxPages = parseInt(source.webfrontMaxPages, 10);
        const sourceDbPath = source.dbPath == null ? '' : String(source.dbPath).trim();
        const sourceRetries = parseInt(source.maxRetries, 10);
        const sourceBatchSize = parseInt(source.maxRowsPerRequest, 10);
        const sourceCooldown = parseInt(source.minSecondsBetweenSyncs, 10);

        if (sourceApiKey !== sanitized.apiKey) return true;
        if (sourceApiUrl !== sanitized.apiUrl) return true;
        if (sourceStatsSource !== sanitized.statsSource) return true;
        if (sourceWebfrontBaseUrl !== sanitized.webfrontBaseUrl) return true;
        if (sourceWebfrontClientId !== sanitized.webfrontClientId) return true;
        if (sourceWebfrontPassword !== sanitized.webfrontPassword) return true;
        if (!(Number.isFinite(sourceWebfrontPageSize) && sourceWebfrontPageSize >= 25 && sourceWebfrontPageSize === sanitized.webfrontPageSize)) return true;
        if (!(Number.isFinite(sourceWebfrontMaxPages) && sourceWebfrontMaxPages >= 1 && sourceWebfrontMaxPages === sanitized.webfrontMaxPages)) return true;
        if (sourceDbPath !== sanitized.dbPath) return true;
        if (!(Number.isFinite(sourceRetries) && sourceRetries >= 0 && sourceRetries === sanitized.maxRetries)) return true;
        if (!(Number.isFinite(sourceBatchSize) && sourceBatchSize > 0 && sourceBatchSize === sanitized.maxRowsPerRequest)) return true;
        if (!(Number.isFinite(sourceCooldown) && sourceCooldown > 0 && sourceCooldown === sanitized.minSecondsBetweenSyncs)) return true;
        return false;
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

    logDebug: function () {
        if (!this.debugEnabled || !this.logger) return;
        this.logger.logInformation.apply(this.logger, arguments);
    }
};

const init = (registerNotify, serviceResolver, configWrapper, pluginHelper) => {
    registerNotify('IGameEventSubscriptions.MatchEnded',
        (matchEndEvent, token) => plugin.onMatchEnded(matchEndEvent, token));

    registerNotify('IGameEventSubscriptions.ClientEnterMatch',
        (enterEvent, token) => plugin.onClientEnterMatch(enterEvent, token));

    try {
        registerNotify('IGameEventSubscriptions.ClientDisconnected',
            (disconnectEvent, _token) => {
                trackServerPopulation(plugin, disconnectEvent, true);
                pollDiscordCommands(plugin, disconnectEvent && disconnectEvent.server ? disconnectEvent.server : null);
            });
    } catch (_err) {
        if (plugin.logger) {
            plugin.logger.logWarning('{Name}: ClientDisconnected subscription unavailable; threshold reset relies on observed player counts.', plugin.name);
        }
    }

    registerNotify('IGameEventSubscriptions.ClientEnteredCommand',
        (commandEvent, token) => plugin.onClientEnteredCommand(commandEvent, token));

    plugin.onLoad(serviceResolver, configWrapper, pluginHelper);
    return plugin;
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

export { init, plugin, commands };

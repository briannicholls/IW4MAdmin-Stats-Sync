import {
    cleanName,
    computeStatHash
} from './utils.js';

function valueFromAny(source, names, fallback) {
    if (!source) return fallback;
    for (let i = 0; i < names.length; i++) {
        const key = names[i];
        if (source[key] !== undefined && source[key] !== null) return source[key];
    }
    return fallback;
}

function valueFromAnyPath(source, paths, fallback) {
    if (!source) return fallback;

    for (let i = 0; i < paths.length; i++) {
        const path = String(paths[i] || '').split('.');
        let current = source;
        let found = true;

        for (let j = 0; j < path.length; j++) {
            const key = path[j];
            if (!key || current == null || current[key] === undefined || current[key] === null) {
                found = false;
                break;
            }
            current = current[key];
        }

        if (found) return current;
    }

    return fallback;
}

function keyList(source, maxCount) {
    if (!source) return '(none)';
    const out = [];
    try {
        const keys = Object.keys(source);
        for (let i = 0; i < keys.length; i++) {
            out.push(String(keys[i]));
        }
    } catch (_) { }

    try {
        for (const key in source) {
            out.push(String(key));
        }
    } catch (_) { }

    const uniq = Array.from(new Set(out)).sort();
    if (uniq.length === 0) return '(none)';
    const limit = Math.max(5, parseInt(maxCount, 10) || 40);
    return uniq.slice(0, limit).join(',');
}

function parseIntSafe(value) {
    const parsed = parseInt(String(value == null ? '' : value), 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseFloatSafe(value) {
    const parsed = parseFloat(String(value == null ? '' : value));
    return Number.isFinite(parsed) ? Number(parsed.toFixed(4)) : 0;
}

function toArray(source) {
    if (!source) return [];
    if (Array.isArray(source)) return source;

    const out = [];
    try {
        const count = parseIntSafe(valueFromAny(source, ['Count', 'count', 'Length', 'length'], 0));
        if (count > 0) {
            for (let i = 0; i < count; i++) {
                if (source[i] !== undefined) out.push(source[i]);
            }
            if (out.length > 0) return out;
        }
    } catch (_) { }

    try {
        for (const item of source) {
            out.push(item);
        }
    } catch (_) { }

    return out;
}

function normalizeTimestamp(value) {
    if (value == null) return '';
    const raw = String(value).trim();
    if (!raw) return '';

    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();

    const spaceParsed = new Date(raw.replace(' ', 'T'));
    if (!Number.isNaN(spaceParsed.getTime())) return spaceParsed.toISOString();

    return raw;
}

function buildNetworkIdAliases(rawNetworkId) {
    const raw = String(rawNetworkId == null ? '' : rawNetworkId).trim();
    if (!raw) return [];

    const aliases = [raw];

    const decValue = parseInt(raw, 10);
    if (Number.isFinite(decValue)) {
        aliases.push(String(decValue));
        aliases.push(decValue.toString(16).toUpperCase());
    }

    const hexValue = parseInt(raw, 16);
    if (Number.isFinite(hexValue)) {
        aliases.push(String(hexValue));
        aliases.push(hexValue.toString(16).toUpperCase());
    }

    return Array.from(new Set(aliases));
}

function serverFromTrigger(plugin, trigger) {
    const runtime = plugin.runtime || {};
    if (!trigger || !trigger.server_id) {
        return runtime.serverByKey ? runtime.serverByKey[runtime.lastActiveServerKey] : null;
    }

    if (runtime.serverByKey && runtime.serverByKey[trigger.server_id]) {
        return runtime.serverByKey[trigger.server_id];
    }

    return runtime.serverByKey ? runtime.serverByKey[runtime.lastActiveServerKey] : null;
}

function extractServerClientIds(server) {
    const connectedClients = valueFromAny(server, ['connectedClients', 'ConnectedClients', 'clients', 'Clients'], null);
    const clients = toArray(connectedClients);
    const ids = [];

    for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        const id = parseIntSafe(valueFromAny(client, ['ClientId', 'clientId'], 0));
        if (id > 0) ids.push(id);
    }

    return Array.from(new Set(ids));
}

function logServerClientSample(plugin, server, clients) {
    if (!plugin) return;
    const sample = clients.length > 0 ? clients[0] : null;
    plugin.logDebug(
        '{Name}: server snapshot server={Server} connected_clients={Count} server_keys={ServerKeys} sample_client_keys={ClientKeys} sample_client_id={ClientId} sample_network_id={NetworkId} sample_name={Name}',
        plugin.name,
        String(server ? (server.toString ? server.toString() : '') : ''),
        clients.length,
        keyList(server, 80),
        keyList(sample, 80),
        String(valueFromAny(sample, ['ClientId', 'clientId'], '')),
        String(valueFromAny(sample, ['NetworkId', 'networkId'], '')),
        String(valueFromAny(sample, ['Name', 'name', 'CleanedName', 'cleanedName'], ''))
    );
}

function buildBasicDataByClientId(context, clientIds) {
    const out = {};
    if (!context || !context.Clients || typeof context.Clients.GetClientsBasicData !== 'function') {
        return out;
    }

    const basicsRaw = context.Clients.GetClientsBasicData(clientIds);
    const basics = toArray(basicsRaw);

    for (let i = 0; i < basics.length; i++) {
        const row = basics[i];
        const clientId = parseIntSafe(valueFromAny(row, ['ClientId', 'clientId'], 0));
        if (clientId > 0) out[clientId] = row;
    }

    return out;
}

function logContextDataSample(plugin, basics, stats) {
    if (!plugin) return;

    const basic = basics.length > 0 ? basics[0] : null;
    const stat = stats.length > 0 ? stats[0] : null;

    plugin.logDebug(
        '{Name}: context sample basics_count={BasicsCount} stats_count={StatsCount} basic_keys={BasicKeys} stat_keys={StatKeys} basic_name={BasicName} basic_searchable={BasicSearchable} stat_updated={StatUpdated} stat_game={StatGame}',
        plugin.name,
        basics.length,
        stats.length,
        keyList(basic, 100),
        keyList(stat, 100),
        String(valueFromAny(basic, ['Name', 'name'], '')),
        String(valueFromAny(basic, ['SearchableName', 'searchableName'], '')),
        String(valueFromAny(stat, ['UpdatedAt', 'updatedAt'], '')),
        String(valueFromAny(stat, ['GameName', 'gameName'], ''))
    );
}

function statRowsForServer(context, clientIds, server) {
    if (!context || !context.ClientStatistics || typeof context.ClientStatistics.GetClientsStatData !== 'function') {
        throw new Error('ClientStatistics.GetClientsStatData is unavailable in script runtime.');
    }

    const serverDatabaseId = parseIntSafe(valueFromAny(server, ['legacyDatabaseId', 'LegacyDatabaseId', 'databaseId', 'DatabaseId'], 0));
    if (serverDatabaseId <= 0) {
        throw new Error('Unable to resolve server legacyDatabaseId for stats query.');
    }

    return toArray(context.ClientStatistics.GetClientsStatData(clientIds, serverDatabaseId));
}

function buildRowFromStat(stat, basic, plugin, server) {
    const clientId = parseIntSafe(valueFromAny(stat, ['ClientId', 'clientId'], valueFromAny(basic, ['ClientId', 'clientId'], 0)));
    const networkId = String(valueFromAny(stat, ['NetworkId', 'networkId'], valueFromAny(basic, ['NetworkId', 'networkId'], '')) || '').trim();
    if (!networkId) return null;

    const gameName = cleanName(String(valueFromAny(server, ['serverName', 'hostname'], '') || ''));
    const sourceUpdatedAt = normalizeTimestamp(valueFromAny(stat,
        ['UpdatedAt', 'updatedAt', 'LastConnection', 'lastConnection', 'FirstConnection', 'firstConnection'],
        valueFromAny(basic, ['LastConnection', 'lastConnection'], '')));

    const basicName = String(valueFromAnyPath(basic,
        ['Name', 'name', 'AliasName', 'aliasName', 'Alias.Name', 'alias.name', 'CurrentAlias.Name', 'currentAlias.name'],
        '') || '');
    const liveNameByClientId = String((plugin.runtime.liveNameByClientId || {})[String(clientId)] || '');
    let liveNameByNetworkId = '';
    const networkAliases = buildNetworkIdAliases(networkId);
    const networkMap = plugin.runtime.liveNameByNetworkId || {};
    for (let i = 0; i < networkAliases.length; i++) {
        const alias = networkAliases[i];
        if (networkMap[alias]) {
            liveNameByNetworkId = String(networkMap[alias]);
            break;
        }
    }
    const chosenDisplayName = cleanName(liveNameByClientId || liveNameByNetworkId || basicName || '');
    const searchableNameRaw = String(valueFromAnyPath(basic,
        ['SearchableName', 'searchableName', 'Alias.SearchableName', 'alias.searchableName', 'CurrentAlias.SearchableName', 'currentAlias.searchableName'],
        '') || '');
    const searchableName = cleanName(searchableNameRaw || chosenDisplayName).toLowerCase();

    const kills = parseIntSafe(valueFromAny(stat, ['Kills', 'kills'], 0));
    const deaths = parseIntSafe(valueFromAny(stat, ['Deaths', 'deaths'], 0));
    const timePlayed = parseIntSafe(valueFromAny(stat, ['TimePlayed', 'timePlayed'], 0));

    return {
        client_id: clientId,
        network_id: networkId,
        game_name: gameName,
        display_name: chosenDisplayName,
        searchable_name: searchableName,
        total_kills: kills,
        total_deaths: deaths,
        total_time_played_seconds: timePlayed,
        average_spm: parseFloatSafe(valueFromAny(stat, ['SPM', 'spm'], 0)),
        average_skill: parseFloatSafe(valueFromAny(stat, ['Skill', 'skill'], 0)),
        average_zscore: parseFloatSafe(valueFromAny(stat, ['ZScore', 'zScore'], 0)),
        average_elo_rating: parseFloatSafe(valueFromAny(stat, ['EloRating', 'eloRating'], 0)),
        average_rolling_weighted_kdr: parseFloatSafe(valueFromAny(stat, ['RollingWeightedKDR', 'rollingWeightedKdr', 'rollingWeightedKDR'], 0)),
        total_connections: parseIntSafe(valueFromAny(basic, ['Connections', 'connections'], 0)),
        total_connection_time_seconds: parseIntSafe(valueFromAny(basic, ['TotalConnectionTime', 'totalConnectionTime'], 0)),
        last_connection_utc: normalizeTimestamp(valueFromAny(basic, ['LastConnection', 'lastConnection'], '')),
        source_updated_at_utc: sourceUpdatedAt,
        stat_hash: computeStatHash(networkId, gameName, sourceUpdatedAt, kills, deaths, timePlayed)
    };
}

export function readIngestionRowsFromDatabaseContext(plugin, cursorFromUtc, trigger, done) {
    let context = null;

    try {
        if (!plugin.dbContextFactory) {
            done(new Error('IDatabaseContextFactory service is unavailable in script runtime.'), []);
            return;
        }

        const server = serverFromTrigger(plugin, trigger);
        if (!server) {
            done(new Error('No active server context available for stats ingestion.'), []);
            return;
        }

        const connectedClients = toArray(valueFromAny(server, ['connectedClients', 'ConnectedClients', 'clients', 'Clients'], null));
        logServerClientSample(plugin, server, connectedClients);

        const clientIds = extractServerClientIds(server);
        plugin.logger.logInformation('{Name}: Preparing stats pull for server={Server} with client_ids=[{ClientIds}]',
            plugin.name,
            String(server.toString ? server.toString() : 'unknown'),
            clientIds.join(','));
        if (clientIds.length === 0) {
            plugin.logger.logInformation('{Name}: No connected client ids available for stats pull on {Server}', plugin.name, String(server.toString ? server.toString() : 'unknown'));
            done(null, []);
            return;
        }

        context = plugin.dbContextFactory.createContext(false);
        if (!context) {
            done(new Error('IDatabaseContextFactory returned null context.'), []);
            return;
        }

        const basicByClientId = buildBasicDataByClientId(context, clientIds);
        const basicRows = Object.values(basicByClientId);
        const statRows = statRowsForServer(context, clientIds, server);
        logContextDataSample(plugin, basicRows, statRows);

        plugin.logger.logInformation('{Name}: stats pull returned {StatsCount} stat rows and {BasicCount} basic rows for {ClientCount} client ids',
            plugin.name,
            statRows.length,
            basicRows.length,
            clientIds.length);
        const rows = [];

        for (let i = 0; i < statRows.length; i++) {
            const stat = statRows[i];
            const clientId = parseIntSafe(valueFromAny(stat, ['ClientId', 'clientId'], 0));
            const basic = basicByClientId[clientId] || null;
            const row = buildRowFromStat(stat, basic, plugin, server);
            if (!row) continue;

            plugin.logger.logInformation('{Name}: Row candidate client_id={ClientId} network_id={NetworkId} display={Display} searchable={Searchable} kills={Kills} deaths={Deaths} updated_at={UpdatedAt} basic_name={BasicName} stat_game={StatGame}',
                plugin.name,
                row.client_id,
                row.network_id,
                row.display_name || '(blank)',
                row.searchable_name || '(blank)',
                row.total_kills,
                row.total_deaths,
                row.source_updated_at_utc || '(blank)',
                String(valueFromAnyPath(basic, ['Name', 'name', 'AliasName', 'aliasName', 'Alias.Name', 'alias.name', 'CurrentAlias.Name', 'currentAlias.name'], '') || '(blank)'),
                String(valueFromAny(stat, ['GameName', 'gameName'], '') || '(blank)'));
            
            if (cursorFromUtc && row.source_updated_at_utc && String(row.source_updated_at_utc) <= String(cursorFromUtc)) {
                continue;
            }

            rows.push(row);
        }

        rows.sort((a, b) => {
            const left = String(a.source_updated_at_utc || '');
            const right = String(b.source_updated_at_utc || '');
            if (left < right) return -1;
            if (left > right) return 1;
            return parseIntSafe(a.client_id) - parseIntSafe(b.client_id);
        });

        done(null, rows);
    } catch (error) {
        done(new Error(error && error.message ? error.message : 'unknown database context read error'), []);
    } finally {
        try { if (context && typeof context.Dispose === 'function') context.Dispose(); } catch (_) { }
    }
}

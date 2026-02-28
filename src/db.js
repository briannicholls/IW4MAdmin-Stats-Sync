import {
    escapeSqlLiteral,
    cleanName,
    normalizeNetworkId,
    dbValueToString,
    dbValueToInt,
    dbValueToFloat,
    computeStatHash
} from './utils.js';

function buildIngestionQuery(cursorFromUtc) {
    let whereClause = 'WHERE c.Active = 1 AND c.NetworkId IS NOT NULL AND c.NetworkId != 0';
    if (cursorFromUtc) {
        whereClause += " AND COALESCE(s.UpdatedAt, c.LastConnection, c.FirstConnection) > '" + escapeSqlLiteral(cursorFromUtc) + "'";
    }

    return [
        'SELECT',
        '  c.ClientId AS ClientId,',
        '  c.NetworkId AS NetworkId,',
        '  c.GameName AS GameName,',
        '  COALESCE(a.Name, "") AS AliasName,',
        '  COALESCE(a.SearchableName, "") AS SearchableName,',
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
        'GROUP BY c.ClientId, c.NetworkId, c.GameName, a.Name, a.SearchableName',
        'ORDER BY SourceUpdatedAt ASC, c.ClientId ASC'
    ].join(' ');
}

export function readIngestionRowsFromDatabaseContext(plugin, cursorFromUtc, done) {
    let context = null;
    let connection = null;
    let reader = null;

    try {
        if (!plugin.dbContextFactory) {
            done(new Error('IDatabaseContextFactory service is unavailable in script runtime.'), []);
            return;
        }

        context = plugin.dbContextFactory.CreateContext(false);
        if (!context || !context.Database || typeof context.Database.GetDbConnection !== 'function') {
            done(new Error('Unable to create database context connection from IDatabaseContextFactory.'), []);
            return;
        }

        connection = context.Database.GetDbConnection();
        if (!connection) {
            done(new Error('IDatabaseContextFactory returned a null DbConnection.'), []);
            return;
        }

        connection.Open();

        const command = connection.CreateCommand();
        command.CommandText = buildIngestionQuery(cursorFromUtc);
        reader = command.ExecuteReader();

        const dbNull = System.DBNull.Value;
        const rows = [];

        while (reader.Read()) {
            const networkId = normalizeNetworkId(dbValueToString(reader['NetworkId'], dbNull));
            if (!networkId) continue;

            const gameName = dbValueToString(reader['GameName'], dbNull);
            const kills = dbValueToInt(reader['Kills'], dbNull);
            const deaths = dbValueToInt(reader['Deaths'], dbNull);
            const timePlayed = dbValueToInt(reader['TimePlayed'], dbNull);
            const sourceUpdatedAt = dbValueToString(reader['SourceUpdatedAt'], dbNull);
            const liveName = (plugin.runtime.liveNameByNetworkId || {})[networkId] || '';
            const aliasName = dbValueToString(reader['AliasName'], dbNull);

            rows.push({
                client_id: dbValueToInt(reader['ClientId'], dbNull),
                network_id: networkId,
                game_name: gameName,
                display_name: cleanName(liveName || aliasName || ('client_' + networkId)),
                searchable_name: dbValueToString(reader['SearchableName'], dbNull),
                total_kills: kills,
                total_deaths: deaths,
                total_time_played_seconds: timePlayed,
                average_spm: dbValueToFloat(reader['SPM'], dbNull),
                average_skill: dbValueToFloat(reader['Skill'], dbNull),
                average_zscore: dbValueToFloat(reader['ZScore'], dbNull),
                average_elo_rating: dbValueToFloat(reader['EloRating'], dbNull),
                average_rolling_weighted_kdr: dbValueToFloat(reader['RollingWeightedKDR'], dbNull),
                total_connections: dbValueToInt(reader['Connections'], dbNull),
                total_connection_time_seconds: dbValueToInt(reader['TotalConnectionTime'], dbNull),
                last_connection_utc: dbValueToString(reader['LastConnection'], dbNull),
                source_updated_at_utc: sourceUpdatedAt,
                stat_hash: computeStatHash(networkId, gameName, sourceUpdatedAt, kills, deaths, timePlayed)
            });
        }

        done(null, rows);
    } catch (error) {
        done(new Error(error && error.message ? error.message : 'unknown database context read error'), []);
    } finally {
        try { if (reader) reader.Close(); } catch (_) { }
        try { if (connection) connection.Close(); } catch (_) { }
        try { if (context && typeof context.Dispose === 'function') context.Dispose(); } catch (_) { }
    }
}

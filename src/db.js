import {
    escapeSqlLiteral, cleanName, normalizeNetworkId,
    dbValueToString, dbValueToInt, dbValueToFloat, computeStatHash
} from './utils.js';

export function buildLeaderboardQuery(cursorFromUtc) {
    let whereClause = 'WHERE c.Active = 1 AND c.NetworkId IS NOT NULL AND c.NetworkId != 0';
    if (cursorFromUtc) {
        whereClause += " AND COALESCE(s.UpdatedAt, c.LastConnection, c.FirstConnection) > '"
            + escapeSqlLiteral(cursorFromUtc)
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
}

export function readLeaderboardRows(dbPath, cursorFromUtc, liveNameByNetworkId, logger, debugState, pluginName) {
    const sqliteNs = importNamespace('System.Data.SQLite');
    const dbNull = System.DBNull.Value;
    const rows = [];
    let connection = null;
    let reader = null;

    const sql = buildLeaderboardQuery(cursorFromUtc);

    try {
        connection = new sqliteNs.SQLiteConnection('Data Source=' + dbPath + ';Read Only=True;');
        connection.Open();

        const command = connection.CreateCommand();
        command.CommandText = sql;
        reader = command.ExecuteReader();

        while (reader.Read()) {
            const networkId = dbValueToString(reader['NetworkId'], dbNull);
            if (!networkId) continue;

            const sourceUpdatedAt = dbValueToString(reader['SourceUpdatedAt'], dbNull);
            const liveName = liveNameByNetworkId[networkId] || '';
            const aliasName = dbValueToString(reader['AliasName'], dbNull);
            const displayName = cleanName(liveName || aliasName || ('client_' + networkId));

            rows.push({
                network_id: networkId,
                game_name: dbValueToString(reader['GameName'], dbNull),
                display_name: displayName,
                searchable_name: dbValueToString(reader['SearchableName'], dbNull),
                total_kills: dbValueToInt(reader['Kills'], dbNull),
                total_deaths: dbValueToInt(reader['Deaths'], dbNull),
                total_time_played_seconds: dbValueToInt(reader['TimePlayed'], dbNull),
                average_spm: dbValueToFloat(reader['SPM'], dbNull),
                average_skill: dbValueToFloat(reader['Skill'], dbNull),
                average_zscore: dbValueToFloat(reader['ZScore'], dbNull),
                average_elo_rating: dbValueToFloat(reader['EloRating'], dbNull),
                average_rolling_weighted_kdr: dbValueToFloat(reader['RollingWeightedKDR'], dbNull),
                total_connections: dbValueToInt(reader['Connections'], dbNull),
                total_connection_time_seconds: dbValueToInt(reader['TotalConnectionTime'], dbNull),
                last_connection_utc: dbValueToString(reader['LastConnection'], dbNull),
                source_updated_at_utc: sourceUpdatedAt,
                stat_hash: computeStatHash(
                    networkId,
                    dbValueToString(reader['GameName'], dbNull),
                    sourceUpdatedAt,
                    dbValueToInt(reader['Kills'], dbNull),
                    dbValueToInt(reader['Deaths'], dbNull),
                    dbValueToInt(reader['TimePlayed'], dbNull)
                )
            });
        }
    } catch (error) {
        debugState.lastStatus = 'db_error';
        debugState.lastError = error && error.message ? error.message : 'unknown db error';
        debugState.totalFailures += 1;
        logger.logError('{Name}: Failed to read SQLite data from {Db} - {Error}',
            pluginName, dbPath, debugState.lastError);
        return [];
    } finally {
        try { if (reader) reader.Close(); } catch (_) { }
        try { if (connection) connection.Close(); } catch (_) { }
    }

    return rows;
}

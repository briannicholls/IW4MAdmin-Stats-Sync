import { responseToText, parseApiResponse } from './api.js';
import { cleanName, normalizeNetworkId, computeStatHash, snippet } from './utils.js';

function createHeaders(cookieValue) {
    const stringDict = System.Collections.Generic.Dictionary(System.String, System.String);
    const headers = new stringDict();
    if (cookieValue) {
        headers.add('Cookie', cookieValue);
    }
    return headers;
}

function requestJson(plugin, url, method, bodyObj, headers, done) {
    try {
        const pluginScript = importNamespace('IW4MAdmin.Application.Plugin.Script');
        const body = bodyObj ? JSON.stringify(bodyObj) : '';
        const request = new pluginScript.ScriptPluginWebRequest(
            url,
            body,
            method,
            'application/json',
            headers
        );

        plugin.pluginHelper.requestUrl(request, (response) => {
            const text = responseToText(response);
            if (String(text || '').trim() === '') {
                done(true, null, text, response);
                return;
            }
            try {
                const parsed = parseApiResponse(response, text);
                done(true, parsed, text, response);
            } catch (_err) {
                done(false, null, text, response);
            }
        });
    } catch (error) {
        done(false, null, error && error.message ? error.message : 'request setup failed', null);
    }
}

function getSetCookieHeader(response) {
    if (!response) return '';

    try {
        if (response.headers && response.headers['Set-Cookie']) {
            return String(response.headers['Set-Cookie']);
        }
        if (response.Headers && typeof response.Headers.GetValues === 'function') {
            const values = response.Headers.GetValues('Set-Cookie');
            if (values && values.length > 0) return String(values[0]);
        }
    } catch (_) { }

    return '';
}

function cookieToSessionHeader(setCookieHeader) {
    if (!setCookieHeader) return '';
    const firstPart = String(setCookieHeader).split(';')[0];
    return firstPart || '';
}

function normalizeTimestamp(value) {
    if (value == null) return '';
    return String(value).trim();
}

function pickValue(obj, paths, fallback) {
    if (!obj || typeof obj !== 'object') return fallback;
    for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        if (!p) continue;
        if (Object.prototype.hasOwnProperty.call(obj, p) && obj[p] != null) {
            return obj[p];
        }
    }
    return fallback;
}

function extractRows(parsed) {
    if (!parsed) return [];
    if (Array.isArray(parsed)) return parsed;

    const candidates = ['results', 'data', 'players', 'clients', 'stats', 'topStats', 'Items', 'items'];
    for (let i = 0; i < candidates.length; i++) {
        const key = candidates[i];
        if (Array.isArray(parsed[key])) return parsed[key];
    }
    return [];
}

function normalizeOnePlayer(raw, liveNameByNetworkId) {
    const networkIdRaw = pickValue(raw, ['networkId', 'NetworkId', 'clientGuid', 'ClientGuid', 'guid'], null);
    const networkId = normalizeNetworkId(networkIdRaw);
    if (!networkId) return null;

    const gameNameRaw = pickValue(raw, ['gameName', 'GameName', 'game', 'Game'], 'unknown');
    const gameName = String(gameNameRaw == null ? 'unknown' : gameNameRaw).trim() || 'unknown';

    const nameRaw = pickValue(raw, ['name', 'Name', 'clientName', 'ClientName', 'alias', 'Alias'], '');
    const searchableRaw = pickValue(raw, ['searchableName', 'SearchableName'], '');
    const liveName = liveNameByNetworkId[networkId] || '';
    const displayName = cleanName(liveName || nameRaw || ('client_' + networkId));
    const searchableName = cleanName(searchableRaw || displayName.toLowerCase());

    const kills = parseInt(pickValue(raw, ['kills', 'Kills', 'totalKills', 'TotalKills'], 0), 10) || 0;
    const deaths = parseInt(pickValue(raw, ['deaths', 'Deaths', 'totalDeaths', 'TotalDeaths'], 0), 10) || 0;
    const timePlayed = parseInt(pickValue(raw, ['timePlayed', 'TimePlayed', 'totalTimePlayedSeconds', 'TotalTimePlayedSeconds'], 0), 10) || 0;
    const averageSpm = parseFloat(pickValue(raw, ['spm', 'SPM', 'averageSpm', 'AverageSpm'], 0)) || 0;
    const averageSkill = parseFloat(pickValue(raw, ['skill', 'Skill', 'averageSkill', 'AverageSkill'], 0)) || 0;
    const averageZScore = parseFloat(pickValue(raw, ['zScore', 'ZScore', 'averageZScore', 'AverageZScore'], 0)) || 0;
    const averageElo = parseFloat(pickValue(raw, ['eloRating', 'EloRating', 'averageEloRating', 'AverageEloRating'], 0)) || 0;
    const averageRwKdr = parseFloat(pickValue(raw, ['rollingWeightedKdr', 'RollingWeightedKDR', 'averageRollingWeightedKdr', 'AverageRollingWeightedKDR'], 0)) || 0;
    const totalConnections = parseInt(pickValue(raw, ['connections', 'Connections', 'totalConnections', 'TotalConnections'], 0), 10) || 0;
    const totalConnectionTime = parseInt(pickValue(raw, ['totalConnectionTime', 'TotalConnectionTime', 'totalConnectionTimeSeconds', 'TotalConnectionTimeSeconds'], 0), 10) || 0;
    const lastConnection = normalizeTimestamp(pickValue(raw, ['lastConnection', 'LastConnection', 'updatedAt', 'UpdatedAt'], ''));
    const sourceUpdatedAt = normalizeTimestamp(pickValue(raw, ['updatedAt', 'UpdatedAt', 'lastConnection', 'LastConnection'], lastConnection));

    return {
        network_id: networkId,
        game_name: gameName,
        display_name: displayName,
        searchable_name: searchableName,
        total_kills: kills,
        total_deaths: deaths,
        total_time_played_seconds: timePlayed,
        average_spm: Number(averageSpm.toFixed(4)),
        average_skill: Number(averageSkill.toFixed(4)),
        average_zscore: Number(averageZScore.toFixed(4)),
        average_elo_rating: Number(averageElo.toFixed(4)),
        average_rolling_weighted_kdr: Number(averageRwKdr.toFixed(4)),
        total_connections: totalConnections,
        total_connection_time_seconds: totalConnectionTime,
        last_connection_utc: lastConnection,
        source_updated_at_utc: sourceUpdatedAt,
        stat_hash: computeStatHash(networkId, gameName, sourceUpdatedAt, kills, deaths, timePlayed)
    };
}

function summarizeFieldCoverage(rows) {
    const coverage = {
        with_kills: 0,
        with_deaths: 0,
        with_time_played: 0,
        with_spm: 0,
        with_skill: 0,
        with_zscore: 0,
        with_elo: 0,
        with_rw_kdr: 0,
        with_connections: 0,
        with_source_updated_at: 0
    };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || {};
        if (Number(row.total_kills || 0) > 0) coverage.with_kills += 1;
        if (Number(row.total_deaths || 0) > 0) coverage.with_deaths += 1;
        if (Number(row.total_time_played_seconds || 0) > 0) coverage.with_time_played += 1;
        if (Number(row.average_spm || 0) > 0) coverage.with_spm += 1;
        if (Number(row.average_skill || 0) > 0) coverage.with_skill += 1;
        if (Number(row.average_zscore || 0) !== 0) coverage.with_zscore += 1;
        if (Number(row.average_elo_rating || 0) > 0) coverage.with_elo += 1;
        if (Number(row.average_rolling_weighted_kdr || 0) > 0) coverage.with_rw_kdr += 1;
        if (Number(row.total_connections || 0) > 0) coverage.with_connections += 1;
        if (String(row.source_updated_at_utc || '').trim() !== '') coverage.with_source_updated_at += 1;
    }

    return coverage;
}

function shouldIncludeByCursor(row, cursorFromUtc) {
    if (!cursorFromUtc) return true;
    const sourceUpdatedAt = row && row.source_updated_at_utc ? String(row.source_updated_at_utc) : '';
    if (!sourceUpdatedAt) return true;
    return sourceUpdatedAt > cursorFromUtc;
}

function fetchTopPage(plugin, cookieHeader, offset, count, done) {
    const url = plugin.config.webfrontBaseUrl + '/api/stats/top?count=' + count + '&offset=' + offset;
    requestJson(plugin, url, 'GET', null, createHeaders(cookieHeader), (ok, parsed, text, _response) => {
        if (!ok) {
            done(new Error('webfront /api/stats/top parse/request failed: ' + snippet(text)), null);
            return;
        }

        const rows = extractRows(parsed);
        done(null, {
            rows: rows,
            parsed: parsed
        });
    });
}

function loginWebfrontIfNeeded(plugin, done) {
    const clientId = String(plugin.config.webfrontClientId || '').trim();
    const password = String(plugin.config.webfrontPassword || '').trim();
    if (!clientId || !password) {
        done(null, '');
        return;
    }

    const url = plugin.config.webfrontBaseUrl + '/api/client/' + encodeURIComponent(clientId) + '/login';
    const headers = createHeaders('');
    headers.add('Content-Type', 'application/json');

    requestJson(plugin, url, 'POST', { password: password }, headers, (ok, _parsed, text, response) => {
        if (!ok) {
            done(new Error('webfront login failed: ' + snippet(text)), null);
            return;
        }

        const setCookie = getSetCookieHeader(response);
        const cookieHeader = cookieToSessionHeader(setCookie);
        if (!cookieHeader) {
            done(new Error('webfront login succeeded but no session cookie found'), null);
            return;
        }

        done(null, cookieHeader);
    });
}

export function readLeaderboardRowsFromWebfront(plugin, cursorFromUtc, done) {
    loginWebfrontIfNeeded(plugin, (loginError, cookieHeader) => {
        if (loginError) {
            done(loginError, []);
            return;
        }

        const pageSize = Math.max(25, parseInt(plugin.config.webfrontPageSize, 10) || 200);
        const maxPages = Math.max(1, parseInt(plugin.config.webfrontMaxPages, 10) || 250);
        const byIdentity = {};
        let skippedMissingNetwork = 0;
        let page = 0;

        const next = () => {
            if (page >= maxPages) {
                const finalRows = Object.keys(byIdentity).map((k) => byIdentity[k]);
                const sample = finalRows.length > 0 ? JSON.stringify(finalRows[0]).substring(0, 700) : '{}';
                const coverage = summarizeFieldCoverage(finalRows);
                plugin.logger.logWarning('{Name}: Reached webfrontMaxPages={MaxPages}. Returning {Rows} rows. Coverage={Coverage} Sample={Sample}',
                    plugin.name,
                    maxPages,
                    finalRows.length,
                    JSON.stringify(coverage),
                    sample);
                done(null, finalRows);
                return;
            }

            const offset = page * pageSize;
            fetchTopPage(plugin, cookieHeader, offset, pageSize, (error, result) => {
                if (error) {
                    done(error, []);
                    return;
                }

                const rawRows = result && result.rows ? result.rows : [];
                if (page === 0 && plugin.debugEnabled) {
                    const first = rawRows.length > 0 ? rawRows[0] : null;
                    if (first) {
                        plugin.logDebug('{Name}: Webfront sample row keys: {Keys}', plugin.name, Object.keys(first).join(','));
                    }
                }

                if (rawRows.length === 0) {
                    const finalRows = Object.keys(byIdentity).map((k) => byIdentity[k]);
                    const sample = finalRows.length > 0 ? JSON.stringify(finalRows[0]).substring(0, 700) : '{}';
                    const coverage = summarizeFieldCoverage(finalRows);
                    plugin.logger.logInformation('{Name}: Webfront returned empty page at offset {Offset}. Returning {Rows} rows. Coverage={Coverage} Sample={Sample}',
                        plugin.name,
                        offset,
                        finalRows.length,
                        JSON.stringify(coverage),
                        sample);
                    done(null, finalRows);
                    return;
                }

                for (let i = 0; i < rawRows.length; i++) {
                    const normalized = normalizeOnePlayer(rawRows[i], plugin.runtime.liveNameByNetworkId || {});
                    if (!normalized) {
                        skippedMissingNetwork += 1;
                        continue;
                    }
                    if (!shouldIncludeByCursor(normalized, cursorFromUtc)) continue;
                    const key = normalized.game_name + ':' + normalized.network_id;
                    byIdentity[key] = normalized;
                }

                if (rawRows.length < pageSize) {
                    if (skippedMissingNetwork > 0) {
                        plugin.logger.logWarning('{Name}: Webfront rows skipped due to missing network id: {Count}', plugin.name, skippedMissingNetwork);
                    }
                    const finalRows = Object.keys(byIdentity).map((k) => byIdentity[k]);
                    const sample = finalRows.length > 0 ? JSON.stringify(finalRows[0]).substring(0, 700) : '{}';
                    const coverage = summarizeFieldCoverage(finalRows);
                    plugin.logger.logInformation(
                        '{Name}: Webfront sync read {Rows} unique player rows across {Pages} page(s). Coverage={Coverage} Sample={Sample}',
                        plugin.name,
                        finalRows.length,
                        page + 1,
                        JSON.stringify(coverage),
                        sample
                    );
                    done(null, finalRows);
                    return;
                }

                page += 1;
                next();
            });
        };

        next();
    });
}

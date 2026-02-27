import { responseToText, parseApiResponse } from './api.js';
import { cleanName, getServerKey, normalizeNetworkId, snippet } from './utils.js';

function splitCsv(value) {
    if (!value) return [];
    const raw = String(value).split(',');
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        const item = String(raw[i] || '').trim();
        if (item) out.push(item);
    }
    return out;
}

function createHeaders(config, includeJsonContentType) {
    const stringDict = System.Collections.Generic.Dictionary(System.String, System.String);
    const headers = new stringDict();
    if (includeJsonContentType) {
        headers.add('Content-Type', 'application/json');
    }

    if (config.discordBotToken) {
        const token = String(config.discordBotToken);
        const authValue = token.indexOf('Bot ') === 0 ? token : ('Bot ' + token);
        headers.add('Authorization', authValue);
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
                done(true, null, text);
                return;
            }
            try {
                const parsed = parseApiResponse(response, text);
                done(true, parsed, text);
            } catch (_err) {
                done(false, null, text);
            }
        });
    } catch (error) {
        done(false, null, error && error.message ? error.message : 'request setup failed');
    }
}

function getPlayerCountFromServer(server) {
    if (!server) return null;

    const candidateProps = ['clientCount', 'numClients', 'currentPlayers', 'connectedClients'];
    for (let i = 0; i < candidateProps.length; i++) {
        const key = candidateProps[i];
        const value = server[key];
        const n = parseInt(value, 10);
        if (Number.isFinite(n) && n >= 0) return n;
    }

    const clients = server.clients || server.Clients;
    if (!clients) return null;

    if (Array.isArray(clients)) {
        return clients.length;
    }

    const count = parseInt(clients.Count, 10);
    if (Number.isFinite(count) && count >= 0) return count;
    return null;
}

function compareSnowflakes(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (left.length !== right.length) {
        return left.length > right.length ? 1 : -1;
    }
    if (left === right) return 0;
    return left > right ? 1 : -1;
}

function normalizeCommand(raw) {
    const text = String(raw || '').trim();
    if (!text) return '';

    const tokens = text.split(/\s+/);
    if (tokens.length === 0) return '';

    const verb = tokens[0].toLowerCase();
    if ((verb === 'map' || verb === 'changemap') && tokens.length >= 2) {
        return 'map ' + tokens.slice(1).join(' ');
    }
    if (verb === 'say' && tokens.length >= 2) {
        return 'say ' + tokens.slice(1).join(' ');
    }
    return text;
}

function runServerCommand(plugin, server, commandText) {
    if (!server || !commandText) {
        return { ok: false, reason: 'missing server or command' };
    }

    try {
        if (typeof server.executeCommand === 'function') {
            server.executeCommand(commandText);
            return { ok: true };
        }
        if (typeof server.ExecuteCommand === 'function') {
            server.ExecuteCommand(commandText);
            return { ok: true };
        }
        if (plugin.manager && typeof plugin.manager.executeCommand === 'function') {
            plugin.manager.executeCommand(server, commandText);
            return { ok: true };
        }
        if (plugin.manager && typeof plugin.manager.ExecuteCommand === 'function') {
            plugin.manager.ExecuteCommand(server, commandText);
            return { ok: true };
        }
    } catch (error) {
        return {
            ok: false,
            reason: error && error.message ? error.message : 'exception while executing command'
        };
    }

    return { ok: false, reason: 'no compatible command API found on server/manager' };
}

function sendDiscordWebhook(plugin, messageText) {
    if (!plugin.config.discordWebhookUrl) return;
    const headers = createHeaders(plugin.config, true);

    requestJson(
        plugin,
        plugin.config.discordWebhookUrl,
        'POST',
        { content: messageText },
        headers,
        (ok, _parsed, text) => {
            if (!ok) {
                plugin.logDebug('{Name}: Discord webhook send failed: {Error}', plugin.name, snippet(text));
            }
        }
    );
}

function sendDiscordChannelMessage(plugin, content) {
    if (!plugin.config.discordBotToken || !plugin.config.discordChannelId) return;
    const headers = createHeaders(plugin.config, true);
    const url = 'https://discord.com/api/v10/channels/' + plugin.config.discordChannelId + '/messages';

    requestJson(plugin, url, 'POST', { content: content }, headers, (ok, _parsed, text) => {
        if (!ok) {
            plugin.logDebug('{Name}: Discord bot reply failed: {Error}', plugin.name, snippet(text));
        }
    });
}

function maybeSendPlayerThresholdAlert(plugin, serverKey, serverName, playerCount) {
    const state = plugin.runtime.discordAlertStateByServer[serverKey] || {
        overLowSent: false,
        overHighSent: false
    };

    const low = plugin.config.discordThresholdLow;
    const high = plugin.config.discordThresholdHigh;

    if (playerCount <= low) {
        state.overLowSent = false;
    }
    if (playerCount <= high) {
        state.overHighSent = false;
    }

    if (playerCount > low && !state.overLowSent) {
        sendDiscordWebhook(
            plugin,
            ':rotating_light: `' + serverName + '` crossed `' + low + '` players (now `' + playerCount + '`).'
        );
        state.overLowSent = true;
    }

    if (playerCount > high && !state.overHighSent) {
        sendDiscordWebhook(
            plugin,
            ':fire: `' + serverName + '` crossed `' + high + '` players (now `' + playerCount + '`).'
        );
        state.overHighSent = true;
    }

    plugin.runtime.discordAlertStateByServer[serverKey] = state;
}

function getServerName(server, serverKey) {
    if (!server) return serverKey;
    return cleanName(server.serverName || server.hostname || serverKey);
}

export function trackServerPopulation(plugin, eventObj, isDisconnect) {
    const server = eventObj && eventObj.server ? eventObj.server : null;
    if (!server) return;

    const serverKey = getServerKey(server);
    plugin.runtime.serverByKey[serverKey] = server;
    plugin.runtime.lastActiveServerKey = serverKey;

    const client = eventObj && eventObj.client ? eventObj.client : (eventObj && eventObj.origin ? eventObj.origin : null);
    const networkId = normalizeNetworkId(client && client.networkId ? client.networkId : null);

    if (!plugin.runtime.activeNetworkIdsByServer[serverKey]) {
        plugin.runtime.activeNetworkIdsByServer[serverKey] = {};
    }
    if (networkId && isDisconnect) {
        delete plugin.runtime.activeNetworkIdsByServer[serverKey][networkId];
    } else if (networkId) {
        plugin.runtime.activeNetworkIdsByServer[serverKey][networkId] = true;
    }

    let count = getPlayerCountFromServer(server);
    if (count == null) {
        const ids = plugin.runtime.activeNetworkIdsByServer[serverKey];
        count = Object.keys(ids).length;
    }

    plugin.runtime.playerCountByServer[serverKey] = count;
    maybeSendPlayerThresholdAlert(plugin, serverKey, getServerName(server, serverKey), count);
}

function getTargetServer(plugin, hintServer) {
    if (hintServer) return { server: hintServer, error: '' };

    const keys = Object.keys(plugin.runtime.serverByKey || {});
    if (keys.length === 0) {
        return { server: null, error: 'No servers have reported activity yet.' };
    }
    if (keys.length === 1) {
        return { server: plugin.runtime.serverByKey[keys[0]], error: '' };
    }

    return {
        server: null,
        error: 'Multiple active servers detected. Use `!iw4 servers` then target one with `!iw4 @<server_key> <command>`.'
    };
}

function listKnownServers(plugin) {
    const keys = Object.keys(plugin.runtime.serverByKey || {});
    if (keys.length === 0) {
        return 'No active servers discovered yet.';
    }

    const lines = [];
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const server = plugin.runtime.serverByKey[key];
        const count = plugin.runtime.playerCountByServer[key];
        const name = getServerName(server, key);
        const countText = Number.isFinite(count) ? String(count) : '?';
        lines.push('`' + key + '` (' + name + ', players: ' + countText + ')');
    }
    return 'Known servers:\n- ' + lines.join('\n- ');
}

function resolveServerBySelector(plugin, selector) {
    const needle = String(selector || '').trim().toLowerCase();
    if (!needle) return { server: null, error: 'Missing server selector.' };

    const keys = Object.keys(plugin.runtime.serverByKey || {});
    if (keys.length === 0) {
        return { server: null, error: 'No active servers discovered yet.' };
    }

    const matches = [];
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const server = plugin.runtime.serverByKey[key];
        const serverName = getServerName(server, key).toLowerCase();
        const keyLower = key.toLowerCase();

        if (keyLower === needle || serverName === needle) {
            return { server: server, error: '' };
        }

        if (keyLower.indexOf(needle) !== -1 || serverName.indexOf(needle) !== -1) {
            matches.push({ key: key, server: server });
        }
    }

    if (matches.length === 1) {
        return { server: matches[0].server, error: '' };
    }

    if (matches.length > 1) {
        return {
            server: null,
            error: 'Server selector matches multiple servers. Use a more specific key from `!iw4 servers`.'
        };
    }

    return { server: null, error: 'Server not found. Use `!iw4 servers` to list available targets.' };
}

function parseTargetedCommand(cmdBody) {
    const text = String(cmdBody || '').trim();
    if (!text) {
        return { selector: '', commandText: '' };
    }

    const firstSpace = text.indexOf(' ');
    const firstToken = firstSpace === -1 ? text : text.substring(0, firstSpace);
    if (firstToken.charAt(0) !== '@') {
        return { selector: '', commandText: text };
    }

    const selector = firstToken.substring(1).trim();
    const remainder = firstSpace === -1 ? '' : text.substring(firstSpace + 1).trim();
    return { selector: selector, commandText: remainder };
}

function extractCommand(content, prefix) {
    const text = String(content || '').trim();
    if (!text) return '';

    const normalizedPrefix = String(prefix || '!iw4').trim();
    if (!normalizedPrefix) return '';

    const lowerText = text.toLowerCase();
    const lowerPrefix = normalizedPrefix.toLowerCase();
    if (lowerText.indexOf(lowerPrefix) !== 0) return '';

    return text.substring(normalizedPrefix.length).trim();
}

function processDiscordCommand(plugin, message, hintServer) {
    const authorId = message && message.author && message.author.id ? String(message.author.id) : '';
    const authorName = message && message.author && message.author.username ? String(message.author.username) : 'unknown';
    const content = message && message.content ? String(message.content) : '';

    const allowedIds = splitCsv(plugin.config.discordAllowedUserIds);
    if (allowedIds.indexOf(authorId) === -1) return;

    const cmdBody = extractCommand(content, plugin.config.discordCommandPrefix);
    if (!cmdBody) return;

    const lowerBody = cmdBody.toLowerCase();
    if (lowerBody === 'servers' || lowerBody === 'list') {
        sendDiscordChannelMessage(plugin, listKnownServers(plugin));
        return;
    }
    if (lowerBody === 'help') {
        sendDiscordChannelMessage(
            plugin,
            'Usage:\n'
            + '- `!iw4 servers` (list server keys)\n'
            + '- `!iw4 map mp_terminal` (works when exactly one server is active)\n'
            + '- `!iw4 @<server_key> map mp_terminal` (target specific server)\n'
            + '- `!iw4 @<server_key> say hello`'
        );
        return;
    }

    const targeted = parseTargetedCommand(cmdBody);
    if (!targeted.commandText) {
        sendDiscordChannelMessage(plugin, 'No command provided. Try `!iw4 help`.');
        return;
    }

    const commandText = normalizeCommand(targeted.commandText);
    if (!commandText) return;

    let selected;
    if (targeted.selector) {
        selected = resolveServerBySelector(plugin, targeted.selector);
    } else {
        selected = getTargetServer(plugin, hintServer);
    }

    if (!selected.server) {
        sendDiscordChannelMessage(plugin, (selected.error || 'No target server available.') + ' Command: `' + commandText + '`');
        return;
    }

    const server = selected.server;

    const result = runServerCommand(plugin, server, commandText);
    const serverKey = getServerKey(server);
    if (result.ok) {
        plugin.logger.logInformation('{Name}: Discord command by {User} ({Id}) on {Server}: {Command}',
            plugin.name, authorName, authorId, serverKey, commandText);
        sendDiscordChannelMessage(plugin, 'Executed on `' + serverKey + '`: `' + commandText + '`');
    } else {
        plugin.logger.logWarning('{Name}: Discord command failed by {User} ({Id}) on {Server}: {Reason}',
            plugin.name, authorName, authorId, serverKey, result.reason);
        sendDiscordChannelMessage(plugin, 'Failed to execute `' + commandText + '` on `' + serverKey + '`: ' + (result.reason || 'unknown reason'));
    }
}

export function pollDiscordCommands(plugin, hintServer) {
    if (!plugin.config.discordBotToken || !plugin.config.discordChannelId) return;
    const allowedIds = splitCsv(plugin.config.discordAllowedUserIds);
    if (allowedIds.length === 0) return;

    if (plugin.runtime.discordPollInFlight) return;
    const nowMs = Date.now();
    const minGap = Math.max(5, parseInt(plugin.config.discordPollIntervalSeconds, 10) || 15) * 1000;
    if (nowMs - plugin.runtime.lastDiscordPollAtMs < minGap) return;

    plugin.runtime.lastDiscordPollAtMs = nowMs;
    plugin.runtime.discordPollInFlight = true;

    const headers = createHeaders(plugin.config, false);
    const url = 'https://discord.com/api/v10/channels/' + plugin.config.discordChannelId + '/messages?limit=25';

    requestJson(plugin, url, 'GET', null, headers, (ok, parsed, text) => {
        plugin.runtime.discordPollInFlight = false;

        if (!ok || !Array.isArray(parsed)) {
            plugin.logDebug('{Name}: Discord poll failed: {Error}', plugin.name, snippet(text));
            return;
        }

        if (parsed.length === 0) return;

        let newestId = plugin.runtime.lastDiscordMessageId || '';
        for (let i = 0; i < parsed.length; i++) {
            const msgId = parsed[i] && parsed[i].id ? String(parsed[i].id) : '';
            if (!msgId) continue;
            if (!newestId || compareSnowflakes(msgId, newestId) > 0) {
                newestId = msgId;
            }
        }

        if (!plugin.runtime.lastDiscordMessageId) {
            plugin.runtime.lastDiscordMessageId = newestId;
            plugin.configWrapper.setValue('discordLastMessageId', newestId);
            plugin.logDebug('{Name}: Discord command poll initialized at message {Id}', plugin.name, newestId);
            return;
        }

        const fresh = [];
        for (let j = 0; j < parsed.length; j++) {
            const candidate = parsed[j];
            const candidateId = candidate && candidate.id ? String(candidate.id) : '';
            if (!candidateId) continue;
            if (compareSnowflakes(candidateId, plugin.runtime.lastDiscordMessageId) > 0) {
                fresh.push(candidate);
            }
        }

        fresh.sort((a, b) => compareSnowflakes(a.id, b.id));
        for (let k = 0; k < fresh.length; k++) {
            processDiscordCommand(plugin, fresh[k], hintServer);
        }

        if (newestId && (!plugin.runtime.lastDiscordMessageId || compareSnowflakes(newestId, plugin.runtime.lastDiscordMessageId) > 0)) {
            plugin.runtime.lastDiscordMessageId = newestId;
            plugin.configWrapper.setValue('discordLastMessageId', newestId);
        }
    });
}

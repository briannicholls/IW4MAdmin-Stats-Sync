export function cleanName(name) {
    return String(name == null ? '' : name).replace(/[\x00-\x1F\x7F]/g, '').trim();
}

export function normalizeNetworkId(value) {
    if (value == null) return '';
    const normalized = String(value).trim();
    if (!normalized || normalized === '0') return '';
    return normalized;
}

export function escapeSqlLiteral(value) {
    return String(value == null ? '' : value).replace(/'/g, "''");
}

export function snippet(text) {
    const s = text == null ? '' : String(text);
    return s.length > 220 ? s.substring(0, 220) : s;
}

export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

export function getServerKey(server) {
    if (!server) return 'unknown';
    try {
        const key = server.toString();
        if (key && key !== '') return key;
    } catch (_) { }
    return (server.listenAddress || server.id || 'unknown').toString();
}

export function dbValueToString(value, dbNull) {
    if (value == null || value === dbNull) return '';
    return String(value);
}

export function dbValueToInt(value, dbNull) {
    if (value == null || value === dbNull) return 0;
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function dbValueToFloat(value, dbNull) {
    if (value == null || value === dbNull) return 0;
    const parsed = parseFloat(String(value));
    return Number.isFinite(parsed) ? Number(parsed.toFixed(4)) : 0;
}

export function computeStatHash(networkId, gameName, sourceUpdatedAt, kills, deaths, timePlayed) {
    const parts = [
        String(networkId || ''),
        String(gameName || ''),
        String(sourceUpdatedAt || ''),
        String(kills || 0),
        String(deaths || 0),
        String(timePlayed || 0)
    ];
    return parts.join(':');
}

export function chunkRows(rows, chunkSize) {
    const out = [];
    const size = Math.max(1, parseInt(chunkSize, 10) || 500);
    for (let i = 0; i < rows.length; i += size) {
        out.push(rows.slice(i, i + size));
    }
    return out;
}

export function maxSourceUpdatedAt(rows) {
    let maxValue = null;
    for (let i = 0; i < rows.length; i++) {
        const value = rows[i] && rows[i].source_updated_at_utc ? String(rows[i].source_updated_at_utc) : '';
        if (!value) continue;
        if (maxValue == null || value > maxValue) {
            maxValue = value;
        }
    }
    return maxValue;
}

export function extractClientFromEvent(eventObj) {
    if (!eventObj) return null;
    if (eventObj.client) return eventObj.client;
    if (eventObj.origin) return eventObj.origin;
    return null;
}

export function parseCommand(commandEvent) {
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
}

var _b = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.js
  var index_exports = {};
  __export(index_exports, {
    commands: () => commands,
    init: () => init,
    plugin: () => plugin
  });

  // src/config.js
  var DEFAULT_API_URL = "http://localhost:6969/iw4m/leaderboard_snapshots";
  var defaultConfig = {
    apiKey: "",
    maxRetries: 1,
    maxRowsPerRequest: 500,
    minSecondsBetweenSyncs: 20,
    postMatchSyncDelaySeconds: 10,
    snapshotIntervalSeconds: 300,
    discordWebhookUrl: "",
    discordThresholdLow: 6,
    discordThresholdHigh: 10,
    discordBotToken: "",
    discordChannelId: "",
    discordAllowedUserIds: "",
    discordCommandPrefix: "!iw4",
    discordPollIntervalSeconds: 15
  };
  function sanitizeConfig(cfg) {
    const source = cfg || {};
    const parsedRetries = parseInt(source.maxRetries, 10);
    const parsedBatchSize = parseInt(source.maxRowsPerRequest, 10);
    const parsedCooldown = parseInt(source.minSecondsBetweenSyncs, 10);
    const parsedPostMatchDelay = parseInt(source.postMatchSyncDelaySeconds, 10);
    const parsedSnapshotInterval = parseInt(source.snapshotIntervalSeconds, 10);
    const parsedThresholdLow = parseInt(source.discordThresholdLow, 10);
    const parsedThresholdHigh = parseInt(source.discordThresholdHigh, 10);
    const parsedDiscordPollInterval = parseInt(source.discordPollIntervalSeconds, 10);
    const apiKey = source.apiKey == null ? "" : String(source.apiKey).trim();
    const discordWebhookUrl = source.discordWebhookUrl == null ? "" : String(source.discordWebhookUrl).trim();
    const discordBotToken = source.discordBotToken == null ? "" : String(source.discordBotToken).trim();
    const discordChannelId = source.discordChannelId == null ? "" : String(source.discordChannelId).trim();
    const discordAllowedUserIds = source.discordAllowedUserIds == null ? "" : String(source.discordAllowedUserIds).trim();
    const discordCommandPrefix = source.discordCommandPrefix == null || String(source.discordCommandPrefix).trim() === "" ? "!iw4" : String(source.discordCommandPrefix).trim();
    const thresholdLow = Number.isFinite(parsedThresholdLow) && parsedThresholdLow >= 1 ? parsedThresholdLow : 6;
    const thresholdHighRaw = Number.isFinite(parsedThresholdHigh) && parsedThresholdHigh >= 1 ? parsedThresholdHigh : 10;
    const thresholdHigh = thresholdHighRaw > thresholdLow ? thresholdHighRaw : thresholdLow + 1;
    return {
      apiKey,
      maxRetries: Number.isFinite(parsedRetries) && parsedRetries >= 0 ? parsedRetries : 1,
      maxRowsPerRequest: Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 500,
      minSecondsBetweenSyncs: Number.isFinite(parsedCooldown) && parsedCooldown > 0 ? parsedCooldown : 20,
      postMatchSyncDelaySeconds: Number.isFinite(parsedPostMatchDelay) && parsedPostMatchDelay >= 0 ? parsedPostMatchDelay : 10,
      snapshotIntervalSeconds: Number.isFinite(parsedSnapshotInterval) && parsedSnapshotInterval >= 5 ? parsedSnapshotInterval : 300,
      discordWebhookUrl,
      discordThresholdLow: thresholdLow,
      discordThresholdHigh: thresholdHigh,
      discordBotToken,
      discordChannelId,
      discordAllowedUserIds,
      discordCommandPrefix,
      discordPollIntervalSeconds: Number.isFinite(parsedDiscordPollInterval) && parsedDiscordPollInterval >= 5 ? parsedDiscordPollInterval : 15
    };
  }

  // src/utils.js
  function cleanName(name) {
    return String(name == null ? "" : name).replace(/[\x00-\x1F\x7F]/g, "").trim();
  }
  function normalizeNetworkId(value) {
    if (value == null) return "";
    const normalized = String(value).trim();
    if (!normalized || normalized === "0") return "";
    return normalized;
  }
  function snippet(text) {
    const s = text == null ? "" : String(text);
    return s.length > 220 ? s.substring(0, 220) : s;
  }
  function generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      return (c === "x" ? r : r & 3 | 8).toString(16);
    });
  }
  function getServerKey(server) {
    if (!server) return "unknown";
    try {
      const key = server.toString();
      if (key && key !== "") return key;
    } catch (_) {
    }
    return (server.listenAddress || server.id || "unknown").toString();
  }
  function computeStatHash(networkId, gameName, sourceUpdatedAt, kills, deaths, timePlayed) {
    const parts = [
      String(networkId || ""),
      String(gameName || ""),
      String(sourceUpdatedAt || ""),
      String(kills || 0),
      String(deaths || 0),
      String(timePlayed || 0)
    ];
    return parts.join(":");
  }
  function chunkRows(rows, chunkSize) {
    const out = [];
    const size = Math.max(1, parseInt(chunkSize, 10) || 500);
    for (let i = 0; i < rows.length; i += size) {
      out.push(rows.slice(i, i + size));
    }
    return out;
  }
  function maxSourceUpdatedAt(rows) {
    let maxValue = null;
    for (let i = 0; i < rows.length; i++) {
      const value = rows[i] && rows[i].source_updated_at_utc ? String(rows[i].source_updated_at_utc) : "";
      if (!value) continue;
      if (maxValue == null || value > maxValue) {
        maxValue = value;
      }
    }
    return maxValue;
  }
  function extractClientFromEvent(eventObj) {
    if (!eventObj) return null;
    if (eventObj.client) return eventObj.client;
    if (eventObj.origin) return eventObj.origin;
    return null;
  }
  function parseCommand(commandEvent) {
    const cmd = commandEvent.commandName || commandEvent.command || "";
    const argData = commandEvent.data || commandEvent.message || "";
    if (cmd && String(cmd).trim() !== "") {
      return {
        command: String(cmd).trim(),
        args: String(argData || "").trim()
      };
    }
    const text = String(argData || "").trim();
    if (!text || text.charAt(0) !== "!") return null;
    const body = text.substring(1).trim();
    if (!body) return null;
    const firstSpace = body.indexOf(" ");
    if (firstSpace === -1) {
      return { command: body, args: "" };
    }
    return {
      command: body.substring(0, firstSpace),
      args: body.substring(firstSpace + 1).trim()
    };
  }

  // src/db.js
  function valueFromAny(source, names, fallback) {
    if (!source) return fallback;
    for (let i = 0; i < names.length; i++) {
      const key = names[i];
      if (source[key] !== void 0 && source[key] !== null) return source[key];
    }
    return fallback;
  }
  function valueFromAnyPath(source, paths, fallback) {
    if (!source) return fallback;
    for (let i = 0; i < paths.length; i++) {
      const path = String(paths[i] || "").split(".");
      let current = source;
      let found = true;
      for (let j = 0; j < path.length; j++) {
        const key = path[j];
        if (!key || current == null || current[key] === void 0 || current[key] === null) {
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
    if (!source) return "(none)";
    const out = [];
    try {
      const keys = Object.keys(source);
      for (let i = 0; i < keys.length; i++) {
        out.push(String(keys[i]));
      }
    } catch (_) {
    }
    try {
      for (const key in source) {
        out.push(String(key));
      }
    } catch (_) {
    }
    const uniq = Array.from(new Set(out)).sort();
    if (uniq.length === 0) return "(none)";
    const limit = Math.max(5, parseInt(maxCount, 10) || 40);
    return uniq.slice(0, limit).join(",");
  }
  function parseIntSafe(value) {
    const parsed = parseInt(String(value == null ? "" : value), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function parseFloatSafe(value) {
    const parsed = parseFloat(String(value == null ? "" : value));
    return Number.isFinite(parsed) ? Number(parsed.toFixed(4)) : 0;
  }
  function toArray(source) {
    if (!source) return [];
    if (Array.isArray(source)) return source;
    const out = [];
    try {
      const count = parseIntSafe(valueFromAny(source, ["Count", "count", "Length", "length"], 0));
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          if (source[i] !== void 0) out.push(source[i]);
        }
        if (out.length > 0) return out;
      }
    } catch (_) {
    }
    try {
      for (const item of source) {
        out.push(item);
      }
    } catch (_) {
    }
    return out;
  }
  function normalizeTimestamp(value) {
    if (value == null) return "";
    const raw = String(value).trim();
    if (!raw) return "";
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
    const spaceParsed = new Date(raw.replace(" ", "T"));
    if (!Number.isNaN(spaceParsed.getTime())) return spaceParsed.toISOString();
    return raw;
  }
  function buildNetworkIdAliases(rawNetworkId) {
    const raw = String(rawNetworkId == null ? "" : rawNetworkId).trim();
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
  function serverFromTrigger(plugin2, trigger) {
    const runtime = plugin2.runtime || {};
    if (!trigger || !trigger.server_id) {
      return runtime.serverByKey ? runtime.serverByKey[runtime.lastActiveServerKey] : null;
    }
    if (runtime.serverByKey && runtime.serverByKey[trigger.server_id]) {
      return runtime.serverByKey[trigger.server_id];
    }
    return runtime.serverByKey ? runtime.serverByKey[runtime.lastActiveServerKey] : null;
  }
  function extractServerClientIds(server) {
    const connectedClients = valueFromAny(server, ["connectedClients", "ConnectedClients", "clients", "Clients"], null);
    const clients = toArray(connectedClients);
    const ids = [];
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const id = parseIntSafe(valueFromAny(client, ["ClientId", "clientId"], 0));
      if (id > 0) ids.push(id);
    }
    return Array.from(new Set(ids));
  }
  function logServerClientSample(plugin2, server, clients) {
    if (!plugin2) return;
    const sample = clients.length > 0 ? clients[0] : null;
    plugin2.logDebug(
      "{Name}: server snapshot server={Server} connected_clients={Count} server_keys={ServerKeys} sample_client_keys={ClientKeys} sample_client_id={ClientId} sample_network_id={NetworkId} sample_name={Name}",
      plugin2.name,
      String(server ? server.toString ? server.toString() : "" : ""),
      clients.length,
      keyList(server, 80),
      keyList(sample, 80),
      String(valueFromAny(sample, ["ClientId", "clientId"], "")),
      String(valueFromAny(sample, ["NetworkId", "networkId"], "")),
      String(valueFromAny(sample, ["Name", "name", "CleanedName", "cleanedName"], ""))
    );
  }
  function buildBasicDataByClientId(context, clientIds) {
    const out = {};
    if (!context || !context.Clients || typeof context.Clients.GetClientsBasicData !== "function") {
      return out;
    }
    const basicsRaw = context.Clients.GetClientsBasicData(clientIds);
    const basics = toArray(basicsRaw);
    for (let i = 0; i < basics.length; i++) {
      const row = basics[i];
      const clientId = parseIntSafe(valueFromAny(row, ["ClientId", "clientId"], 0));
      if (clientId > 0) out[clientId] = row;
    }
    return out;
  }
  function logContextDataSample(plugin2, basics, stats) {
    if (!plugin2) return;
    const basic = basics.length > 0 ? basics[0] : null;
    const stat = stats.length > 0 ? stats[0] : null;
    plugin2.logDebug(
      "{Name}: context sample basics_count={BasicsCount} stats_count={StatsCount} basic_keys={BasicKeys} stat_keys={StatKeys} basic_name={BasicName} basic_searchable={BasicSearchable} stat_updated={StatUpdated} stat_game={StatGame}",
      plugin2.name,
      basics.length,
      stats.length,
      keyList(basic, 100),
      keyList(stat, 100),
      String(valueFromAny(basic, ["Name", "name"], "")),
      String(valueFromAny(basic, ["SearchableName", "searchableName"], "")),
      String(valueFromAny(stat, ["UpdatedAt", "updatedAt"], "")),
      String(valueFromAny(stat, ["GameName", "gameName"], ""))
    );
  }
  function statRowsForServer(context, clientIds, server) {
    if (!context || !context.ClientStatistics || typeof context.ClientStatistics.GetClientsStatData !== "function") {
      throw new Error("ClientStatistics.GetClientsStatData is unavailable in script runtime.");
    }
    const serverDatabaseId = parseIntSafe(valueFromAny(server, ["legacyDatabaseId", "LegacyDatabaseId", "databaseId", "DatabaseId"], 0));
    if (serverDatabaseId <= 0) {
      throw new Error("Unable to resolve server legacyDatabaseId for stats query.");
    }
    return toArray(context.ClientStatistics.GetClientsStatData(clientIds, serverDatabaseId));
  }
  function buildRowFromStat(stat, basic, plugin2, server) {
    const clientId = parseIntSafe(valueFromAny(stat, ["ClientId", "clientId"], valueFromAny(basic, ["ClientId", "clientId"], 0)));
    const networkId = String(valueFromAny(stat, ["NetworkId", "networkId"], valueFromAny(basic, ["NetworkId", "networkId"], "")) || "").trim();
    if (!networkId) return null;
    const gameName = cleanName(String(valueFromAny(server, ["serverName", "hostname"], "") || ""));
    const sourceUpdatedAt = normalizeTimestamp(valueFromAny(
      stat,
      ["UpdatedAt", "updatedAt", "LastConnection", "lastConnection", "FirstConnection", "firstConnection"],
      valueFromAny(basic, ["LastConnection", "lastConnection"], "")
    ));
    const basicName = String(valueFromAnyPath(
      basic,
      ["Name", "name", "AliasName", "aliasName", "Alias.Name", "alias.name", "CurrentAlias.Name", "currentAlias.name"],
      ""
    ) || "");
    const liveNameByClientId = String((plugin2.runtime.liveNameByClientId || {})[String(clientId)] || "");
    let liveNameByNetworkId = "";
    const networkAliases = buildNetworkIdAliases(networkId);
    const networkMap = plugin2.runtime.liveNameByNetworkId || {};
    for (let i = 0; i < networkAliases.length; i++) {
      const alias = networkAliases[i];
      if (networkMap[alias]) {
        liveNameByNetworkId = String(networkMap[alias]);
        break;
      }
    }
    const chosenDisplayName = cleanName(liveNameByClientId || liveNameByNetworkId || basicName || "");
    const searchableNameRaw = String(valueFromAnyPath(
      basic,
      ["SearchableName", "searchableName", "Alias.SearchableName", "alias.searchableName", "CurrentAlias.SearchableName", "currentAlias.searchableName"],
      ""
    ) || "");
    const searchableName = cleanName(searchableNameRaw || chosenDisplayName).toLowerCase();
    const kills = parseIntSafe(valueFromAny(stat, ["Kills", "kills"], 0));
    const deaths = parseIntSafe(valueFromAny(stat, ["Deaths", "deaths"], 0));
    const timePlayed = parseIntSafe(valueFromAny(stat, ["TimePlayed", "timePlayed"], 0));
    return {
      client_id: clientId,
      network_id: networkId,
      game_name: gameName,
      display_name: chosenDisplayName,
      searchable_name: searchableName,
      total_kills: kills,
      total_deaths: deaths,
      total_time_played_seconds: timePlayed,
      average_spm: parseFloatSafe(valueFromAny(stat, ["SPM", "spm"], 0)),
      average_skill: parseFloatSafe(valueFromAny(stat, ["Skill", "skill"], 0)),
      average_zscore: parseFloatSafe(valueFromAny(stat, ["ZScore", "zScore"], 0)),
      average_elo_rating: parseFloatSafe(valueFromAny(stat, ["EloRating", "eloRating"], 0)),
      average_rolling_weighted_kdr: parseFloatSafe(valueFromAny(stat, ["RollingWeightedKDR", "rollingWeightedKdr", "rollingWeightedKDR"], 0)),
      total_connections: parseIntSafe(valueFromAny(basic, ["Connections", "connections"], 0)),
      total_connection_time_seconds: parseIntSafe(valueFromAny(basic, ["TotalConnectionTime", "totalConnectionTime"], 0)),
      last_connection_utc: normalizeTimestamp(valueFromAny(basic, ["LastConnection", "lastConnection"], "")),
      source_updated_at_utc: sourceUpdatedAt,
      stat_hash: computeStatHash(networkId, gameName, sourceUpdatedAt, kills, deaths, timePlayed)
    };
  }
  function readIngestionRowsFromDatabaseContext(plugin2, cursorFromUtc, trigger, done) {
    let context = null;
    try {
      if (!plugin2.dbContextFactory) {
        done(new Error("IDatabaseContextFactory service is unavailable in script runtime."), []);
        return;
      }
      const server = serverFromTrigger(plugin2, trigger);
      if (!server) {
        done(new Error("No active server context available for stats ingestion."), []);
        return;
      }
      const connectedClients = toArray(valueFromAny(server, ["connectedClients", "ConnectedClients", "clients", "Clients"], null));
      logServerClientSample(plugin2, server, connectedClients);
      const clientIds = extractServerClientIds(server);
      plugin2.logger.logInformation(
        "{Name}: Preparing stats pull for server={Server} with client_ids=[{ClientIds}]",
        plugin2.name,
        String(server.toString ? server.toString() : "unknown"),
        clientIds.join(",")
      );
      if (clientIds.length === 0) {
        plugin2.logger.logInformation("{Name}: No connected client ids available for stats pull on {Server}", plugin2.name, String(server.toString ? server.toString() : "unknown"));
        done(null, []);
        return;
      }
      context = plugin2.dbContextFactory.createContext(false);
      if (!context) {
        done(new Error("IDatabaseContextFactory returned null context."), []);
        return;
      }
      const basicByClientId = buildBasicDataByClientId(context, clientIds);
      const basicRows = Object.values(basicByClientId);
      const statRows = statRowsForServer(context, clientIds, server);
      logContextDataSample(plugin2, basicRows, statRows);
      plugin2.logger.logInformation(
        "{Name}: stats pull returned {StatsCount} stat rows and {BasicCount} basic rows for {ClientCount} client ids",
        plugin2.name,
        statRows.length,
        basicRows.length,
        clientIds.length
      );
      const rows = [];
      for (let i = 0; i < statRows.length; i++) {
        const stat = statRows[i];
        const clientId = parseIntSafe(valueFromAny(stat, ["ClientId", "clientId"], 0));
        const basic = basicByClientId[clientId] || null;
        const row = buildRowFromStat(stat, basic, plugin2, server);
        if (!row) continue;
        plugin2.logger.logInformation(
          "{Name}: Row candidate client_id={ClientId} network_id={NetworkId} display={Display} searchable={Searchable} kills={Kills} deaths={Deaths} updated_at={UpdatedAt} basic_name={BasicName} stat_game={StatGame}",
          plugin2.name,
          row.client_id,
          row.network_id,
          row.display_name || "(blank)",
          row.searchable_name || "(blank)",
          row.total_kills,
          row.total_deaths,
          row.source_updated_at_utc || "(blank)",
          String(valueFromAnyPath(basic, ["Name", "name", "AliasName", "aliasName", "Alias.Name", "alias.name", "CurrentAlias.Name", "currentAlias.name"], "") || "(blank)"),
          String(valueFromAny(stat, ["GameName", "gameName"], "") || "(blank)")
        );
        if (cursorFromUtc && row.source_updated_at_utc && String(row.source_updated_at_utc) <= String(cursorFromUtc)) {
          continue;
        }
        rows.push(row);
      }
      rows.sort((a, b) => {
        const left = String(a.source_updated_at_utc || "");
        const right = String(b.source_updated_at_utc || "");
        if (left < right) return -1;
        if (left > right) return 1;
        return parseIntSafe(a.client_id) - parseIntSafe(b.client_id);
      });
      done(null, rows);
    } catch (error) {
      done(new Error(error && error.message ? error.message : "unknown database context read error"), []);
    } finally {
      try {
        if (context && typeof context.Dispose === "function") context.Dispose();
      } catch (_) {
      }
    }
  }

  // src/api.js
  function responseToText(response) {
    if (response == null) return "";
    if (typeof response === "string") return response;
    try {
      if (typeof response.body === "string") return response.body;
      if (typeof response.content === "string") return response.content;
      if (typeof response.data === "string") return response.data;
    } catch (_) {
    }
    try {
      return JSON.stringify(response);
    } catch (_) {
      try {
        return String(response);
      } catch (_2) {
        return "";
      }
    }
  }
  function parseApiResponse(rawResponse, textResponse) {
    if (rawResponse && typeof rawResponse === "object") {
      if (rawResponse.success !== void 0 || rawResponse.errors !== void 0) {
        return rawResponse;
      }
      if (rawResponse.body && typeof rawResponse.body === "string") {
        return JSON.parse(rawResponse.body);
      }
    }
    return JSON.parse(textResponse);
  }
  function isApiFailure(parsed, textResponse) {
    if (!parsed || typeof parsed !== "object") return true;
    if (parsed.errors || parsed.error || parsed.success === false) return true;
    if (parsed.status && Number(parsed.status) >= 400) return true;
    if (parsed.statusCode && Number(parsed.statusCode) >= 400) return true;
    if (parsed.Message || parsed.ExceptionMessage || parsed.exception) return true;
    const body = String(textResponse || "").toLowerCase();
    if (body.indexOf("misused header name") !== -1 || body.indexOf("exception") !== -1) {
      return true;
    }
    return false;
  }
  function extractApiError(parsed) {
    if (!parsed || typeof parsed !== "object") return "";
    if (typeof parsed.Message === "string" && parsed.Message !== "") return parsed.Message;
    if (typeof parsed.ExceptionMessage === "string" && parsed.ExceptionMessage !== "") return parsed.ExceptionMessage;
    if (typeof parsed.error === "string" && parsed.error !== "") return parsed.error;
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      const first = parsed.errors[0];
      if (typeof first === "string") return first;
      if (first && typeof first.message === "string") return first.message;
    }
    return "";
  }
  function postPayload(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt, done) {
    try {
      const bodyJson = JSON.stringify(payload);
      const stringDict = System.Collections.Generic.Dictionary(System.String, System.String);
      const headers = new stringDict();
      if (config.apiKey) {
        headers.add("Authorization", "Bearer " + config.apiKey);
      }
      const pluginScript = importNamespace("IW4MAdmin.Application.Plugin.Script");
      const request = new pluginScript.ScriptPluginWebRequest(
        DEFAULT_API_URL,
        bodyJson,
        "POST",
        "application/json",
        headers
      );
      const currentAttempt = attempt;
      const maxRetries = config.maxRetries || 1;
      pluginHelper.requestUrl(request, (response) => {
        onApiResponse(response, config, logger, debugState, pluginName, pluginHelper, logDebug, payload, currentAttempt, maxRetries, done);
      });
      debugState.lastDispatchAt = (/* @__PURE__ */ new Date()).toISOString();
      debugState.lastStatus = "dispatched";
      debugState.totalPosts += 1;
      logDebug(
        "{Name}: POST dispatched to {Url} ({Bytes} bytes, attempt {Attempt})",
        pluginName,
        DEFAULT_API_URL,
        bodyJson.length,
        attempt
      );
    } catch (ex) {
      debugState.lastStatus = "exception";
      debugState.lastError = ex && ex.message ? ex.message : "unknown request exception";
      debugState.totalFailures += 1;
      logger.logError("{Name}: Failed to dispatch payload - {Error}", pluginName, debugState.lastError);
      done(false);
    }
  }
  function onApiResponse(response, config, logger, debugState, pluginName, pluginHelper, logDebug, payload, attempt, maxRetries, done) {
    const text = responseToText(response);
    if (!response) {
      debugState.lastStatus = "empty_response";
      debugState.lastError = "empty API response";
      debugState.totalFailures += 1;
      logger.logWarning("{Name}: Empty response from API (attempt {Attempt})", pluginName, attempt);
      handleRetry(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt, maxRetries, done);
      return;
    }
    try {
      const parsed = parseApiResponse(response, text);
      if (isApiFailure(parsed, text)) {
        debugState.lastStatus = "rejected";
        debugState.lastResponse = snippet(text);
        debugState.lastError = extractApiError(parsed) || "API rejected payload";
        debugState.totalFailures += 1;
        logger.logWarning(
          "{Name}: API rejected batch {Batch}/{Count} (attempt {Attempt}) - {Response}",
          pluginName,
          Number(payload.batch_index) + 1,
          payload.batch_count,
          attempt,
          snippet(text)
        );
        handleRetry(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt, maxRetries, done);
        return;
      }
      debugState.lastStatus = "accepted";
      debugState.lastResponse = snippet(text);
      debugState.lastError = "";
      logger.logInformation(
        "{Name}: API accepted batch {Batch}/{Count}",
        pluginName,
        Number(payload.batch_index) + 1,
        payload.batch_count
      );
      logDebug("{Name}: API success response snippet: {Response}", pluginName, snippet(text));
      done(true);
    } catch (e) {
      debugState.lastStatus = "non_json";
      debugState.lastResponse = snippet(text);
      debugState.lastError = "non-JSON API response: " + (e && e.message ? e.message : "parse error");
      debugState.totalFailures += 1;
      logger.logWarning(
        "{Name}: Non-JSON API response (attempt {Attempt}): {Response}",
        pluginName,
        attempt,
        snippet(text)
      );
      handleRetry(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt, maxRetries, done);
    }
  }
  function handleRetry(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt, maxRetries, done) {
    if (attempt < maxRetries + 1) {
      logger.logInformation(
        "{Name}: Retrying POST (attempt {Next} of {Max})",
        pluginName,
        attempt + 1,
        maxRetries + 1
      );
      postPayload(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt + 1, done);
      return;
    }
    logger.logError(
      "{Name}: All {Max} attempt(s) failed for batch {Batch}/{Count}",
      pluginName,
      maxRetries + 1,
      Number(payload.batch_index) + 1,
      payload.batch_count
    );
    done(false);
  }

  // src/sync.js
  function enqueueSync(plugin2, trigger) {
    if (plugin2.runtime.isSyncInFlight) {
      plugin2.runtime.queuedSync = true;
      plugin2.logDebug("{Name}: Sync already in flight, queueing another run", plugin2.name);
      return;
    }
    plugin2.runtime.isSyncInFlight = true;
    plugin2.runtime.queuedSync = false;
    try {
      runSync(plugin2, trigger, () => {
        plugin2.runtime.isSyncInFlight = false;
        if (plugin2.runtime.queuedSync) {
          plugin2.runtime.queuedSync = false;
          enqueueSync(plugin2, {
            event: "queued_follow_up",
            occurred_at_utc: (/* @__PURE__ */ new Date()).toISOString(),
            server_id: "unknown",
            server_name: "",
            map_name: "",
            game: "",
            game_type: ""
          });
        }
      });
    } catch (error) {
      plugin2.runtime.isSyncInFlight = false;
      plugin2.debugState.lastStatus = "sync_exception";
      plugin2.debugState.lastError = error && error.message ? error.message : "unknown sync exception";
      plugin2.debugState.totalFailures += 1;
      plugin2.logger.logError("{Name} v{Version}: Sync failed before dispatch - {Error}", plugin2.name, plugin2.version, plugin2.debugState.lastError);
    }
  }
  function runSync(plugin2, trigger, done) {
    const cursorFrom = plugin2.runtime.lastCursorUtc || null;
    readRows(plugin2, cursorFrom, trigger, (error, rows) => {
      if (error) {
        plugin2.debugState.lastStatus = "read_error";
        plugin2.debugState.lastError = error && error.message ? error.message : "unknown read error";
        plugin2.debugState.totalFailures += 1;
        plugin2.logger.logError(
          "{Name} v{Version}: Failed to read leaderboard data from {Source} - {Error}",
          plugin2.name,
          plugin2.version,
          "db_context",
          plugin2.debugState.lastError
        );
        done();
        return;
      }
      const rowCount = rows.length;
      plugin2.debugState.lastRowsRead = rowCount;
      plugin2.debugState.lastRowsSent = 0;
      plugin2.debugState.lastCursorFrom = cursorFrom || "";
      if (rowCount === 0) {
        plugin2.debugState.lastStatus = "no_changes";
        plugin2.debugState.lastError = "";
        plugin2.logger.logInformation("{Name} v{Version}: No leaderboard changes since cursor {Cursor}", plugin2.name, plugin2.version, cursorFrom || "(none)");
        done();
        return;
      }
      const cursorTo = maxSourceUpdatedAt(rows);
      plugin2.debugState.lastCursorTo = cursorTo || "";
      const batchId = generateUUID();
      plugin2.runtime.recentBatchId = batchId;
      const chunks = chunkRows(rows, plugin2.config.maxRowsPerRequest);
      if (rows.length > 0) {
        const first = rows[0];
        plugin2.logger.logInformation(
          "{Name}: First payload row preview client_id={ClientId} network_id={NetworkId} display={Display} searchable={Searchable} game={Game} updated_at={UpdatedAt}",
          plugin2.name,
          first.client_id,
          first.network_id,
          first.display_name || "(blank)",
          first.searchable_name || "(blank)",
          first.game_name || "(blank)",
          first.source_updated_at_utc || "(blank)"
        );
      }
      plugin2.logger.logInformation("{Name} v{Version}: Syncing {Rows} leaderboard rows in {Batches} batch(es)", plugin2.name, plugin2.version, rowCount, chunks.length);
      sendBatchSequence(plugin2, chunks, 0, {
        batchId,
        trigger,
        cursorFrom,
        cursorTo
      }, () => {
        plugin2.runtime.lastCursorUtc = cursorTo || plugin2.runtime.lastCursorUtc;
        if (plugin2.runtime.lastCursorUtc) {
          plugin2.configWrapper.setValue("leaderboardCursorUtc", plugin2.runtime.lastCursorUtc);
        }
        plugin2.debugState.lastStatus = "accepted";
        plugin2.debugState.lastError = "";
        plugin2.logger.logInformation("{Name} v{Version}: Leaderboard sync completed. Cursor now {Cursor}", plugin2.name, plugin2.version, plugin2.runtime.lastCursorUtc || "(none)");
        done();
      }, () => {
        done();
      });
    });
  }
  function readRows(plugin2, cursorFrom, trigger, done) {
    readIngestionRowsFromDatabaseContext(plugin2, cursorFrom, trigger, (dbError, rows) => {
      if (!dbError) {
        done(null, rows);
        return;
      }
      done(dbError, []);
    });
  }
  function sendBatchSequence(plugin2, chunks, index, meta, onComplete, onFailure) {
    if (index >= chunks.length) {
      onComplete();
      return;
    }
    const rows = chunks[index];
    const payload = {
      schema_version: 1,
      source: "iw4m_leaderboard_snapshot",
      batch_id: meta.batchId,
      batch_index: index,
      batch_count: chunks.length,
      cursor_from_utc: meta.cursorFrom,
      cursor_to_utc: meta.cursorTo,
      triggered_by: meta.trigger,
      captured_at_utc: (/* @__PURE__ */ new Date()).toISOString(),
      rows
    };
    const logDebugBound = plugin2.logDebug.bind(plugin2);
    postPayload(plugin2.config, plugin2.pluginHelper, plugin2.logger, plugin2.debugState, plugin2.name, logDebugBound, payload, 1, (ok) => {
      if (!ok) {
        onFailure();
        return;
      }
      plugin2.debugState.lastRowsSent += rows.length;
      sendBatchSequence(plugin2, chunks, index + 1, meta, onComplete, onFailure);
    });
  }

  // src/discord.js
  function splitCsv(value) {
    if (!value) return [];
    const raw = String(value).split(",");
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const item = String(raw[i] || "").trim();
      if (item) out.push(item);
    }
    return out;
  }
  function createHeaders(config, includeJsonContentType) {
    const stringDict = System.Collections.Generic.Dictionary(System.String, System.String);
    const headers = new stringDict();
    if (includeJsonContentType) {
      headers.add("Content-Type", "application/json");
    }
    if (config.discordBotToken) {
      const token = String(config.discordBotToken);
      const authValue = token.indexOf("Bot ") === 0 ? token : "Bot " + token;
      headers.add("Authorization", authValue);
    }
    return headers;
  }
  function requestJson(plugin2, url, method, bodyObj, headers, done) {
    try {
      const pluginScript = importNamespace("IW4MAdmin.Application.Plugin.Script");
      const body = bodyObj ? JSON.stringify(bodyObj) : "";
      const request = new pluginScript.ScriptPluginWebRequest(
        url,
        body,
        method,
        "application/json",
        headers
      );
      plugin2.pluginHelper.requestUrl(request, (response) => {
        const text = responseToText(response);
        if (String(text || "").trim() === "") {
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
      done(false, null, error && error.message ? error.message : "request setup failed");
    }
  }
  function getPlayerCountFromServer(server) {
    if (!server) return null;
    const candidateProps = ["clientCount", "numClients", "currentPlayers", "connectedClients"];
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
    const left = String(a || "");
    const right = String(b || "");
    if (left.length !== right.length) {
      return left.length > right.length ? 1 : -1;
    }
    if (left === right) return 0;
    return left > right ? 1 : -1;
  }
  function normalizeCommand(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    const tokens = text.split(/\s+/);
    if (tokens.length === 0) return "";
    const verb = tokens[0].toLowerCase();
    if ((verb === "map" || verb === "changemap") && tokens.length >= 2) {
      return "map " + tokens.slice(1).join(" ");
    }
    if (verb === "say" && tokens.length >= 2) {
      return "say " + tokens.slice(1).join(" ");
    }
    return text;
  }
  function runServerCommand(plugin2, server, commandText) {
    if (!server || !commandText) {
      return { ok: false, reason: "missing server or command" };
    }
    try {
      if (typeof server.executeCommand === "function") {
        server.executeCommand(commandText);
        return { ok: true };
      }
      if (typeof server.ExecuteCommand === "function") {
        server.ExecuteCommand(commandText);
        return { ok: true };
      }
      if (plugin2.manager && typeof plugin2.manager.executeCommand === "function") {
        plugin2.manager.executeCommand(server, commandText);
        return { ok: true };
      }
      if (plugin2.manager && typeof plugin2.manager.ExecuteCommand === "function") {
        plugin2.manager.ExecuteCommand(server, commandText);
        return { ok: true };
      }
    } catch (error) {
      return {
        ok: false,
        reason: error && error.message ? error.message : "exception while executing command"
      };
    }
    return { ok: false, reason: "no compatible command API found on server/manager" };
  }
  function sendDiscordWebhook(plugin2, messageText) {
    if (!plugin2.config.discordWebhookUrl) return;
    const headers = createHeaders(plugin2.config, true);
    requestJson(
      plugin2,
      plugin2.config.discordWebhookUrl,
      "POST",
      { content: messageText },
      headers,
      (ok, _parsed, text) => {
        if (!ok) {
          plugin2.logDebug("{Name}: Discord webhook send failed: {Error}", plugin2.name, snippet(text));
        }
      }
    );
  }
  function sendDiscordChannelMessage(plugin2, content) {
    if (!plugin2.config.discordBotToken || !plugin2.config.discordChannelId) return;
    const headers = createHeaders(plugin2.config, true);
    const url = "https://discord.com/api/v10/channels/" + plugin2.config.discordChannelId + "/messages";
    requestJson(plugin2, url, "POST", { content }, headers, (ok, _parsed, text) => {
      if (!ok) {
        plugin2.logDebug("{Name}: Discord bot reply failed: {Error}", plugin2.name, snippet(text));
      }
    });
  }
  function maybeSendPlayerThresholdAlert(plugin2, serverKey, serverName, playerCount) {
    const state = plugin2.runtime.discordAlertStateByServer[serverKey] || {
      overLowSent: false,
      overHighSent: false
    };
    const low = plugin2.config.discordThresholdLow;
    const high = plugin2.config.discordThresholdHigh;
    if (playerCount <= low) {
      state.overLowSent = false;
    }
    if (playerCount <= high) {
      state.overHighSent = false;
    }
    if (playerCount > low && !state.overLowSent) {
      sendDiscordWebhook(
        plugin2,
        ":rotating_light: `" + serverName + "` crossed `" + low + "` players (now `" + playerCount + "`)."
      );
      state.overLowSent = true;
    }
    if (playerCount > high && !state.overHighSent) {
      sendDiscordWebhook(
        plugin2,
        ":fire: `" + serverName + "` crossed `" + high + "` players (now `" + playerCount + "`)."
      );
      state.overHighSent = true;
    }
    plugin2.runtime.discordAlertStateByServer[serverKey] = state;
  }
  function getServerName(server, serverKey) {
    if (!server) return serverKey;
    return cleanName(server.serverName || server.hostname || serverKey);
  }
  function trackServerPopulation(plugin2, eventObj, isDisconnect) {
    const server = eventObj && eventObj.server ? eventObj.server : null;
    if (!server) return;
    const serverKey = getServerKey(server);
    plugin2.runtime.serverByKey[serverKey] = server;
    plugin2.runtime.lastActiveServerKey = serverKey;
    const client = eventObj && eventObj.client ? eventObj.client : eventObj && eventObj.origin ? eventObj.origin : null;
    const networkId = normalizeNetworkId(client && client.networkId ? client.networkId : null);
    if (!plugin2.runtime.activeNetworkIdsByServer[serverKey]) {
      plugin2.runtime.activeNetworkIdsByServer[serverKey] = {};
    }
    if (networkId && isDisconnect) {
      delete plugin2.runtime.activeNetworkIdsByServer[serverKey][networkId];
    } else if (networkId) {
      plugin2.runtime.activeNetworkIdsByServer[serverKey][networkId] = true;
    }
    let count = getPlayerCountFromServer(server);
    if (count == null) {
      const ids = plugin2.runtime.activeNetworkIdsByServer[serverKey];
      count = Object.keys(ids).length;
    }
    plugin2.runtime.playerCountByServer[serverKey] = count;
    maybeSendPlayerThresholdAlert(plugin2, serverKey, getServerName(server, serverKey), count);
  }
  function getTargetServer(plugin2, hintServer) {
    if (hintServer) return { server: hintServer, error: "" };
    const keys = Object.keys(plugin2.runtime.serverByKey || {});
    if (keys.length === 0) {
      return { server: null, error: "No servers have reported activity yet." };
    }
    if (keys.length === 1) {
      return { server: plugin2.runtime.serverByKey[keys[0]], error: "" };
    }
    return {
      server: null,
      error: "Multiple active servers detected. Use `!iw4 servers` then target one with `!iw4 @<server_key> <command>`."
    };
  }
  function listKnownServers(plugin2) {
    const keys = Object.keys(plugin2.runtime.serverByKey || {});
    if (keys.length === 0) {
      return "No active servers discovered yet.";
    }
    const lines = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const server = plugin2.runtime.serverByKey[key];
      const count = plugin2.runtime.playerCountByServer[key];
      const name = getServerName(server, key);
      const countText = Number.isFinite(count) ? String(count) : "?";
      lines.push("`" + key + "` (" + name + ", players: " + countText + ")");
    }
    return "Known servers:\n- " + lines.join("\n- ");
  }
  function resolveServerBySelector(plugin2, selector) {
    const needle = String(selector || "").trim().toLowerCase();
    if (!needle) return { server: null, error: "Missing server selector." };
    const keys = Object.keys(plugin2.runtime.serverByKey || {});
    if (keys.length === 0) {
      return { server: null, error: "No active servers discovered yet." };
    }
    const matches = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const server = plugin2.runtime.serverByKey[key];
      const serverName = getServerName(server, key).toLowerCase();
      const keyLower = key.toLowerCase();
      if (keyLower === needle || serverName === needle) {
        return { server, error: "" };
      }
      if (keyLower.indexOf(needle) !== -1 || serverName.indexOf(needle) !== -1) {
        matches.push({ key, server });
      }
    }
    if (matches.length === 1) {
      return { server: matches[0].server, error: "" };
    }
    if (matches.length > 1) {
      return {
        server: null,
        error: "Server selector matches multiple servers. Use a more specific key from `!iw4 servers`."
      };
    }
    return { server: null, error: "Server not found. Use `!iw4 servers` to list available targets." };
  }
  function parseTargetedCommand(cmdBody) {
    const text = String(cmdBody || "").trim();
    if (!text) {
      return { selector: "", commandText: "" };
    }
    const firstSpace = text.indexOf(" ");
    const firstToken = firstSpace === -1 ? text : text.substring(0, firstSpace);
    if (firstToken.charAt(0) !== "@") {
      return { selector: "", commandText: text };
    }
    const selector = firstToken.substring(1).trim();
    const remainder = firstSpace === -1 ? "" : text.substring(firstSpace + 1).trim();
    return { selector, commandText: remainder };
  }
  function extractCommand(content, prefix) {
    const text = String(content || "").trim();
    if (!text) return "";
    const normalizedPrefix = String(prefix || "!iw4").trim();
    if (!normalizedPrefix) return "";
    const lowerText = text.toLowerCase();
    const lowerPrefix = normalizedPrefix.toLowerCase();
    if (lowerText.indexOf(lowerPrefix) !== 0) return "";
    return text.substring(normalizedPrefix.length).trim();
  }
  function processDiscordCommand(plugin2, message, hintServer) {
    const authorId = message && message.author && message.author.id ? String(message.author.id) : "";
    const authorName = message && message.author && message.author.username ? String(message.author.username) : "unknown";
    const content = message && message.content ? String(message.content) : "";
    const allowedIds = splitCsv(plugin2.config.discordAllowedUserIds);
    if (allowedIds.indexOf(authorId) === -1) return;
    const cmdBody = extractCommand(content, plugin2.config.discordCommandPrefix);
    if (!cmdBody) return;
    const lowerBody = cmdBody.toLowerCase();
    if (lowerBody === "servers" || lowerBody === "list") {
      sendDiscordChannelMessage(plugin2, listKnownServers(plugin2));
      return;
    }
    if (lowerBody === "help") {
      sendDiscordChannelMessage(
        plugin2,
        "Usage:\n- `!iw4 servers` (list server keys)\n- `!iw4 map mp_terminal` (works when exactly one server is active)\n- `!iw4 @<server_key> map mp_terminal` (target specific server)\n- `!iw4 @<server_key> say hello`"
      );
      return;
    }
    const targeted = parseTargetedCommand(cmdBody);
    if (!targeted.commandText) {
      sendDiscordChannelMessage(plugin2, "No command provided. Try `!iw4 help`.");
      return;
    }
    const commandText = normalizeCommand(targeted.commandText);
    if (!commandText) return;
    let selected;
    if (targeted.selector) {
      selected = resolveServerBySelector(plugin2, targeted.selector);
    } else {
      selected = getTargetServer(plugin2, hintServer);
    }
    if (!selected.server) {
      sendDiscordChannelMessage(plugin2, (selected.error || "No target server available.") + " Command: `" + commandText + "`");
      return;
    }
    const server = selected.server;
    const result = runServerCommand(plugin2, server, commandText);
    const serverKey = getServerKey(server);
    if (result.ok) {
      plugin2.logger.logInformation(
        "{Name}: Discord command by {User} ({Id}) on {Server}: {Command}",
        plugin2.name,
        authorName,
        authorId,
        serverKey,
        commandText
      );
      sendDiscordChannelMessage(plugin2, "Executed on `" + serverKey + "`: `" + commandText + "`");
    } else {
      plugin2.logger.logWarning(
        "{Name}: Discord command failed by {User} ({Id}) on {Server}: {Reason}",
        plugin2.name,
        authorName,
        authorId,
        serverKey,
        result.reason
      );
      sendDiscordChannelMessage(plugin2, "Failed to execute `" + commandText + "` on `" + serverKey + "`: " + (result.reason || "unknown reason"));
    }
  }
  function pollDiscordCommands(plugin2, hintServer) {
    if (!plugin2.config.discordBotToken || !plugin2.config.discordChannelId) return;
    const allowedIds = splitCsv(plugin2.config.discordAllowedUserIds);
    if (allowedIds.length === 0) return;
    if (plugin2.runtime.discordPollInFlight) return;
    const nowMs = Date.now();
    const minGap = Math.max(5, parseInt(plugin2.config.discordPollIntervalSeconds, 10) || 15) * 1e3;
    if (nowMs - plugin2.runtime.lastDiscordPollAtMs < minGap) return;
    plugin2.runtime.lastDiscordPollAtMs = nowMs;
    plugin2.runtime.discordPollInFlight = true;
    const headers = createHeaders(plugin2.config, false);
    const url = "https://discord.com/api/v10/channels/" + plugin2.config.discordChannelId + "/messages?limit=25";
    requestJson(plugin2, url, "GET", null, headers, (ok, parsed, text) => {
      plugin2.runtime.discordPollInFlight = false;
      if (!ok || !Array.isArray(parsed)) {
        plugin2.logDebug("{Name}: Discord poll failed: {Error}", plugin2.name, snippet(text));
        return;
      }
      if (parsed.length === 0) return;
      let newestId = plugin2.runtime.lastDiscordMessageId || "";
      for (let i = 0; i < parsed.length; i++) {
        const msgId = parsed[i] && parsed[i].id ? String(parsed[i].id) : "";
        if (!msgId) continue;
        if (!newestId || compareSnowflakes(msgId, newestId) > 0) {
          newestId = msgId;
        }
      }
      if (!plugin2.runtime.lastDiscordMessageId) {
        plugin2.runtime.lastDiscordMessageId = newestId;
        plugin2.configWrapper.setValue("discordLastMessageId", newestId);
        plugin2.logDebug("{Name}: Discord command poll initialized at message {Id}", plugin2.name, newestId);
        return;
      }
      const fresh = [];
      for (let j = 0; j < parsed.length; j++) {
        const candidate = parsed[j];
        const candidateId = candidate && candidate.id ? String(candidate.id) : "";
        if (!candidateId) continue;
        if (compareSnowflakes(candidateId, plugin2.runtime.lastDiscordMessageId) > 0) {
          fresh.push(candidate);
        }
      }
      fresh.sort((a, b) => compareSnowflakes(a.id, b.id));
      for (let k = 0; k < fresh.length; k++) {
        processDiscordCommand(plugin2, fresh[k], hintServer);
      }
      if (newestId && (!plugin2.runtime.lastDiscordMessageId || compareSnowflakes(newestId, plugin2.runtime.lastDiscordMessageId) > 0)) {
        plugin2.runtime.lastDiscordMessageId = newestId;
        plugin2.configWrapper.setValue("discordLastMessageId", newestId);
      }
    });
  }

  // src/index.js
  var PLUGIN_VERSION = true ? "2.0.12" : "0.0.0-dev";
  function listKeys(value, maxCount) {
    if (!value) return "(none)";
    const keys = [];
    try {
      const own = Object.keys(value);
      for (let i = 0; i < own.length; i++) keys.push(String(own[i]));
    } catch (_) {
    }
    try {
      for (const k in value) keys.push(String(k));
    } catch (_) {
    }
    const uniq = Array.from(new Set(keys)).sort();
    if (uniq.length === 0) return "(none)";
    const limit = Math.max(10, parseInt(maxCount, 10) || 80);
    const suffix = uniq.length > limit ? ",...(truncated)" : "";
    return uniq.slice(0, limit).join(",") + suffix;
  }
  function buildNetworkIdAliases2(rawNetworkId) {
    const raw = String(rawNetworkId == null ? "" : rawNetworkId).trim();
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
  var plugin = {
    author: "b_five",
    version: PLUGIN_VERSION,
    name: "Match Stats API",
    logger: null,
    manager: null,
    dbContextFactory: null,
    configWrapper: null,
    pluginHelper: null,
    config: Object.assign({}, defaultConfig),
    debugEnabled: false,
    debugState: {
      lastDispatchAt: null,
      lastStatus: "none",
      lastError: "",
      lastResponse: "",
      totalPosts: 0,
      totalFailures: 0,
      lastRowsRead: 0,
      lastRowsSent: 0,
      lastCursorFrom: "",
      lastCursorTo: ""
    },
    runtime: {
      isSyncInFlight: false,
      queuedSync: false,
      lastTriggerAtMsByServer: {},
      lastIntervalSyncAtMs: 0,
      intervalTimerHandle: null,
      lastCursorUtc: null,
      recentBatchId: null,
      liveNameByNetworkId: {},
      liveNameByClientId: {},
      activeNetworkIdsByServer: {},
      playerCountByServer: {},
      discordAlertStateByServer: {},
      serverByKey: {},
      lastActiveServerKey: "",
      lastDiscordPollAtMs: 0,
      discordPollInFlight: false,
      lastDiscordMessageId: ""
    },
    onLoad: function(serviceResolver, configWrapper, pluginHelper) {
      this.configWrapper = configWrapper;
      this.pluginHelper = pluginHelper;
      this.manager = serviceResolver.resolveService("IManager");
      this.logger = serviceResolver.resolveService("ILogger", ["ScriptPluginV2"]);
      try {
        this.dbContextFactory = serviceResolver.resolveService("IDatabaseContextFactory");
      } catch (error) {
        this.logger.logError(
          "{Name}: Failed to resolve IDatabaseContextFactory - {Error}",
          this.name,
          error && error.message ? error.message : "unknown service resolver error"
        );
        throw error;
      }
      this.configWrapper.setName(this.name);
      const stored = this.configWrapper.getValue("config", (newCfg) => {
        if (newCfg) {
          plugin.config = sanitizeConfig(newCfg);
          plugin.logger.logInformation(
            "{Name} config reloaded. API={Url}",
            plugin.name,
            DEFAULT_API_URL
          );
          plugin.configureIntervalSync();
        }
      });
      if (stored != null) {
        this.config = sanitizeConfig(stored);
        if (this.shouldPersistSanitizedConfig(stored, this.config)) {
          this.configWrapper.setValue("config", this.config);
          this.logger.logInformation("{Name}: Config migrated with new defaults/keys", this.name);
        }
      } else {
        this.configWrapper.setValue("config", this.config);
      }
      const savedCursor = this.configWrapper.getValue("leaderboardCursorUtc", null);
      if (savedCursor != null) {
        this.runtime.lastCursorUtc = String(savedCursor);
      }
      const savedDiscordMessageId = this.configWrapper.getValue("discordLastMessageId", null);
      if (savedDiscordMessageId != null) {
        this.runtime.lastDiscordMessageId = String(savedDiscordMessageId);
      }
      this.logger.logInformation(
        "{Name} {Version} by {Author} loaded. API={Url} source=db_context Cursor={Cursor}",
        this.name,
        this.version,
        this.author,
        DEFAULT_API_URL,
        this.runtime.lastCursorUtc || "(none)"
      );
      if (!this.config.apiKey) {
        this.logger.logWarning("{Name}: apiKey is empty. The API will likely reject requests with 401.", this.name);
      }
      this.configureIntervalSync();
    },
    onClientEnterMatch: function(enterEvent, _token) {
      const client = extractClientFromEvent(enterEvent);
      if (!client) return;
      const clientId = String(client.clientId == null ? "" : client.clientId).trim();
      const networkId = normalizeNetworkId(client.networkId);
      const liveName = cleanName(client.cleanedName || client.name || "");
      if (liveName) {
        if (networkId) {
          const aliases = buildNetworkIdAliases2(networkId);
          for (let i = 0; i < aliases.length; i++) {
            this.runtime.liveNameByNetworkId[aliases[i]] = liveName;
          }
        }
        if (clientId) {
          this.runtime.liveNameByClientId[clientId] = liveName;
        }
        this.logger.logInformation(
          "{Name}: Cached live player identity client_id={ClientId} network_id={NetworkId} name={Player}",
          this.name,
          clientId || "(none)",
          networkId || "(none)",
          liveName
        );
      } else {
        this.logger.logInformation(
          "{Name}: ClientEnterMatch observed but no live name available client_id={ClientId} network_id={NetworkId}",
          this.name,
          clientId || "(none)",
          networkId || "(none)"
        );
      }
      trackServerPopulation(this, enterEvent);
      pollDiscordCommands(this, enterEvent && enterEvent.server ? enterEvent.server : null);
      this.maybeRunIntervalSync(enterEvent && enterEvent.server ? enterEvent.server : null);
    },
    onMatchEnded: function(matchEndEvent, _token) {
      const server = matchEndEvent ? matchEndEvent.server : null;
      const serverKey = getServerKey(server);
      const nowMs = Date.now();
      const minGapMs = Math.max(5, parseInt(this.config.minSecondsBetweenSyncs, 10) || 20) * 1e3;
      const prevMs = this.runtime.lastTriggerAtMsByServer[serverKey] || 0;
      if (nowMs - prevMs < minGapMs) {
        this.logDebug("{Name}: Ignoring duplicate trigger on {Server} (cooldown)", this.name, serverKey);
        return;
      }
      this.runtime.lastTriggerAtMsByServer[serverKey] = nowMs;
      const trigger = {
        event: "match_end",
        occurred_at_utc: (/* @__PURE__ */ new Date()).toISOString(),
        server_id: server ? server.toString() : "unknown",
        server_name: server && (server.serverName || server.hostname) ? server.serverName || server.hostname : "",
        map_name: server && server.currentMap ? server.currentMap.name || "" : "",
        game: server && server.gameName ? server.gameName.toString() : "",
        game_type: server && server.gameType ? server.gameType.toString() : ""
      };
      this.logger.logInformation("{Name} v{Version}: MatchEnded trigger received on {Server}; starting leaderboard sync", this.name, this.version, serverKey);
      trackServerPopulation(this, matchEndEvent);
      pollDiscordCommands(this, server);
      this.queueMatchEndSync(trigger);
    },
    onClientEnteredCommand: function(commandEvent, _token) {
      if (!commandEvent || !commandEvent.origin) return;
      const parsed = parseCommand(commandEvent);
      if (!parsed || !parsed.command) return;
      const command = parsed.command.toLowerCase();
      if (command === "ms" || command === "matchstats") {
        this.tellStatus(commandEvent);
        return;
      }
      if (command === "msd" || command === "msdebug") {
        this.toggleDebugFromCommand(commandEvent, parsed.args);
      }
      if (command === "msp" || command === "msprobe") {
        this.probeRuntime(commandEvent);
        return;
      }
      this.maybeRunIntervalSync(commandEvent && commandEvent.server ? commandEvent.server : null);
    },
    probeRuntime: function(commandEvent) {
      const server = commandEvent && commandEvent.server ? commandEvent.server : null;
      const origin = commandEvent && commandEvent.origin ? commandEvent.origin : null;
      this.logger.logInformation("{Name}: PROBE command_event_keys={Keys}", this.name, listKeys(commandEvent, 120));
      this.logger.logInformation("{Name}: PROBE origin_keys={Keys}", this.name, listKeys(origin, 120));
      this.logger.logInformation("{Name}: PROBE server_keys={Keys}", this.name, listKeys(server, 140));
      try {
        const connected = server ? server.connectedClients || server.ConnectedClients || server.clients || server.Clients : null;
        this.logger.logInformation("{Name}: PROBE connected_clients_keys={Keys}", this.name, listKeys(connected, 120));
        const first = connected && connected[0] ? connected[0] : null;
        this.logger.logInformation("{Name}: PROBE first_connected_client_keys={Keys}", this.name, listKeys(first, 140));
      } catch (_) {
        this.logger.logWarning("{Name}: PROBE failed while inspecting server connected clients", this.name);
      }
      try {
        const ctx = this.dbContextFactory ? this.dbContextFactory.createContext(false) : null;
        this.logger.logInformation("{Name}: PROBE db_context_keys={Keys}", this.name, listKeys(ctx, 160));
        this.logger.logInformation("{Name}: PROBE db_context.clients_keys={Keys}", this.name, listKeys(ctx ? ctx.Clients || ctx.clients : null, 160));
        this.logger.logInformation("{Name}: PROBE db_context.client_statistics_keys={Keys}", this.name, listKeys(ctx ? ctx.ClientStatistics || ctx.clientStatistics : null, 160));
        try {
          if (ctx && typeof ctx.Dispose === "function") ctx.Dispose();
        } catch (_) {
        }
      } catch (error) {
        this.logger.logWarning(
          "{Name}: PROBE context inspection failed: {Error}",
          this.name,
          error && error.message ? error.message : "unknown error"
        );
      }
      commandEvent.origin.tell("Match Stats API probe logged to IW4M logs.");
    },
    tellStatus: function(commandEvent) {
      commandEvent.origin.tell(
        "Match Stats API v" + this.version + ": ENABLED | Mode: DB context ingestion | Source=db_context | Last=" + this.debugState.lastStatus + " | Rows(read/sent)=" + this.debugState.lastRowsRead + "/" + this.debugState.lastRowsSent + " | Cursor=" + (this.runtime.lastCursorUtc || "(none)")
      );
    },
    shouldPersistSanitizedConfig: function(stored, sanitized) {
      const source = stored || {};
      const sourceApiKey = source.apiKey == null ? "" : String(source.apiKey).trim();
      const sourceRetries = parseInt(source.maxRetries, 10);
      const sourceBatchSize = parseInt(source.maxRowsPerRequest, 10);
      const sourceCooldown = parseInt(source.minSecondsBetweenSyncs, 10);
      const sourcePostMatchDelay = parseInt(source.postMatchSyncDelaySeconds, 10);
      const sourceSnapshotInterval = parseInt(source.snapshotIntervalSeconds, 10);
      if (sourceApiKey !== sanitized.apiKey) return true;
      if (!(Number.isFinite(sourceRetries) && sourceRetries >= 0 && sourceRetries === sanitized.maxRetries)) return true;
      if (!(Number.isFinite(sourceBatchSize) && sourceBatchSize > 0 && sourceBatchSize === sanitized.maxRowsPerRequest)) return true;
      if (!(Number.isFinite(sourceCooldown) && sourceCooldown > 0 && sourceCooldown === sanitized.minSecondsBetweenSyncs)) return true;
      if (!(Number.isFinite(sourcePostMatchDelay) && sourcePostMatchDelay >= 0 && sourcePostMatchDelay === sanitized.postMatchSyncDelaySeconds)) return true;
      if (!(Number.isFinite(sourceSnapshotInterval) && sourceSnapshotInterval >= 5 && sourceSnapshotInterval === sanitized.snapshotIntervalSeconds)) return true;
      return false;
    },
    queueMatchEndSync: function(trigger) {
      const delaySeconds = Math.max(0, parseInt(this.config.postMatchSyncDelaySeconds, 10) || 0);
      if (!this.pluginHelper || typeof this.pluginHelper.requestNotifyAfterDelay !== "function" || delaySeconds === 0) {
        enqueueSync(this, trigger);
        return;
      }
      const delayMs = delaySeconds * 1e3;
      this.logger.logInformation("{Name}: Scheduling match-end sync after {Seconds}s", this.name, delaySeconds);
      this.pluginHelper.requestNotifyAfterDelay(delayMs, () => {
        enqueueSync(this, trigger);
      });
    },
    configureIntervalSync: function() {
      const seconds = Math.max(5, parseInt(this.config.snapshotIntervalSeconds, 10) || 300);
      if (this.runtime.intervalTimerHandle && typeof clearInterval === "function") {
        clearInterval(this.runtime.intervalTimerHandle);
        this.runtime.intervalTimerHandle = null;
      }
      if (typeof setInterval !== "function") {
        this.logger.logWarning("{Name}: setInterval is unavailable in script runtime; interval sync will run on activity events.", this.name);
        return;
      }
      this.runtime.intervalTimerHandle = setInterval(() => {
        this.maybeRunIntervalSync(null);
      }, seconds * 1e3);
      this.logger.logInformation("{Name}: Interval snapshot sync enabled every {Seconds}s", this.name, seconds);
    },
    buildTrigger: function(eventName, server) {
      return {
        event: eventName,
        occurred_at_utc: (/* @__PURE__ */ new Date()).toISOString(),
        server_id: server ? server.toString() : "unknown",
        server_name: server && (server.serverName || server.hostname) ? server.serverName || server.hostname : "",
        map_name: server && server.currentMap ? server.currentMap.name || "" : "",
        game: server && server.gameName ? server.gameName.toString() : "",
        game_type: server && server.gameType ? server.gameType.toString() : ""
      };
    },
    maybeRunIntervalSync: function(hintServer) {
      const seconds = Math.max(5, parseInt(this.config.snapshotIntervalSeconds, 10) || 300);
      const nowMs = Date.now();
      const elapsedMs = nowMs - (this.runtime.lastIntervalSyncAtMs || 0);
      if (elapsedMs < seconds * 1e3) {
        return;
      }
      const server = hintServer || this.runtime.serverByKey[this.runtime.lastActiveServerKey] || null;
      this.runtime.lastIntervalSyncAtMs = nowMs;
      this.logger.logInformation("{Name}: Interval trigger fired; starting leaderboard sync", this.name);
      enqueueSync(this, this.buildTrigger("interval", server));
    },
    toggleDebugFromCommand: function(commandEvent, args) {
      const arg = String(args || "").trim().toLowerCase();
      if (arg === "on") this.debugEnabled = true;
      else if (arg === "off") this.debugEnabled = false;
      else this.debugEnabled = !this.debugEnabled;
      commandEvent.origin.tell(
        "MS Debug " + (this.debugEnabled ? "ON" : "OFF") + " | last=" + this.debugState.lastStatus + " | posts=" + this.debugState.totalPosts + " | failures=" + this.debugState.totalFailures
      );
      if (this.debugState.lastError) {
        commandEvent.origin.tell("MS Debug error: " + this.debugState.lastError);
      }
    },
    logDebug: function() {
      if (!this.debugEnabled || !this.logger) return;
      this.logger.logInformation.apply(this.logger, arguments);
    }
  };
  var init = (registerNotify, serviceResolver, configWrapper, pluginHelper) => {
    registerNotify(
      "IGameEventSubscriptions.MatchEnded",
      (matchEndEvent, token) => plugin.onMatchEnded(matchEndEvent, token)
    );
    registerNotify(
      "IGameEventSubscriptions.ClientEnterMatch",
      (enterEvent, token) => plugin.onClientEnterMatch(enterEvent, token)
    );
    try {
      registerNotify(
        "IGameEventSubscriptions.ClientDisconnected",
        (disconnectEvent, _token) => {
          trackServerPopulation(plugin, disconnectEvent, true);
          pollDiscordCommands(plugin, disconnectEvent && disconnectEvent.server ? disconnectEvent.server : null);
          plugin.maybeRunIntervalSync(disconnectEvent && disconnectEvent.server ? disconnectEvent.server : null);
        }
      );
    } catch (_err) {
      if (plugin.logger) {
        plugin.logger.logWarning("{Name}: ClientDisconnected subscription unavailable; threshold reset relies on observed player counts.", plugin.name);
      }
    }
    registerNotify(
      "IGameEventSubscriptions.ClientEnteredCommand",
      (commandEvent, token) => plugin.onClientEnteredCommand(commandEvent, token)
    );
    plugin.onLoad(serviceResolver, configWrapper, pluginHelper);
    return plugin;
  };
  var commands = [
    {
      name: "matchstats",
      description: "shows current leaderboard snapshot sync status",
      alias: "ms",
      permission: "User",
      targetRequired: false,
      arguments: [],
      execute: (gameEvent) => {
        plugin.tellStatus(gameEvent);
      }
    },
    {
      name: "msdebug",
      description: "toggles debug logging and shows last API status",
      alias: "msd",
      permission: "User",
      targetRequired: false,
      arguments: [],
      execute: (gameEvent) => {
        const arg = (gameEvent.data || "").trim().toLowerCase();
        plugin.toggleDebugFromCommand(gameEvent, arg);
      }
    },
    {
      name: "msprobe",
      description: "logs available runtime keys for debugging",
      alias: "msp",
      permission: "User",
      targetRequired: false,
      arguments: [],
      execute: (gameEvent) => {
        plugin.probeRuntime(gameEvent);
      }
    }
  ];
  return __toCommonJS(index_exports);
})();
var init=_b.init;var plugin=_b.plugin;var commands=_b.commands;

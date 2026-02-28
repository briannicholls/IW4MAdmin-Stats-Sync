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
  var DEFAULT_API_URL = "https://api.360-arena.com/iw4m/leaderboard_snapshots";
  var defaultConfig = {
    apiKey: "",
    apiUrl: DEFAULT_API_URL,
    maxRetries: 1,
    maxRowsPerRequest: 500,
    minSecondsBetweenSyncs: 20,
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
    const parsedThresholdLow = parseInt(source.discordThresholdLow, 10);
    const parsedThresholdHigh = parseInt(source.discordThresholdHigh, 10);
    const parsedDiscordPollInterval = parseInt(source.discordPollIntervalSeconds, 10);
    const apiKey = source.apiKey == null ? "" : String(source.apiKey).trim();
    const apiUrl = source.apiUrl == null || String(source.apiUrl).trim() === "" ? DEFAULT_API_URL : String(source.apiUrl).trim();
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
      apiUrl,
      maxRetries: Number.isFinite(parsedRetries) && parsedRetries >= 0 ? parsedRetries : 1,
      maxRowsPerRequest: Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 500,
      minSecondsBetweenSyncs: Number.isFinite(parsedCooldown) && parsedCooldown > 0 ? parsedCooldown : 20,
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
  function escapeSqlLiteral(value) {
    return String(value == null ? "" : value).replace(/'/g, "''");
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
  function dbValueToString(value, dbNull) {
    if (value == null || value === dbNull) return "";
    return String(value);
  }
  function dbValueToInt(value, dbNull) {
    if (value == null || value === dbNull) return 0;
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function dbValueToFloat(value, dbNull) {
    if (value == null || value === dbNull) return 0;
    const parsed = parseFloat(String(value));
    return Number.isFinite(parsed) ? Number(parsed.toFixed(4)) : 0;
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
  function buildIngestionQuery(cursorFromUtc) {
    let whereClause = "WHERE c.Active = 1 AND c.NetworkId IS NOT NULL AND c.NetworkId != 0";
    if (cursorFromUtc) {
      whereClause += " AND COALESCE(s.UpdatedAt, c.LastConnection, c.FirstConnection) > '" + escapeSqlLiteral(cursorFromUtc) + "'";
    }
    return [
      "SELECT",
      "  c.ClientId AS ClientId,",
      "  c.NetworkId AS NetworkId,",
      "  c.GameName AS GameName,",
      '  COALESCE(a.Name, "") AS AliasName,',
      '  COALESCE(a.SearchableName, "") AS SearchableName,',
      "  SUM(s.Kills) AS Kills,",
      "  SUM(s.Deaths) AS Deaths,",
      "  SUM(s.TimePlayed) AS TimePlayed,",
      "  AVG(s.SPM) AS SPM,",
      "  AVG(s.Skill) AS Skill,",
      "  AVG(s.ZScore) AS ZScore,",
      "  AVG(s.EloRating) AS EloRating,",
      "  AVG(s.RollingWeightedKDR) AS RollingWeightedKDR,",
      "  MAX(c.Connections) AS Connections,",
      "  MAX(c.TotalConnectionTime) AS TotalConnectionTime,",
      "  MAX(c.LastConnection) AS LastConnection,",
      "  MAX(COALESCE(s.UpdatedAt, c.LastConnection, c.FirstConnection)) AS SourceUpdatedAt",
      "FROM EFClientStatistics s",
      "INNER JOIN EFClients c ON c.ClientId = s.ClientId",
      "LEFT JOIN EFAlias a ON a.AliasId = c.CurrentAliasId",
      whereClause,
      "GROUP BY c.ClientId, c.NetworkId, c.GameName, a.Name, a.SearchableName",
      "ORDER BY SourceUpdatedAt ASC, c.ClientId ASC"
    ].join(" ");
  }
  function readIngestionRowsFromDatabaseContext(plugin2, cursorFromUtc, done) {
    let context = null;
    let connection = null;
    let reader = null;
    try {
      if (!plugin2.dbContextFactory) {
        done(new Error("IDatabaseContextFactory service is unavailable in script runtime."), []);
        return;
      }
      context = plugin2.dbContextFactory.CreateContext(false);
      if (!context || !context.Database || typeof context.Database.GetDbConnection !== "function") {
        done(new Error("Unable to create database context connection from IDatabaseContextFactory."), []);
        return;
      }
      connection = context.Database.GetDbConnection();
      if (!connection) {
        done(new Error("IDatabaseContextFactory returned a null DbConnection."), []);
        return;
      }
      connection.Open();
      const command = connection.CreateCommand();
      command.CommandText = buildIngestionQuery(cursorFromUtc);
      reader = command.ExecuteReader();
      const dbNull = System.DBNull.Value;
      const rows = [];
      while (reader.Read()) {
        const networkId = normalizeNetworkId(dbValueToString(reader["NetworkId"], dbNull));
        if (!networkId) continue;
        const gameName = dbValueToString(reader["GameName"], dbNull);
        const kills = dbValueToInt(reader["Kills"], dbNull);
        const deaths = dbValueToInt(reader["Deaths"], dbNull);
        const timePlayed = dbValueToInt(reader["TimePlayed"], dbNull);
        const sourceUpdatedAt = dbValueToString(reader["SourceUpdatedAt"], dbNull);
        const liveName = (plugin2.runtime.liveNameByNetworkId || {})[networkId] || "";
        const aliasName = dbValueToString(reader["AliasName"], dbNull);
        rows.push({
          client_id: dbValueToInt(reader["ClientId"], dbNull),
          network_id: networkId,
          game_name: gameName,
          display_name: cleanName(liveName || aliasName || "client_" + networkId),
          searchable_name: dbValueToString(reader["SearchableName"], dbNull),
          total_kills: kills,
          total_deaths: deaths,
          total_time_played_seconds: timePlayed,
          average_spm: dbValueToFloat(reader["SPM"], dbNull),
          average_skill: dbValueToFloat(reader["Skill"], dbNull),
          average_zscore: dbValueToFloat(reader["ZScore"], dbNull),
          average_elo_rating: dbValueToFloat(reader["EloRating"], dbNull),
          average_rolling_weighted_kdr: dbValueToFloat(reader["RollingWeightedKDR"], dbNull),
          total_connections: dbValueToInt(reader["Connections"], dbNull),
          total_connection_time_seconds: dbValueToInt(reader["TotalConnectionTime"], dbNull),
          last_connection_utc: dbValueToString(reader["LastConnection"], dbNull),
          source_updated_at_utc: sourceUpdatedAt,
          stat_hash: computeStatHash(networkId, gameName, sourceUpdatedAt, kills, deaths, timePlayed)
        });
      }
      done(null, rows);
    } catch (error) {
      done(new Error(error && error.message ? error.message : "unknown database context read error"), []);
    } finally {
      try {
        if (reader) reader.Close();
      } catch (_) {
      }
      try {
        if (connection) connection.Close();
      } catch (_) {
      }
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
        config.apiUrl,
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
        config.apiUrl,
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
      plugin2.logger.logError("{Name}: Sync failed before dispatch - {Error}", plugin2.name, plugin2.debugState.lastError);
    }
  }
  function runSync(plugin2, trigger, done) {
    const cursorFrom = plugin2.runtime.lastCursorUtc || null;
    readRows(plugin2, cursorFrom, (error, rows) => {
      if (error) {
        plugin2.debugState.lastStatus = "read_error";
        plugin2.debugState.lastError = error && error.message ? error.message : "unknown read error";
        plugin2.debugState.totalFailures += 1;
        plugin2.logger.logError(
          "{Name}: Failed to read leaderboard data from {Source} - {Error}",
          plugin2.name,
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
        plugin2.logger.logInformation("{Name}: No leaderboard changes since cursor {Cursor}", plugin2.name, cursorFrom || "(none)");
        done();
        return;
      }
      const cursorTo = maxSourceUpdatedAt(rows);
      plugin2.debugState.lastCursorTo = cursorTo || "";
      const batchId = generateUUID();
      plugin2.runtime.recentBatchId = batchId;
      const chunks = chunkRows(rows, plugin2.config.maxRowsPerRequest);
      plugin2.logger.logInformation("{Name}: Syncing {Rows} leaderboard rows in {Batches} batch(es)", plugin2.name, rowCount, chunks.length);
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
        plugin2.logger.logInformation("{Name}: Leaderboard sync completed. Cursor now {Cursor}", plugin2.name, plugin2.runtime.lastCursorUtc || "(none)");
        done();
      }, () => {
        done();
      });
    });
  }
  function readRows(plugin2, cursorFrom, done) {
    readIngestionRowsFromDatabaseContext(plugin2, cursorFrom, (dbError, rows) => {
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
  var plugin = {
    author: "b_five",
    version: "2.0",
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
      lastCursorUtc: null,
      recentBatchId: null,
      liveNameByNetworkId: {},
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
            plugin.config.apiUrl
          );
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
        this.config.apiUrl,
        this.runtime.lastCursorUtc || "(none)"
      );
      if (!this.config.apiKey) {
        this.logger.logWarning("{Name}: apiKey is empty. The API will likely reject requests with 401.", this.name);
      }
    },
    onClientEnterMatch: function(enterEvent, _token) {
      const client = extractClientFromEvent(enterEvent);
      if (!client) return;
      const networkId = normalizeNetworkId(client.networkId);
      if (!networkId) return;
      const liveName = cleanName(client.cleanedName || client.name || "");
      if (!liveName) return;
      this.runtime.liveNameByNetworkId[networkId] = liveName;
      this.logDebug("{Name}: Live name cached net={Net} name={Player}", this.name, networkId, liveName);
      trackServerPopulation(this, enterEvent);
      pollDiscordCommands(this, enterEvent && enterEvent.server ? enterEvent.server : null);
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
      this.logger.logInformation("{Name}: MatchEnded trigger received on {Server}; starting leaderboard sync", this.name, serverKey);
      trackServerPopulation(this, matchEndEvent);
      pollDiscordCommands(this, server);
      enqueueSync(this, trigger);
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
    },
    tellStatus: function(commandEvent) {
      commandEvent.origin.tell(
        "Match Stats API: ENABLED | Mode: DB context ingestion | Source=db_context | Last=" + this.debugState.lastStatus + " | Rows(read/sent)=" + this.debugState.lastRowsRead + "/" + this.debugState.lastRowsSent + " | Cursor=" + (this.runtime.lastCursorUtc || "(none)")
      );
    },
    shouldPersistSanitizedConfig: function(stored, sanitized) {
      const source = stored || {};
      const sourceApiKey = source.apiKey == null ? "" : String(source.apiKey).trim();
      const sourceApiUrl = source.apiUrl == null ? "" : String(source.apiUrl).trim();
      const sourceRetries = parseInt(source.maxRetries, 10);
      const sourceBatchSize = parseInt(source.maxRowsPerRequest, 10);
      const sourceCooldown = parseInt(source.minSecondsBetweenSyncs, 10);
      if (sourceApiKey !== sanitized.apiKey) return true;
      if (sourceApiUrl !== sanitized.apiUrl) return true;
      if (!(Number.isFinite(sourceRetries) && sourceRetries >= 0 && sourceRetries === sanitized.maxRetries)) return true;
      if (!(Number.isFinite(sourceBatchSize) && sourceBatchSize > 0 && sourceBatchSize === sanitized.maxRowsPerRequest)) return true;
      if (!(Number.isFinite(sourceCooldown) && sourceCooldown > 0 && sourceCooldown === sanitized.minSecondsBetweenSyncs)) return true;
      return false;
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
    }
  ];
  return __toCommonJS(index_exports);
})();
var init=_b.init;var plugin=_b.plugin;var commands=_b.commands;

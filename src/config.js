export const DEFAULT_API_URL = 'https://api.360-arena.com/iw4m/leaderboard_snapshots';
export const DEFAULT_DB_PATH = 'C:\\IW4Madmin\\Database\\Database.db';
export const DEFAULT_WEBFRONT_BASE_URL = 'http://127.0.0.1:1624';

export const defaultConfig = {
    apiKey: '',
    apiUrl: DEFAULT_API_URL,
    statsSource: 'webfront',
    webfrontBaseUrl: DEFAULT_WEBFRONT_BASE_URL,
    webfrontClientId: '',
    webfrontPassword: '',
    webfrontPageSize: 200,
    webfrontMaxPages: 250,
    dbPath: DEFAULT_DB_PATH,
    maxRetries: 1,
    maxRowsPerRequest: 500,
    minSecondsBetweenSyncs: 20,
    discordWebhookUrl: '',
    discordThresholdLow: 6,
    discordThresholdHigh: 10,
    discordBotToken: '',
    discordChannelId: '',
    discordAllowedUserIds: '',
    discordCommandPrefix: '!iw4',
    discordPollIntervalSeconds: 15
};

export function sanitizeConfig(cfg) {
    const source = cfg || {};
    const parsedRetries = parseInt(source.maxRetries, 10);
    const parsedBatchSize = parseInt(source.maxRowsPerRequest, 10);
    const parsedCooldown = parseInt(source.minSecondsBetweenSyncs, 10);
    const parsedWebfrontPageSize = parseInt(source.webfrontPageSize, 10);
    const parsedWebfrontMaxPages = parseInt(source.webfrontMaxPages, 10);
    const parsedThresholdLow = parseInt(source.discordThresholdLow, 10);
    const parsedThresholdHigh = parseInt(source.discordThresholdHigh, 10);
    const parsedDiscordPollInterval = parseInt(source.discordPollIntervalSeconds, 10);

    const apiKey = source.apiKey == null ? '' : String(source.apiKey).trim();
    const apiUrl = source.apiUrl == null || String(source.apiUrl).trim() === ''
        ? DEFAULT_API_URL
        : String(source.apiUrl).trim();
    const statsSourceRaw = source.statsSource == null ? 'webfront' : String(source.statsSource).trim().toLowerCase();
    const statsSource = statsSourceRaw === 'db' ? 'db' : 'webfront';
    const webfrontBaseUrl = source.webfrontBaseUrl == null || String(source.webfrontBaseUrl).trim() === ''
        ? DEFAULT_WEBFRONT_BASE_URL
        : String(source.webfrontBaseUrl).trim().replace(/\/+$/, '');
    const webfrontClientId = source.webfrontClientId == null ? '' : String(source.webfrontClientId).trim();
    const webfrontPassword = source.webfrontPassword == null ? '' : String(source.webfrontPassword).trim();
    const dbPath = source.dbPath == null || String(source.dbPath).trim() === ''
        ? DEFAULT_DB_PATH
        : String(source.dbPath).trim();
    const discordWebhookUrl = source.discordWebhookUrl == null ? '' : String(source.discordWebhookUrl).trim();
    const discordBotToken = source.discordBotToken == null ? '' : String(source.discordBotToken).trim();
    const discordChannelId = source.discordChannelId == null ? '' : String(source.discordChannelId).trim();
    const discordAllowedUserIds = source.discordAllowedUserIds == null ? '' : String(source.discordAllowedUserIds).trim();
    const discordCommandPrefix = source.discordCommandPrefix == null || String(source.discordCommandPrefix).trim() === ''
        ? '!iw4'
        : String(source.discordCommandPrefix).trim();

    const thresholdLow = Number.isFinite(parsedThresholdLow) && parsedThresholdLow >= 1 ? parsedThresholdLow : 6;
    const thresholdHighRaw = Number.isFinite(parsedThresholdHigh) && parsedThresholdHigh >= 1 ? parsedThresholdHigh : 10;
    const thresholdHigh = thresholdHighRaw > thresholdLow ? thresholdHighRaw : thresholdLow + 1;

    return {
        apiKey: apiKey,
        apiUrl: apiUrl,
        statsSource: statsSource,
        webfrontBaseUrl: webfrontBaseUrl,
        webfrontClientId: webfrontClientId,
        webfrontPassword: webfrontPassword,
        webfrontPageSize: Number.isFinite(parsedWebfrontPageSize) && parsedWebfrontPageSize >= 25 ? parsedWebfrontPageSize : 200,
        webfrontMaxPages: Number.isFinite(parsedWebfrontMaxPages) && parsedWebfrontMaxPages >= 1 ? parsedWebfrontMaxPages : 250,
        dbPath: dbPath,
        maxRetries: Number.isFinite(parsedRetries) && parsedRetries >= 0 ? parsedRetries : 1,
        maxRowsPerRequest: Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 500,
        minSecondsBetweenSyncs: Number.isFinite(parsedCooldown) && parsedCooldown > 0 ? parsedCooldown : 20,
        discordWebhookUrl: discordWebhookUrl,
        discordThresholdLow: thresholdLow,
        discordThresholdHigh: thresholdHigh,
        discordBotToken: discordBotToken,
        discordChannelId: discordChannelId,
        discordAllowedUserIds: discordAllowedUserIds,
        discordCommandPrefix: discordCommandPrefix,
        discordPollIntervalSeconds: Number.isFinite(parsedDiscordPollInterval) && parsedDiscordPollInterval >= 5 ? parsedDiscordPollInterval : 15
    };
}

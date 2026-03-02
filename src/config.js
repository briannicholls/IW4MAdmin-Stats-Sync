export const DEFAULT_API_URL = 'http://localhost:6969/iw4m/leaderboard_snapshots';

export const defaultConfig = {
    apiKey: '',
    apiUrl: DEFAULT_API_URL,
    maxRetries: 1,
    maxRowsPerRequest: 500,
    minSecondsBetweenSyncs: 20,
    snapshotIntervalSeconds: 300,
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
    const parsedSnapshotInterval = parseInt(source.snapshotIntervalSeconds, 10);
    const parsedThresholdLow = parseInt(source.discordThresholdLow, 10);
    const parsedThresholdHigh = parseInt(source.discordThresholdHigh, 10);
    const parsedDiscordPollInterval = parseInt(source.discordPollIntervalSeconds, 10);

    const apiKey = source.apiKey == null ? '' : String(source.apiKey).trim();
    const apiUrl = source.apiUrl == null || String(source.apiUrl).trim() === ''
        ? DEFAULT_API_URL
        : String(source.apiUrl).trim();
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
        maxRetries: Number.isFinite(parsedRetries) && parsedRetries >= 0 ? parsedRetries : 1,
        maxRowsPerRequest: Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 500,
        minSecondsBetweenSyncs: Number.isFinite(parsedCooldown) && parsedCooldown > 0 ? parsedCooldown : 20,
        snapshotIntervalSeconds: Number.isFinite(parsedSnapshotInterval) && parsedSnapshotInterval >= 5 ? parsedSnapshotInterval : 300,
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

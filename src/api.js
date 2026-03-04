import { snippet } from './utils.js';
import { DEFAULT_API_URL } from './config.js';

export function responseToText(response) {
    if (response == null) return '';
    if (typeof response === 'string') return response;

    try {
        if (typeof response.body === 'string') return response.body;
        if (typeof response.content === 'string') return response.content;
        if (typeof response.data === 'string') return response.data;
    } catch (_) { }

    try {
        return JSON.stringify(response);
    } catch (_) {
        try {
            return String(response);
        } catch (_) {
            return '';
        }
    }
}

export function parseApiResponse(rawResponse, textResponse) {
    if (rawResponse && typeof rawResponse === 'object') {
        if (rawResponse.success !== undefined || rawResponse.errors !== undefined) {
            return rawResponse;
        }
        if (rawResponse.body && typeof rawResponse.body === 'string') {
            return JSON.parse(rawResponse.body);
        }
    }
    return JSON.parse(textResponse);
}

export function isApiFailure(parsed, textResponse) {
    if (!parsed || typeof parsed !== 'object') return true;
    if (parsed.errors || parsed.error || parsed.success === false) return true;
    if (parsed.status && Number(parsed.status) >= 400) return true;
    if (parsed.statusCode && Number(parsed.statusCode) >= 400) return true;
    if (parsed.Message || parsed.ExceptionMessage || parsed.exception) return true;

    const body = String(textResponse || '').toLowerCase();
    if (body.indexOf('misused header name') !== -1 || body.indexOf('exception') !== -1) {
        return true;
    }
    return false;
}

export function extractApiError(parsed) {
    if (!parsed || typeof parsed !== 'object') return '';
    if (typeof parsed.Message === 'string' && parsed.Message !== '') return parsed.Message;
    if (typeof parsed.ExceptionMessage === 'string' && parsed.ExceptionMessage !== '') return parsed.ExceptionMessage;
    if (typeof parsed.error === 'string' && parsed.error !== '') return parsed.error;
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
        const first = parsed.errors[0];
        if (typeof first === 'string') return first;
        if (first && typeof first.message === 'string') return first.message;
    }
    return '';
}

export function postPayload(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt, done) {
    try {
        const bodyJson = JSON.stringify(payload);

        const stringDict = System.Collections.Generic.Dictionary(System.String, System.String);
        const headers = new stringDict();
        if (config.apiKey) {
            headers.add('Authorization', 'Bearer ' + config.apiKey);
        }

        const pluginScript = importNamespace('IW4MAdmin.Application.Plugin.Script');
        const request = new pluginScript.ScriptPluginWebRequest(
            DEFAULT_API_URL,
            bodyJson,
            'POST',
            'application/json',
            headers
        );

        const currentAttempt = attempt;
        const maxRetries = config.maxRetries || 1;

        pluginHelper.requestUrl(request, (response) => {
            onApiResponse(response, config, logger, debugState, pluginName, pluginHelper, logDebug, payload, currentAttempt, maxRetries, done);
        });

        debugState.lastDispatchAt = new Date().toISOString();
        debugState.lastStatus = 'dispatched';
        debugState.totalPosts += 1;
        logDebug('{Name}: POST dispatched to {Url} ({Bytes} bytes, attempt {Attempt})',
            pluginName, DEFAULT_API_URL, bodyJson.length, attempt);
    } catch (ex) {
        debugState.lastStatus = 'exception';
        debugState.lastError = ex && ex.message ? ex.message : 'unknown request exception';
        debugState.totalFailures += 1;
        logger.logError('{Name}: Failed to dispatch payload - {Error}', pluginName, debugState.lastError);
        done(false);
    }
}

function onApiResponse(response, config, logger, debugState, pluginName, pluginHelper, logDebug, payload, attempt, maxRetries, done) {
    const text = responseToText(response);

    if (!response) {
        debugState.lastStatus = 'empty_response';
        debugState.lastError = 'empty API response';
        debugState.totalFailures += 1;
        logger.logWarning('{Name}: Empty response from API (attempt {Attempt})', pluginName, attempt);
        handleRetry(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt, maxRetries, done);
        return;
    }

    try {
        const parsed = parseApiResponse(response, text);
        if (isApiFailure(parsed, text)) {
            debugState.lastStatus = 'rejected';
            debugState.lastResponse = snippet(text);
            debugState.lastError = extractApiError(parsed) || 'API rejected payload';
            debugState.totalFailures += 1;
            logger.logWarning('{Name}: API rejected batch {Batch}/{Count} (attempt {Attempt}) - {Response}',
                pluginName,
                Number(payload.batch_index) + 1,
                payload.batch_count,
                attempt,
                snippet(text));
            handleRetry(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt, maxRetries, done);
            return;
        }

        debugState.lastStatus = 'accepted';
        debugState.lastResponse = snippet(text);
        debugState.lastError = '';
        logger.logInformation('{Name}: API accepted batch {Batch}/{Count}',
            pluginName,
            Number(payload.batch_index) + 1,
            payload.batch_count);
        logDebug('{Name}: API success response snippet: {Response}', pluginName, snippet(text));
        done(true);
    } catch (e) {
        debugState.lastStatus = 'non_json';
        debugState.lastResponse = snippet(text);
        debugState.lastError = 'non-JSON API response: ' + (e && e.message ? e.message : 'parse error');
        debugState.totalFailures += 1;
        logger.logWarning('{Name}: Non-JSON API response (attempt {Attempt}): {Response}',
            pluginName,
            attempt,
            snippet(text));
        handleRetry(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt, maxRetries, done);
    }
}

function handleRetry(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt, maxRetries, done) {
    if (attempt < maxRetries + 1) {
        logger.logInformation('{Name}: Retrying POST (attempt {Next} of {Max})',
            pluginName,
            attempt + 1,
            maxRetries + 1);
        postPayload(config, pluginHelper, logger, debugState, pluginName, logDebug, payload, attempt + 1, done);
        return;
    }

    logger.logError('{Name}: All {Max} attempt(s) failed for batch {Batch}/{Count}',
        pluginName,
        maxRetries + 1,
        Number(payload.batch_index) + 1,
        payload.batch_count);
    done(false);
}

/**
 * Shared HTTP Client
 * Centralized axios wrapper with retry, timeout, and error handling
 * @module shared/utils/httpClient
 */

const axios = require('axios');

const DEFAULT_CONFIG = {
    timeout: 15000,
    retries: 2,
    retryDelay: 1000,
    userAgent: 'alterGolden/2.0 (Discord Bot)'
};

const USER_AGENTS = {
    default: 'alterGolden/2.0 (Discord Bot)',
    browser: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    pixiv: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 5)',
    reddit: 'DiscordBot/1.0',
    mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
};

/**
 * HTTP Client with retry and error handling
 */
class HttpClient {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.client = axios.create({
            timeout: this.config.timeout,
            headers: { 'User-Agent': this.config.userAgent }
        });
        
        // Request timing for performance monitoring
        this.client.interceptors.request.use((config) => {
            config.metadata = { startTime: Date.now() };
            return config;
        });
        
        this.client.interceptors.response.use((response) => {
            response.duration = Date.now() - response.config.metadata.startTime;
            return response;
        });
    }

    async get(url, options = {}) {
        return this._request('get', url, null, options);
    }

    async post(url, data, options = {}) {
        return this._request('post', url, data, options);
    }

    async put(url, data, options = {}) {
        return this._request('put', url, data, options);
    }

    async delete(url, options = {}) {
        return this._request('delete', url, null, options);
    }

    async _request(method, url, data = null, options = {}) {
        const maxRetries = options.retries ?? this.config.retries;
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const config = {
                    method,
                    url,
                    timeout: options.timeout ?? this.config.timeout,
                    headers: {
                        'User-Agent': options.userAgent ?? this.config.userAgent,
                        ...options.headers
                    },
                    params: options.params,
                    responseType: options.responseType || 'json'
                };

                if (data) config.data = data;

                const response = await this.client.request(config);
                return { 
                    success: true, 
                    data: response.data, 
                    status: response.status,
                    duration: response.duration 
                };

            } catch (error) {
                lastError = error;
                
                // Don't retry client errors (except rate limits)
                if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
                    break;
                }
                
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, this.config.retryDelay * (attempt + 1)));
                }
            }
        }

        return this._handleError(lastError);
    }

    _handleError(error) {
        const status = error.response?.status;
        let errorMessage = 'Request failed. Please try again.';
        let errorCode = 'UNKNOWN_ERROR';

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            errorMessage = 'Request timed out.';
            errorCode = 'TIMEOUT';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Service unavailable.';
            errorCode = 'SERVICE_UNAVAILABLE';
        } else if (status === 404) {
            errorMessage = 'Not found.';
            errorCode = 'NOT_FOUND';
        } else if (status === 403) {
            errorMessage = 'Access denied.';
            errorCode = 'FORBIDDEN';
        } else if (status === 429) {
            errorMessage = 'Rate limited. Please wait.';
            errorCode = 'RATE_LIMITED';
        } else if (status >= 500) {
            errorMessage = 'Server error.';
            errorCode = 'SERVER_ERROR';
        }

        return { success: false, error: errorMessage, errorCode, status };
    }
}

// Pre-configured clients for common use cases
const clients = {
    default: new HttpClient(),
    browser: new HttpClient({ userAgent: USER_AGENTS.browser }),
    reddit: new HttpClient({ userAgent: USER_AGENTS.reddit }),
    pixiv: new HttpClient({ userAgent: USER_AGENTS.pixiv, timeout: 30000 })
};

/**
 * Get or create a client with specific config
 * @param {string} name - Client name
 * @param {Object} config - Client config
 * @returns {HttpClient}
 */
function getClient(name, config = {}) {
    if (clients[name]) return clients[name];
    clients[name] = new HttpClient(config);
    return clients[name];
}

module.exports = { 
    HttpClient, 
    clients, 
    getClient,
    USER_AGENTS 
};

/**
 * Guild Services
 * Guild settings and caching
 * @module services/guild
 */

const GuildSettingsService = require('./GuildSettingsService');
const RedisCache = require('./RedisCache');

module.exports = {
    GuildSettingsService,
    RedisCache
};

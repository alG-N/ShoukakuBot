/**
 * API Repositories - Data caching for API services
 */
const animeRepository = require('./animeRepository');
const cacheManager = require('./cacheManager');
const nhentaiRepository = require('./nhentaiRepository');
const pixivCache = require('./pixivCache');
const redditCache = require('./redditCache');
const rule34Cache = require('./rule34Cache');

module.exports = {
    animeRepository,
    cacheManager,
    nhentaiRepository,
    pixivCache,
    redditCache,
    rule34Cache
};

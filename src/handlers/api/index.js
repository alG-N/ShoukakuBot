/**
 * API Handlers - Process API data
 */
const animeHandler = require('./animeHandler');
const googleHandler = require('./googleHandler');
const nhentaiHandler = require('./nhentaiHandler');
const pixivContentHandler = require('./pixivContentHandler');
const redditPostHandler = require('./redditPostHandler');
const rule34PostHandler = require('./rule34PostHandler');
const steamSaleHandler = require('./steamSaleHandler');
const wikipediaHandler = require('./wikipediaHandler');

module.exports = {
    animeHandler,
    googleHandler,
    nhentaiHandler,
    pixivContentHandler,
    redditPostHandler,
    rule34PostHandler,
    steamSaleHandler,
    wikipediaHandler
};

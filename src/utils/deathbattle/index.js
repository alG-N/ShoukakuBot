/**
 * Deathbattle Utilities
 */
const embedBuilder = require('./embedBuilder');
const logger = require('./logger');

module.exports = {
    ...embedBuilder,
    ...logger,
    embedBuilder,
    logger
};

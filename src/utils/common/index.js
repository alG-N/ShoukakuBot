/**
 * Common Utilities
 */
const time = require('./time');
const embed = require('./embed');
const pagination = require('./pagination');
const httpClient = require('./httpClient');
const cooldown = require('./cooldown');

module.exports = {
    ...time,
    ...embed,
    ...pagination,
    ...httpClient,
    ...cooldown,
    time,
    embed,
    pagination,
    httpClient,
    cooldown
};

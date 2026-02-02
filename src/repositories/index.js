/**
 * Repositories - Data access layer organized by feature
 * @module repositories
 */
const api = require('./api');
const music = require('./music');
const moderation = require('./moderation');

module.exports = {
    api,
    music,
    moderation
};

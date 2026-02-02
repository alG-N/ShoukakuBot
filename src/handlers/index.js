/**
 * Handlers - Business logic handlers organized by feature
 * @module handlers
 */
const api = require('./api');
const music = require('./music');
const moderation = require('./moderation');

module.exports = {
    api,
    music,
    moderation
};

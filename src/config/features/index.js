/**
 * Feature Configurations Index
 * Central export for all feature-specific configs
 * @module config/features
 */

const music = require('./music');
const video = require('./video');
const admin = require('./admin');
const lavalink = require('./lavalink');
const moderation = require('./moderation');

module.exports = {
    music,
    video,
    admin,
    lavalink,
    moderation
};

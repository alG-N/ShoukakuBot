/**
 * Utils Module
 * Pure utility functions and helpers
 * @module utils
 */

const common = require('./common');

// Feature-specific utils
const music = require('./music');
const video = require('./video');
const deathbattle = require('./deathbattle');
const say = require('./say');

module.exports = {
    // Common utilities
    ...common,
    common,
    
    // Feature utils
    music,
    video,
    deathbattle,
    say
};

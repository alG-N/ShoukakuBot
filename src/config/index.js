/**
 * alterGolden Configuration Module
 * Central export for all configuration files
 * 
 * STRUCTURE:
 * - bot: Bot identity settings
 * - owner: Owner/developer settings
 * - maintenance: Maintenance mode settings
 * - database: PostgreSQL & Redis settings
 * - services: External API credentials
 * - features/: Feature-specific configs (music, video, admin, lavalink, moderation)
 * 
 * @module config
 */

// Core configs
const bot = require('./bot');
const owner = require('./owner');
const maintenance = require('./maintenance');

// Infrastructure configs
const database = require('./database');
const services = require('./services');

// Feature configs
const features = require('./features');

module.exports = {
    // Core
    bot,
    owner,
    maintenance,
    
    // Infrastructure
    database,
    services,
    
    // Features namespace
    features,
    
    // Direct exports for convenience (from features/)
    music: features.music,
    video: features.video,
    admin: features.admin,
    lavalink: features.lavalink,
    moderation: features.moderation
};

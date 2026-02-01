/**
 * Services Module
 * Business logic services organized by feature
 * @module services
 */

// Core Services
const registry = require('./registry');
const guild = require('./guild');
const moderation = require('./moderation');

// Feature Services
const music = require('./music');
const video = require('./video');
const api = require('./api');
const fun = require('./fun');

// Middleware (re-export for convenience)
const { AccessType, checkAccess, checkMaintenance, createErrorEmbed, createWarningEmbed } = require('../middleware/access');

module.exports = {
    // Core
    registry,
    guild,
    moderation,
    
    // Features
    music,
    video,
    api,
    fun,
    
    // Direct exports for convenience
    CommandRegistry: registry.CommandRegistry,
    EventRegistry: registry.EventRegistry,
    GuildSettingsService: guild.GuildSettingsService,
    RedisCache: guild.RedisCache,
    ModerationService: moderation.ModerationService,
    SnipeService: moderation.SnipeService,
    
    // Middleware exports
    AccessType,
    checkAccess,
    checkMaintenance,
    createErrorEmbed,
    createWarningEmbed
};

/**
 * alterGolden Configuration Module
 * Central export for all configuration files
 * @module config
 */

// Core configs
import * as bot from './bot.js';
import * as owner from './owner.js';
import * as maintenance from './maintenance.js';

// Infrastructure configs
import * as database from './database.js';
import * as services from './services.js';

// Feature configs
import * as features from './features/index.js';

export { bot, owner, maintenance, database, services, features };

// Direct exports for convenience
export const { music, video, lavalink } = features;

export default {
    // Core
    bot,
    owner,
    maintenance,
    
    // Infrastructure
    database,
    services,
    
    // Features namespace
    features,
    
    // Direct feature access
    music: features.music,
    video: features.video,
    lavalink: features.lavalink
};

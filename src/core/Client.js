/**
 * alterGolden Discord Client Factory
 * Core client configuration and creation
 * @module core/Client
 */

const { Client, GatewayIntentBits, Partials, ActivityType, Options } = require('discord.js');

/**
 * Client configuration optimized for 1000+ servers
 */
const CLIENT_OPTIONS = {
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildPresences
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.GuildMember,
        Partials.User
    ],
    allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: false
    },
    // Sweep settings for memory optimization at scale
    sweepers: {
        messages: {
            interval: 300, // 5 minutes
            lifetime: 600  // 10 minutes
        },
        users: {
            interval: 3600, // 1 hour
            filter: () => (user) => user.bot && user.id !== user.client.user.id
        }
    },
    // Disable caching for data we don't need
    makeCache: Options.cacheWithLimits({
        MessageManager: 100,
        PresenceManager: 0,
        ReactionManager: 0,
        GuildBanManager: 0,
        GuildInviteManager: 0,
        GuildScheduledEventManager: 0,
        StageInstanceManager: 0,
        ThreadManager: 100,
        ThreadMemberManager: 0,
    })
};

/**
 * Creates and configures the Discord client
 * @returns {Client} Configured Discord client
 */
function createClient() {
    return new Client(CLIENT_OPTIONS);
}

/**
 * Sets the bot's presence
 * @param {Client} client - Discord client
 * @param {string} status - Status (online, idle, dnd, invisible)
 * @param {string} activityName - Activity name
 * @param {ActivityType} activityType - Activity type
 */
function setPresence(client, status, activityName, activityType = ActivityType.Playing) {
    if (!client.user) return;
    
    client.user.setPresence({
        status: status,
        activities: [{
            name: activityName,
            type: activityType
        }]
    });
}

/**
 * Get memory usage stats (useful for monitoring at scale)
 * @param {Client} client - Discord client
 * @returns {Object} Memory and cache statistics
 */
function getClientStats(client) {
    const used = process.memoryUsage();
    return {
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        channels: client.channels.cache.size,
        memory: {
            heapUsed: Math.round(used.heapUsed / 1024 / 1024) + ' MB',
            heapTotal: Math.round(used.heapTotal / 1024 / 1024) + ' MB',
            rss: Math.round(used.rss / 1024 / 1024) + ' MB'
        },
        uptime: Math.round(client.uptime / 1000) + 's'
    };
}

module.exports = {
    createClient,
    setPresence,
    getClientStats,
    ActivityType,
    CLIENT_OPTIONS
};

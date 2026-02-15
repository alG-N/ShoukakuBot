/**
 * Shoukaku Discord Client Factory
 * Core client configuration and creation
 * @module core/Client
 */

import { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    ActivityType, 
    Options,
    PresenceStatusData
} from 'discord.js';
// TYPES
export interface ClientStats {
    guilds: number;
    users: number;
    channels: number;
    memory: {
        heapUsed: string;
        heapTotal: string;
        rss: string;
    };
    uptime: string;
}
// CLIENT CONFIGURATION
/**
 * Client configuration optimized for 1000+ servers
 */
export const CLIENT_OPTIONS = {
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.GuildMember,
        Partials.User
    ],
    allowedMentions: {
        parse: ['users', 'roles'] as const,
        repliedUser: false
    },
    // Increase REST timeout for large file uploads (video downloads can be 50-100MB)
    rest: {
        timeout: 120000, // 2 minutes (default is 15 seconds)
    },
    // Sweep settings for memory optimization at scale
    sweepers: {
        messages: {
            interval: 300, // 5 minutes
            lifetime: 600  // 10 minutes
        },
        users: {
            interval: 3600, // 1 hour
            filter: () => (user: { bot: boolean; id: string; client: { user: { id: string } | null } }) => 
                user.bot && user.id !== user.client.user?.id
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
// CLIENT FUNCTIONS
/**
 * Creates and configures the Discord client
 * @returns Configured Discord client
 */
export function createClient(): Client {
    return new Client(CLIENT_OPTIONS);
}

/**
 * Sets the bot's presence
 * @param client - Discord client
 * @param status - Status (online, idle, dnd, invisible)
 * @param activityName - Activity name
 * @param activityType - Activity type
 */
export function setPresence(
    client: Client, 
    status: PresenceStatusData, 
    activityName: string, 
    activityType: ActivityType = ActivityType.Playing
): void {
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
 * @param client - Discord client
 * @returns Memory and cache statistics
 */
export function getClientStats(client: Client): ClientStats {
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
        uptime: Math.round((client.uptime || 0) / 1000) + 's'
    };
}

// Re-export ActivityType for convenience
export { ActivityType };

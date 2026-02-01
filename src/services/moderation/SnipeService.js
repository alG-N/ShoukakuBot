/**
 * Snipe Service
 * Tracks deleted messages for the /snipe command
 * @module services/SnipeService
 */

const GuildSettingsService = require('../guild/GuildSettingsService');

// In-memory message cache
// Map<guildId, Array<{message, deletedAt}>>
const deletedMessages = new Map();

// Memory limits to prevent memory leaks
const MAX_GUILDS_CACHED = 1000;
const MAX_MESSAGES_PER_GUILD = 50;
const MESSAGE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

let isInitialized = false;
let cleanupIntervalId = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the snipe service with the Discord client
 * @param {Client} client - Discord client
 */
function initialize(client) {
    if (isInitialized) {
        console.log('⚠️ Snipe service already initialized, skipping...');
        return;
    }

    // Listen for message deletions
    client.on('messageDelete', async (message) => {
        if (message.author?.bot) return;
        if (!message.content && message.attachments.size === 0 && message.embeds.length === 0) return;
        if (!message.guild) return;

        try {
            await trackDeletedMessage(message);
        } catch (error) {
            console.error('[SnipeService] Error tracking deleted message:', error);
        }
    });

    // Listen for bulk deletions
    client.on('messageDeleteBulk', async (messages) => {
        for (const message of messages.values()) {
            if (message.author?.bot) continue;
            if (!message.content && message.attachments.size === 0) continue;
            if (!message.guild) continue;

            try {
                await trackDeletedMessage(message);
            } catch (error) {
                console.error('[SnipeService] Error tracking bulk deleted message:', error);
            }
        }
    });

    // Cleanup old messages every 10 minutes
    cleanupIntervalId = setInterval(cleanupOldMessages, 10 * 60 * 1000);

    isInitialized = true;
    console.log('✅ Snipe service initialized');
}

/**
 * Shutdown the snipe service
 */
function shutdown() {
    if (cleanupIntervalId) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
    }
    deletedMessages.clear();
    isInitialized = false;
    console.log('✅ Snipe service shutdown');
}

/**
 * Cleanup old messages to prevent memory leaks
 */
function cleanupOldMessages() {
    const now = Date.now();
    let totalCleaned = 0;

    for (const [guildId, messages] of deletedMessages) {
        // Remove expired messages
        const validMessages = messages.filter(m => (now - m.deletedAt) < MESSAGE_EXPIRY_MS);
        
        if (validMessages.length === 0) {
            deletedMessages.delete(guildId);
            totalCleaned += messages.length;
        } else if (validMessages.length !== messages.length) {
            totalCleaned += messages.length - validMessages.length;
            deletedMessages.set(guildId, validMessages);
        }
    }

    // If too many guilds, remove oldest
    if (deletedMessages.size > MAX_GUILDS_CACHED) {
        const guildsToRemove = deletedMessages.size - MAX_GUILDS_CACHED;
        const keys = [...deletedMessages.keys()];
        for (let i = 0; i < guildsToRemove; i++) {
            deletedMessages.delete(keys[i]);
        }
        console.log(`[SnipeService] Removed ${guildsToRemove} old guild caches`);
    }

    if (totalCleaned > 0) {
        console.log(`[SnipeService] Cleaned ${totalCleaned} expired messages`);
    }
}

// ============================================================================
// MESSAGE TRACKING
// ============================================================================

/**
 * Track a deleted message
 * @param {Message} message - The deleted message
 */
async function trackDeletedMessage(message) {
    const guildId = message.guild.id;
    const limit = await GuildSettingsService.getSnipeLimit(guildId);

    if (!deletedMessages.has(guildId)) {
        deletedMessages.set(guildId, []);
    }

    const guildCache = deletedMessages.get(guildId);

    // Store attachment info
    const attachments = [];
    if (message.attachments.size > 0) {
        for (const [, attachment] of message.attachments) {
            attachments.push({
                url: attachment.url,
                proxyUrl: attachment.proxyURL,
                name: attachment.name,
                type: attachment.contentType,
                size: attachment.size
            });
        }
    }

    // Create tracked message object
    const trackedMessage = {
        id: message.id,
        content: message.content || '',
        author: {
            id: message.author?.id || 'Unknown',
            tag: message.author?.tag || 'Unknown User',
            displayName: message.member?.displayName || message.author?.username || 'Unknown',
            avatarURL: message.author?.displayAvatarURL?.({ dynamic: true }) || null
        },
        channel: {
            id: message.channel.id,
            name: message.channel.name
        },
        attachments,
        embeds: message.embeds.length > 0 ? message.embeds.map(e => ({
            title: e.title,
            description: e.description,
            url: e.url
        })) : [],
        createdAt: message.createdTimestamp,
        deletedAt: Date.now()
    };

    // Add to cache (newest first)
    guildCache.unshift(trackedMessage);

    // Trim to limit (use smaller of configured limit or max allowed)
    const effectiveLimit = Math.min(limit, MAX_MESSAGES_PER_GUILD);
    if (guildCache.length > effectiveLimit) {
        guildCache.splice(effectiveLimit);
    }
}

// ============================================================================
// RETRIEVAL
// ============================================================================

/**
 * Get deleted messages for a guild
 * @param {string} guildId - Guild ID
 * @param {number} count - Number of messages to retrieve
 * @param {string} channelId - Optional: Filter by channel ID
 * @returns {Array} Array of deleted message objects
 */
function getDeletedMessages(guildId, count = 1, channelId = null) {
    const guildCache = deletedMessages.get(guildId) || [];
    let filtered = guildCache;
    
    if (channelId) {
        filtered = guildCache.filter(m => m.channel.id === channelId);
    }
    
    return filtered.slice(0, count);
}

/**
 * Get a specific deleted message by index
 * @param {string} guildId - Guild ID
 * @param {number} index - Message index (0 = most recent)
 * @param {string} channelId - Optional: Filter by channel ID
 * @returns {Object|null} Deleted message object or null
 */
function getDeletedMessageByIndex(guildId, index = 0, channelId = null) {
    const messages = getDeletedMessages(guildId, index + 1, channelId);
    return messages[index] || null;
}

/**
 * Get deleted messages by a specific user
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID to filter by
 * @param {number} count - Number of messages to retrieve
 * @returns {Array} Array of deleted message objects
 */
function getDeletedMessagesByUser(guildId, userId, count = 10) {
    const guildCache = deletedMessages.get(guildId) || [];
    return guildCache.filter(m => m.author.id === userId).slice(0, count);
}

/**
 * Clear deleted messages cache for a guild
 * @param {string} guildId - Guild ID
 */
function clearGuildCache(guildId) {
    deletedMessages.delete(guildId);
}

/**
 * Cleanup old messages (older than 24 hours)
 */
function cleanupOldMessages() {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    for (const [guildId, messages] of deletedMessages.entries()) {
        const filtered = messages.filter(m => (now - m.deletedAt) < maxAge);
        
        if (filtered.length === 0) {
            deletedMessages.delete(guildId);
        } else if (filtered.length !== messages.length) {
            deletedMessages.set(guildId, filtered);
        }
    }
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get snipe statistics for a guild
 * @param {string} guildId - Guild ID
 * @returns {Object} Statistics object
 */
function getGuildStats(guildId) {
    const messages = deletedMessages.get(guildId) || [];
    
    const channelCounts = {};
    const userCounts = {};
    
    for (const msg of messages) {
        channelCounts[msg.channel.id] = (channelCounts[msg.channel.id] || 0) + 1;
        userCounts[msg.author.id] = (userCounts[msg.author.id] || 0) + 1;
    }
    
    return {
        totalTracked: messages.length,
        channelCounts,
        userCounts,
        oldestMessage: messages.length > 0 ? messages[messages.length - 1].deletedAt : null,
        newestMessage: messages.length > 0 ? messages[0].deletedAt : null
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    initialize,
    shutdown,
    trackDeletedMessage,
    getDeletedMessages,
    getDeletedMessageByIndex,
    getDeletedMessagesByUser,
    clearGuildCache,
    cleanupOldMessages,
    getGuildStats
};

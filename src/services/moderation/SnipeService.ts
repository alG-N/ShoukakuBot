/**
 * Snipe Service
 * Tracks deleted messages for the /snipe command
 * SHARD-SAFE: Uses Redis via CacheService for cross-shard message tracking
 * @module services/moderation/SnipeService
 */

import type { Client, Message, Snowflake } from 'discord.js';
import GuildSettingsService from '../guild/GuildSettingsService.js';
import cacheService from '../../cache/CacheService.js';
import logger from '../../core/Logger.js';
// TYPES
interface TrackedAttachment {
    url: string;
    proxyUrl: string;
    name: string;
    type: string | null;
    size: number;
}

interface TrackedEmbed {
    title?: string;
    description?: string;
    url?: string;
}

interface TrackedAuthor {
    id: string;
    tag: string;
    displayName: string;
    avatarURL: string | null;
}

interface TrackedChannel {
    id: string;
    name: string;
}

interface TrackedMessage {
    id: string;
    content: string;
    author: TrackedAuthor;
    channel: TrackedChannel;
    attachments: TrackedAttachment[];
    embeds: TrackedEmbed[];
    createdAt: number;
    deletedAt: number;
}

// Constants
const SNIPE_NAMESPACE = 'snipe';
const MAX_MESSAGES_PER_GUILD = 25;
const MAX_CONTENT_LENGTH = 2000;
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MESSAGE_EXPIRY_SECONDS = 12 * 60 * 60; // 12 hours in seconds

// Helper functions
const getSnipeKey = (guildId: string) => `messages:${guildId}`;

let isInitialized = false;
// INITIALIZATION
/**
 * Initialize the snipe service with the Discord client
 * SHARD-SAFE: Uses Redis for storage, TTL handles expiration automatically
 */
export function initialize(client: Client): void {
    if (isInitialized) {
        logger.info('SnipeService', 'Already initialized, skipping');
        return;
    }

    client.on('messageDelete', async (message) => {
        if (message.author?.bot) return;
        if (!message.content && message.attachments.size === 0 && message.embeds.length === 0) return;
        if (!message.guild) return;

        try {
            await trackDeletedMessage(message as Message);
        } catch (error) {
            logger.error('SnipeService', `Error tracking deleted message: ${(error as Error).message}`);
        }
    });

    client.on('messageDeleteBulk', async (messages) => {
        for (const message of messages.values()) {
            if (message.author?.bot) continue;
            if (!message.content && message.attachments.size === 0) continue;
            if (!message.guild) continue;

            try {
                await trackDeletedMessage(message as Message);
            } catch (error) {
                logger.error('SnipeService', `Error tracking bulk deleted message: ${(error as Error).message}`);
            }
        }
    });

    // No cleanup interval needed - Redis TTL handles expiration
    isInitialized = true;
    logger.info('SnipeService', 'Initialized (shard-safe with Redis)');
}

/**
 * Shutdown the snipe service
 */
export function shutdown(): void {
    // No local state to clean up - Redis handles everything
    isInitialized = false;
    logger.info('SnipeService', 'Shutdown complete');
}
// MESSAGE TRACKING
/**
 * Track a deleted message
 * SHARD-SAFE: Stores in Redis with automatic TTL expiration
 */
async function trackDeletedMessage(message: Message): Promise<void> {
    const guildId = message.guild!.id;
    const limit = await GuildSettingsService.getSnipeLimit(guildId);
    const cacheKey = getSnipeKey(guildId);

    // Get existing messages from Redis (may not exist — not a real miss)
    const existingMessages = await cacheService.peek<TrackedMessage[]>(SNIPE_NAMESPACE, cacheKey) || [];

    // Store attachment info
    const attachments: TrackedAttachment[] = [];
    if (message.attachments.size > 0) {
        let count = 0;
        for (const [, attachment] of message.attachments) {
            if (count >= MAX_ATTACHMENTS_PER_MESSAGE) break;
            attachments.push({
                url: attachment.url,
                proxyUrl: attachment.proxyURL,
                name: attachment.name?.substring(0, 100) || 'unknown',
                type: attachment.contentType,
                size: attachment.size
            });
            count++;
        }
    }

    const truncatedContent = message.content
        ? message.content.substring(0, MAX_CONTENT_LENGTH)
        : '';

    const trackedMessage: TrackedMessage = {
        id: message.id,
        content: truncatedContent,
        author: {
            id: message.author?.id || 'Unknown',
            tag: message.author?.tag || 'Unknown User',
            displayName: (message.member?.displayName || message.author?.username || 'Unknown').substring(0, 50),
            avatarURL: message.author?.displayAvatarURL?.({ size: 64 }) || null
        },
        channel: {
            id: message.channel.id,
            name: ('name' in message.channel ? message.channel.name : 'unknown')?.substring(0, 50) || 'unknown'
        },
        attachments,
        embeds: message.embeds.length > 0 ? message.embeds.slice(0, 3).map(e => ({
            title: e.title?.substring(0, 100),
            description: e.description?.substring(0, 200),
            url: e.url || undefined
        })) : [],
        createdAt: message.createdTimestamp,
        deletedAt: Date.now()
    };

    // Add new message at the beginning
    existingMessages.unshift(trackedMessage);

    // Enforce limit
    const effectiveLimit = Math.min(limit, MAX_MESSAGES_PER_GUILD);
    if (existingMessages.length > effectiveLimit) {
        existingMessages.splice(effectiveLimit);
    }

    // Store back to Redis with TTL
    await cacheService.set(SNIPE_NAMESPACE, cacheKey, existingMessages, MESSAGE_EXPIRY_SECONDS);
}
// RETRIEVAL
/**
 * Get deleted messages for a guild
 * SHARD-SAFE: Reads from Redis
 */
export async function getDeletedMessages(guildId: Snowflake, channelId?: Snowflake): Promise<TrackedMessage[]> {
    const cacheKey = getSnipeKey(guildId);
    const messages = await cacheService.peek<TrackedMessage[]>(SNIPE_NAMESPACE, cacheKey) || [];

    if (channelId) {
        return messages.filter(m => m.channel.id === channelId);
    }

    return messages;
}

/**
 * Get a specific deleted message
 * SHARD-SAFE: Reads from Redis
 */
export async function getMessage(guildId: Snowflake, index: number = 0, channelId?: Snowflake): Promise<TrackedMessage | null> {
    const messages = await getDeletedMessages(guildId, channelId);
    return messages[index] || null;
}

/**
 * Clear deleted messages for a guild
 * SHARD-SAFE: Clears from Redis
 */
export async function clearMessages(guildId: Snowflake, channelId?: Snowflake): Promise<number> {
    const cacheKey = getSnipeKey(guildId);

    if (channelId) {
        const messages = await cacheService.peek<TrackedMessage[]>(SNIPE_NAMESPACE, cacheKey) || [];
        const before = messages.length;
        const filtered = messages.filter(m => m.channel.id !== channelId);
        
        if (filtered.length > 0) {
            await cacheService.set(SNIPE_NAMESPACE, cacheKey, filtered, MESSAGE_EXPIRY_SECONDS);
        } else {
            await cacheService.delete(SNIPE_NAMESPACE, cacheKey);
        }
        
        return before - filtered.length;
    }

    const messages = await cacheService.peek<TrackedMessage[]>(SNIPE_NAMESPACE, cacheKey) || [];
    const count = messages.length;
    await cacheService.delete(SNIPE_NAMESPACE, cacheKey);
    return count;
}

// EXPORTS
export default {
    initialize,
    shutdown,
    getDeletedMessages,
    getMessage,
    clearMessages
};

export type { TrackedMessage, TrackedAttachment, TrackedEmbed };

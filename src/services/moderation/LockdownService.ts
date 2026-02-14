/**
 * Lockdown Service
 * Channel and server lockdown functionality
 * SHARD-SAFE: Uses Redis via CacheService for state persistence
 * @module services/moderation/LockdownService
 */

import { PermissionFlagsBits, ChannelType, type Guild, type TextChannel, type Snowflake } from 'discord.js';
import cacheService from '../../cache/CacheService.js';
import logger from '../../core/Logger.js';
// TYPES
interface SavedPermissions {
    allow: string; // bigint as string for JSON serialization
    deny: string;
}

interface LockdownState {
    locked: boolean;
    permissions: Record<Snowflake, SavedPermissions | null>;
}

interface LockResult {
    success: boolean;
    error?: string;
    channelId: string;
    channelName: string;
}

interface ServerLockResult {
    success: LockResult[];
    failed: LockResult[];
    skipped: LockResult[];
    message?: string;
}

// Redis key helpers
const LOCKDOWN_NAMESPACE = 'lockdown';
const getLockdownKey = (guildId: string, channelId: string) => `${guildId}:${channelId}`;
// LOCKDOWN SERVICE CLASS
class LockdownService {

    /**
     * Lock a single channel
     * SHARD-SAFE: Stores state in Redis
     */
    async lockChannel(channel: TextChannel, reason: string = 'Channel locked'): Promise<LockResult> {
        const guildId = channel.guild.id;
        const channelId = channel.id;
        const cacheKey = getLockdownKey(guildId, channelId);

        // Check if already locked (from Redis)
        const existingState = await cacheService.peek<LockdownState>(LOCKDOWN_NAMESPACE, cacheKey);
        if (existingState?.locked) {
            return { success: false, error: 'Channel is already locked', channelId, channelName: channel.name };
        }

        try {
            const everyoneRole = channel.guild.roles.everyone;

            // Save current permissions
            const currentOverwrite = channel.permissionOverwrites.cache.get(everyoneRole.id);
            const permissions: Record<Snowflake, SavedPermissions | null> = {
                [everyoneRole.id]: currentOverwrite ? {
                    allow: currentOverwrite.allow.bitfield.toString(),
                    deny: currentOverwrite.deny.bitfield.toString()
                } : null
            };

            // Lock channel
            await channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false,
                AddReactions: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false,
                SendMessagesInThreads: false
            }, { reason });

            // Store state in Redis (24 hour TTL for safety)
            await cacheService.set<LockdownState>(LOCKDOWN_NAMESPACE, cacheKey, {
                locked: true,
                permissions
            }, 86400);

            // Update the index of locked channels
            await this._addToIndex(guildId, channelId);

            return { success: true, channelId, channelName: channel.name };
        } catch (error) {
            return {
                success: false,
                error: (error as Error).message,
                channelId,
                channelName: channel.name
            };
        }
    }

    /**
     * Unlock a single channel
     * SHARD-SAFE: Retrieves state from Redis
     */
    async unlockChannel(channel: TextChannel, reason: string = 'Channel unlocked'): Promise<LockResult> {
        const guildId = channel.guild.id;
        const channelId = channel.id;
        const cacheKey = getLockdownKey(guildId, channelId);

        // Check if locked (from Redis)
        const lockState = await cacheService.peek<LockdownState>(LOCKDOWN_NAMESPACE, cacheKey);
        if (!lockState?.locked) {
            return { success: false, error: 'Channel is not locked', channelId, channelName: channel.name };
        }

        try {
            const everyoneRole = channel.guild.roles.everyone;

            // Restore permissions (reset to null = remove our overwrite)
            await channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: null,
                AddReactions: null,
                CreatePublicThreads: null,
                CreatePrivateThreads: null,
                SendMessagesInThreads: null
            }, { reason });

            // Remove from Redis
            await cacheService.delete(LOCKDOWN_NAMESPACE, cacheKey);
            
            // Update the index
            await this._removeFromIndex(guildId, channelId);

            return { success: true, channelId, channelName: channel.name };
        } catch (error) {
            return {
                success: false,
                error: (error as Error).message,
                channelId,
                channelName: channel.name
            };
        }
    }

    /**
     * Lock entire server (all text channels)
     * SHARD-SAFE: Each channel lock is stored in Redis
     */
    async lockServer(
        guild: Guild,
        reason: string = 'Server lockdown',
        excludeChannels: Snowflake[] = []
    ): Promise<ServerLockResult> {
        const textChannels = guild.channels.cache.filter(ch =>
            ch.type === ChannelType.GuildText &&
            !excludeChannels.includes(ch.id) &&
            ch.permissionsFor(guild.members.me!)?.has(PermissionFlagsBits.ManageChannels)
        );

        const results: ServerLockResult = {
            success: [],
            failed: [],
            skipped: []
        };

        for (const [channelId, channel] of textChannels) {
            // Check if already locked via Redis
            const cacheKey = getLockdownKey(guild.id, channelId);
            const existingState = await cacheService.peek<LockdownState>(LOCKDOWN_NAMESPACE, cacheKey);
            
            if (existingState?.locked) {
                results.skipped.push({ success: true, channelId, channelName: channel.name });
                continue;
            }

            const result = await this.lockChannel(channel as TextChannel, reason);

            if (result.success) {
                results.success.push(result);
            } else {
                results.failed.push(result);
            }

            // Small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 100));
        }

        return results;
    }

    /**
     * Unlock entire server
     * SHARD-SAFE: Reads locked channels from Redis
     */
    async unlockServer(guild: Guild, reason: string = 'Server lockdown lifted'): Promise<ServerLockResult> {
        // Get all locked channels for this guild from Redis
        const lockedChannelIds = await this.getLockedChannels(guild.id);

        if (lockedChannelIds.length === 0) {
            return {
                success: [],
                failed: [],
                skipped: [],
                message: 'No locked channels found'
            };
        }

        const results: ServerLockResult = {
            success: [],
            failed: [],
            skipped: []
        };

        for (const channelId of lockedChannelIds) {
            const channel = guild.channels.cache.get(channelId);
            if (!channel || channel.type !== ChannelType.GuildText) {
                results.skipped.push({ success: false, channelId, channelName: 'Unknown' });
                // Still try to clean up Redis entry
                await cacheService.delete(LOCKDOWN_NAMESPACE, getLockdownKey(guild.id, channelId));
                continue;
            }

            const result = await this.unlockChannel(channel as TextChannel, reason);

            if (result.success) {
                results.success.push(result);
            } else {
                results.failed.push(result);
            }

            await new Promise(r => setTimeout(r, 100));
        }

        return results;
    }

    /**
     * Check if a channel is locked
     * SHARD-SAFE: Checks Redis
     */
    async isChannelLocked(guildId: Snowflake, channelId: Snowflake): Promise<boolean> {
        const cacheKey = getLockdownKey(guildId, channelId);
        const state = await cacheService.peek<LockdownState>(LOCKDOWN_NAMESPACE, cacheKey);
        return state?.locked || false;
    }

    /**
     * Get locked channels for a guild
     * SHARD-SAFE: Uses a separate index in Redis
     */
    async getLockedChannels(guildId: Snowflake): Promise<Snowflake[]> {
        const indexKey = `index:${guildId}`;
        const channelIds = await cacheService.peek<Snowflake[]>(LOCKDOWN_NAMESPACE, indexKey);
        return channelIds || [];
    }

    /**
     * Add channel to the locked index
     * @private
     */
    private async _addToIndex(guildId: Snowflake, channelId: Snowflake): Promise<void> {
        const indexKey = `index:${guildId}`;
        const current = await cacheService.peek<Snowflake[]>(LOCKDOWN_NAMESPACE, indexKey) || [];
        if (!current.includes(channelId)) {
            current.push(channelId);
            await cacheService.set(LOCKDOWN_NAMESPACE, indexKey, current, 86400);
        }
    }

    /**
     * Remove channel from the locked index
     * @private
     */
    private async _removeFromIndex(guildId: Snowflake, channelId: Snowflake): Promise<void> {
        const indexKey = `index:${guildId}`;
        const current = await cacheService.peek<Snowflake[]>(LOCKDOWN_NAMESPACE, indexKey) || [];
        const filtered = current.filter(id => id !== channelId);
        if (filtered.length > 0) {
            await cacheService.set(LOCKDOWN_NAMESPACE, indexKey, filtered, 86400);
        } else {
            await cacheService.delete(LOCKDOWN_NAMESPACE, indexKey);
        }
    }

    /**
     * Get lock status for a guild
     * SHARD-SAFE: Reads from Redis
     */
    async getLockStatus(guildId: Snowflake): Promise<{ lockedCount: number; channelIds: Snowflake[] }> {
        const channelIds = await this.getLockedChannels(guildId);
        return { lockedCount: channelIds.length, channelIds };
    }

    /**
     * Clear all lockdown data for a guild
     * SHARD-SAFE: Clears from Redis
     */
    async clearGuildData(guildId: Snowflake): Promise<void> {
        try {
            // Get all locked channels for this guild
            const lockedChannelIds = await this.getLockedChannels(guildId);
            
            // Delete each channel's lockdown state
            for (const channelId of lockedChannelIds) {
                await cacheService.delete(LOCKDOWN_NAMESPACE, getLockdownKey(guildId, channelId));
            }
            
            // Delete the index
            await cacheService.delete(LOCKDOWN_NAMESPACE, `index:${guildId}`);
        } catch (error) {
            logger.error('LockdownService', `Error clearing guild data: ${(error as Error).message}`);
        }
    }
}

// Create singleton instance
const lockdownService = new LockdownService();

export { LockdownService };
export default lockdownService;

/**
 * Lockdown Service
 * Channel and server lockdown functionality
 * @module services/moderation/LockdownService
 */

const { PermissionFlagsBits, ChannelType } = require('discord.js');

class LockdownService {
    constructor() {
        // Store original permissions for unlock
        // guildId -> channelId -> { roleId: permissions }
        this.savedPermissions = new Map();
        
        // Track locked channels
        // guildId -> Set<channelId>
        this.lockedChannels = new Map();
    }
    
    /**
     * Lock a single channel
     * @param {TextChannel} channel 
     * @param {string} reason 
     * @returns {Object} Result
     */
    async lockChannel(channel, reason = 'Channel locked') {
        const guildId = channel.guild.id;
        const channelId = channel.id;
        
        // Initialize storage
        if (!this.savedPermissions.has(guildId)) {
            this.savedPermissions.set(guildId, new Map());
        }
        if (!this.lockedChannels.has(guildId)) {
            this.lockedChannels.set(guildId, new Set());
        }
        
        // Check if already locked
        if (this.lockedChannels.get(guildId).has(channelId)) {
            return { success: false, error: 'Channel is already locked' };
        }
        
        try {
            // Get @everyone role
            const everyoneRole = channel.guild.roles.everyone;
            
            // Save current permissions
            const currentOverwrite = channel.permissionOverwrites.cache.get(everyoneRole.id);
            this.savedPermissions.get(guildId).set(channelId, {
                [everyoneRole.id]: currentOverwrite ? {
                    allow: currentOverwrite.allow.bitfield,
                    deny: currentOverwrite.deny.bitfield
                } : null
            });
            
            // Lock channel - deny SendMessages for @everyone
            await channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false,
                AddReactions: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false,
                SendMessagesInThreads: false
            }, { reason });
            
            this.lockedChannels.get(guildId).add(channelId);
            
            return {
                success: true,
                channelId,
                channelName: channel.name
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                channelId,
                channelName: channel.name
            };
        }
    }
    
    /**
     * Unlock a single channel
     * @param {TextChannel} channel 
     * @param {string} reason 
     * @returns {Object} Result
     */
    async unlockChannel(channel, reason = 'Channel unlocked') {
        const guildId = channel.guild.id;
        const channelId = channel.id;
        
        // Check if locked
        if (!this.lockedChannels.get(guildId)?.has(channelId)) {
            return { success: false, error: 'Channel is not locked' };
        }
        
        try {
            const everyoneRole = channel.guild.roles.everyone;
            const savedPerms = this.savedPermissions.get(guildId)?.get(channelId);
            
            if (savedPerms?.[everyoneRole.id]) {
                // Restore original permissions
                const original = savedPerms[everyoneRole.id];
                await channel.permissionOverwrites.edit(everyoneRole, {
                    SendMessages: null,
                    AddReactions: null,
                    CreatePublicThreads: null,
                    CreatePrivateThreads: null,
                    SendMessagesInThreads: null
                }, { reason });
            } else {
                // No original perms - just reset to neutral
                await channel.permissionOverwrites.edit(everyoneRole, {
                    SendMessages: null,
                    AddReactions: null,
                    CreatePublicThreads: null,
                    CreatePrivateThreads: null,
                    SendMessagesInThreads: null
                }, { reason });
            }
            
            // Cleanup
            this.lockedChannels.get(guildId).delete(channelId);
            this.savedPermissions.get(guildId)?.delete(channelId);
            
            return {
                success: true,
                channelId,
                channelName: channel.name
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                channelId,
                channelName: channel.name
            };
        }
    }
    
    /**
     * Lock entire server (all text channels)
     * @param {Guild} guild 
     * @param {string} reason 
     * @param {Array<string>} excludeChannels - Channel IDs to exclude
     * @returns {Object} Results
     */
    async lockServer(guild, reason = 'Server lockdown', excludeChannels = []) {
        const textChannels = guild.channels.cache.filter(ch => 
            ch.type === ChannelType.GuildText &&
            !excludeChannels.includes(ch.id) &&
            ch.permissionsFor(guild.members.me).has(PermissionFlagsBits.ManageChannels)
        );
        
        const results = {
            success: [],
            failed: [],
            skipped: []
        };
        
        for (const [channelId, channel] of textChannels) {
            // Skip if already locked
            if (this.lockedChannels.get(guild.id)?.has(channelId)) {
                results.skipped.push({ channelId, channelName: channel.name });
                continue;
            }
            
            const result = await this.lockChannel(channel, reason);
            
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
     * @param {Guild} guild 
     * @param {string} reason 
     * @returns {Object} Results
     */
    async unlockServer(guild, reason = 'Server lockdown lifted') {
        const lockedChannels = this.lockedChannels.get(guild.id);
        
        if (!lockedChannels || lockedChannels.size === 0) {
            return {
                success: [],
                failed: [],
                skipped: [],
                message: 'No locked channels found'
            };
        }
        
        const results = {
            success: [],
            failed: [],
            skipped: []
        };
        
        for (const channelId of lockedChannels) {
            const channel = guild.channels.cache.get(channelId);
            
            if (!channel) {
                results.skipped.push({ channelId, reason: 'Channel not found' });
                continue;
            }
            
            const result = await this.unlockChannel(channel, reason);
            
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
     * Set slowmode on a channel
     * @param {TextChannel} channel 
     * @param {number} seconds - 0 to disable
     * @param {string} reason 
     * @returns {Object}
     */
    async setSlowmode(channel, seconds, reason = 'Slowmode updated') {
        try {
            // Discord limit: 0-21600 (6 hours)
            const clampedSeconds = Math.max(0, Math.min(21600, seconds));
            
            await channel.setRateLimitPerUser(clampedSeconds, reason);
            
            return {
                success: true,
                channelId: channel.id,
                channelName: channel.name,
                slowmode: clampedSeconds
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                channelId: channel.id
            };
        }
    }
    
    /**
     * Emergency server-wide slowmode
     * @param {Guild} guild 
     * @param {number} seconds 
     * @param {string} reason 
     * @returns {Object}
     */
    async setServerSlowmode(guild, seconds, reason = 'Server-wide slowmode') {
        const textChannels = guild.channels.cache.filter(ch => 
            ch.type === ChannelType.GuildText &&
            ch.permissionsFor(guild.members.me).has(PermissionFlagsBits.ManageChannels)
        );
        
        const results = {
            success: [],
            failed: []
        };
        
        for (const [, channel] of textChannels) {
            const result = await this.setSlowmode(channel, seconds, reason);
            
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
     * Check if channel is locked
     * @param {string} guildId 
     * @param {string} channelId 
     * @returns {boolean}
     */
    isChannelLocked(guildId, channelId) {
        return this.lockedChannels.get(guildId)?.has(channelId) ?? false;
    }
    
    /**
     * Get all locked channels for a guild
     * @param {string} guildId 
     * @returns {Set<string>}
     */
    getLockedChannels(guildId) {
        return this.lockedChannels.get(guildId) ?? new Set();
    }
    
    /**
     * Get lock status summary
     * @param {string} guildId 
     * @returns {Object}
     */
    getLockStatus(guildId) {
        const locked = this.lockedChannels.get(guildId) ?? new Set();
        
        return {
            lockedCount: locked.size,
            channelIds: Array.from(locked)
        };
    }
}

module.exports = new LockdownService();

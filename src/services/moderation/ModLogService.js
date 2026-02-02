/**
 * Mod Log Service
 * Handles sending mod logs to designated channels
 * @module services/moderation/ModLogService
 */

const { EmbedBuilder } = require('discord.js');
const ModLogRepository = require('../../repositories/moderation/ModLogRepository');
const moderationConfig = require('../../config/features/moderation');
const { formatDuration } = require('../../utils/common/time');
const logger = require('../../core/Logger');

const { COLORS, EMOJIS } = moderationConfig;

/**
 * Log an infraction to the mod log channel
 * @param {Object} guild - Discord guild
 * @param {Object} infraction - Infraction data
 * @param {Object} user - Target user
 * @param {Object} moderator - Moderator user
 */
async function logInfraction(guild, infraction, user, moderator) {
    try {
        const settings = await ModLogRepository.get(guild.id);
        if (!settings?.log_channel_id) return;
        
        // Check if this type should be logged
        const logTypeField = `log_${infraction.type}s`;
        // Handle special cases
        const shouldLog = settings[logTypeField] ?? 
                         settings.log_automod ?? 
                         settings.log_filters ?? 
                         true;
        
        if (!shouldLog) return;
        
        const channel = await guild.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!channel) return;
        
        const embed = buildInfractionEmbed(infraction, user, moderator, settings);
        await channel.send({ embeds: [embed] });
        
    } catch (error) {
        logger.error('[ModLogService] Failed to log infraction:', error);
    }
}

/**
 * Build embed for infraction log
 * @param {Object} infraction - Infraction data
 * @param {Object} user - Target user
 * @param {Object} moderator - Moderator user
 * @param {Object} settings - Mod log settings
 * @returns {EmbedBuilder} Log embed
 */
function buildInfractionEmbed(infraction, user, moderator, settings) {
    const type = infraction.type.toUpperCase();
    const color = COLORS[type] || COLORS.DEFAULT;
    const emoji = EMOJIS[type] || EMOJIS.CASE;
    
    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({
            name: `${emoji} ${formatTypeName(infraction.type)} | Case #${infraction.case_id}`,
            iconURL: user.displayAvatarURL?.() || user.avatarURL?.() || undefined
        })
        .setThumbnail(user.displayAvatarURL?.() || user.avatarURL?.() || null)
        .setTimestamp();
    
    // User field
    embed.addFields({
        name: `${EMOJIS.USER} User`,
        value: `${user.tag || user.username} (<@${user.id}>)\n\`${user.id}\``,
        inline: true
    });
    
    // Moderator field (if enabled)
    if (settings.include_moderator !== false) {
        const modName = moderator.id === moderator.client?.user?.id 
            ? 'Auto-Mod' 
            : (moderator.tag || moderator.username);
        embed.addFields({
            name: `${EMOJIS.MODERATOR} Moderator`,
            value: `${modName}\n<@${moderator.id}>`,
            inline: true
        });
    }
    
    // Duration field (for mutes)
    if (infraction.duration_ms) {
        embed.addFields({
            name: `${EMOJIS.DURATION} Duration`,
            value: formatDuration(infraction.duration_ms),
            inline: true
        });
    }
    
    // Reason field (if enabled)
    if (settings.include_reason !== false) {
        embed.addFields({
            name: `${EMOJIS.REASON} Reason`,
            value: infraction.reason || 'No reason provided',
            inline: false
        });
    }
    
    // Expiry for warnings
    if (infraction.expires_at) {
        const expiryTimestamp = Math.floor(new Date(infraction.expires_at).getTime() / 1000);
        embed.addFields({
            name: `${EMOJIS.EXPIRES} Expires`,
            value: `<t:${expiryTimestamp}:R>`,
            inline: true
        });
    }
    
    // Metadata for auto-mod/filter
    if (infraction.metadata) {
        if (infraction.metadata.trigger) {
            embed.addFields({
                name: '🎯 Trigger',
                value: infraction.metadata.trigger,
                inline: true
            });
        }
        if (infraction.metadata.channel_id) {
            embed.addFields({
                name: '📍 Channel',
                value: `<#${infraction.metadata.channel_id}>`,
                inline: true
            });
        }
    }
    
    embed.setFooter({ 
        text: `User ID: ${user.id}` 
    });
    
    return embed;
}

/**
 * Format infraction type name
 * @param {string} type - Infraction type
 * @returns {string} Formatted name
 */
function formatTypeName(type) {
    const names = {
        warn: 'Warning',
        mute: 'Mute',
        unmute: 'Unmute',
        kick: 'Kick',
        ban: 'Ban',
        unban: 'Unban',
        softban: 'Softban',
        filter: 'Filter Trigger',
        automod: 'Auto-Mod Action',
        note: 'Mod Note'
    };
    return names[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Log a message delete (non-mod action)
 * @param {Object} guild - Discord guild
 * @param {Object} message - Deleted message
 * @param {Object} [executor] - Who deleted (if available from audit log)
 */
async function logMessageDelete(guild, message, executor = null) {
    try {
        const settings = await ModLogRepository.get(guild.id);
        if (!settings?.log_channel_id || !settings.log_message_deletes) return;
        
        const channel = await guild.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setAuthor({
                name: '🗑️ Message Deleted',
                iconURL: message.author?.displayAvatarURL()
            })
            .addFields(
                { name: 'Author', value: `<@${message.author?.id}>`, inline: true },
                { name: 'Channel', value: `<#${message.channelId}>`, inline: true }
            )
            .setTimestamp();
        
        if (message.content) {
            embed.addFields({
                name: 'Content',
                value: message.content.slice(0, 1024) || '*No text content*'
            });
        }
        
        if (executor) {
            embed.addFields({
                name: 'Deleted By',
                value: `<@${executor.id}>`,
                inline: true
            });
        }
        
        if (message.attachments?.size > 0) {
            embed.addFields({
                name: 'Attachments',
                value: `${message.attachments.size} file(s)`,
                inline: true
            });
        }
        
        await channel.send({ embeds: [embed] });
        
    } catch (error) {
        logger.error('[ModLogService] Failed to log message delete:', error);
    }
}

/**
 * Log a message edit
 * @param {Object} guild - Discord guild
 * @param {Object} oldMessage - Old message
 * @param {Object} newMessage - New message
 */
async function logMessageEdit(guild, oldMessage, newMessage) {
    try {
        const settings = await ModLogRepository.get(guild.id);
        if (!settings?.log_channel_id || !settings.log_message_edits) return;
        
        // Don't log bot messages or embed-only updates
        if (newMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return;
        
        const channel = await guild.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setColor(0xFFAA00)
            .setAuthor({
                name: '✏️ Message Edited',
                iconURL: newMessage.author?.displayAvatarURL()
            })
            .addFields(
                { name: 'Author', value: `<@${newMessage.author?.id}>`, inline: true },
                { name: 'Channel', value: `<#${newMessage.channelId}>`, inline: true },
                { name: 'Before', value: (oldMessage.content || '*Empty*').slice(0, 1024) },
                { name: 'After', value: (newMessage.content || '*Empty*').slice(0, 1024) }
            )
            .setTimestamp();
        
        embed.addFields({
            name: 'Jump to Message',
            value: `[Click here](${newMessage.url})`,
            inline: true
        });
        
        await channel.send({ embeds: [embed] });
        
    } catch (error) {
        logger.error('[ModLogService] Failed to log message edit:', error);
    }
}

/**
 * Log a member join
 * @param {Object} member - Guild member
 */
async function logMemberJoin(member) {
    try {
        const settings = await ModLogRepository.get(member.guild.id);
        if (!settings?.log_channel_id || !settings.log_member_joins) return;
        
        const channel = await member.guild.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!channel) return;
        
        const accountAge = Date.now() - member.user.createdTimestamp;
        const accountAgeStr = formatDuration(accountAge);
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setAuthor({
                name: '📥 Member Joined',
                iconURL: member.user.displayAvatarURL()
            })
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .addFields(
                { name: 'User', value: `${member.user.tag}\n<@${member.id}>`, inline: true },
                { name: 'Account Age', value: accountAgeStr, inline: true },
                { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
            )
            .setFooter({ text: `ID: ${member.id}` })
            .setTimestamp();
        
        // Warn if account is new
        if (accountAge < 7 * 24 * 60 * 60 * 1000) {
            embed.addFields({
                name: '⚠️ New Account',
                value: 'This account was created less than 7 days ago',
                inline: false
            });
        }
        
        await channel.send({ embeds: [embed] });
        
    } catch (error) {
        logger.error('[ModLogService] Failed to log member join:', error);
    }
}

/**
 * Log a member leave
 * @param {Object} member - Guild member
 */
async function logMemberLeave(member) {
    try {
        const settings = await ModLogRepository.get(member.guild.id);
        if (!settings?.log_channel_id || !settings.log_member_leaves) return;
        
        const channel = await member.guild.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!channel) return;
        
        const joinedAt = member.joinedTimestamp 
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` 
            : 'Unknown';
        
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setAuthor({
                name: '📤 Member Left',
                iconURL: member.user.displayAvatarURL()
            })
            .addFields(
                { name: 'User', value: `${member.user.tag}\n<@${member.id}>`, inline: true },
                { name: 'Joined', value: joinedAt, inline: true },
                { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
            )
            .setFooter({ text: `ID: ${member.id}` })
            .setTimestamp();
        
        // List roles if any
        const roles = member.roles.cache.filter(r => r.id !== member.guild.id);
        if (roles.size > 0) {
            embed.addFields({
                name: 'Roles',
                value: roles.map(r => r.name).slice(0, 10).join(', ') + (roles.size > 10 ? '...' : ''),
                inline: false
            });
        }
        
        await channel.send({ embeds: [embed] });
        
    } catch (error) {
        logger.error('[ModLogService] Failed to log member leave:', error);
    }
}

/**
 * Log a custom event
 * @param {Object} guild - Discord guild
 * @param {Object} options - Log options
 */
async function logCustom(guild, options) {
    try {
        const settings = await ModLogRepository.get(guild.id);
        if (!settings?.log_channel_id) return;
        
        const channel = await guild.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!channel) return;
        
        const { title, description, color, fields, thumbnail, footer } = options;
        
        const embed = new EmbedBuilder()
            .setColor(color || COLORS.DEFAULT)
            .setTitle(title || 'Log Event')
            .setTimestamp();
        
        if (description) embed.setDescription(description);
        if (fields) embed.addFields(fields);
        if (thumbnail) embed.setThumbnail(thumbnail);
        if (footer) embed.setFooter({ text: footer });
        
        await channel.send({ embeds: [embed] });
        
    } catch (error) {
        logger.error('[ModLogService] Failed to log custom event:', error);
    }
}

/**
 * Get or create mod log settings
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Settings
 */
async function getSettings(guildId) {
    return ModLogRepository.getOrCreate(guildId);
}

/**
 * Update mod log settings
 * @param {string} guildId - Guild ID
 * @param {Object} updates - Settings to update
 * @returns {Promise<Object>} Updated settings
 */
async function updateSettings(guildId, updates) {
    return ModLogRepository.update(guildId, updates);
}

/**
 * Set the mod log channel
 * @param {string} guildId - Guild ID
 * @param {string|null} channelId - Channel ID or null to disable
 * @returns {Promise<Object>} Updated settings
 */
async function setLogChannel(guildId, channelId) {
    return ModLogRepository.setLogChannel(guildId, channelId);
}

module.exports = {
    logInfraction,
    logMessageDelete,
    logMessageEdit,
    logMemberJoin,
    logMemberLeave,
    logCustom,
    getSettings,
    updateSettings,
    setLogChannel,
    buildInfractionEmbed
};

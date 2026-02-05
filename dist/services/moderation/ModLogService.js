"use strict";
/**
 * Mod Log Service
 * Handles sending mod logs to designated channels
 * @module services/moderation/ModLogService
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logInfraction = logInfraction;
exports.logMessageDelete = logMessageDelete;
exports.logMessageEdit = logMessageEdit;
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
exports.setLogChannel = setLogChannel;
exports.logMemberJoin = logMemberJoin;
exports.logMemberLeave = logMemberLeave;
const discord_js_1 = require("discord.js");
const time_js_1 = require("../../utils/common/time.js");
const Logger_js_1 = __importDefault(require("../../core/Logger.js"));
// Use require for CommonJS modules
const ModLogRepository = require('../../repositories/moderation/ModLogRepository.js');
const moderationConfigModule = require('../../config/features/moderation/index.js');
const moderationConfig = moderationConfigModule.default || moderationConfigModule;
// Re-export from config
const COLORS = moderationConfig.COLORS || {};
const EMOJIS = moderationConfig.EMOJIS || {};
// CORE FUNCTIONS
/**
 * Log an infraction to the mod log channel
 */
async function logInfraction(guild, infraction, user, moderator) {
    try {
        const rawSettings = await ModLogRepository.get(guild.id);
        if (!rawSettings?.log_channel_id)
            return;
        const settings = rawSettings;
        // Check if this type should be logged
        const logTypeField = `log_${infraction.type}s`;
        const shouldLog = settings[logTypeField] ??
            settings.log_automod ??
            settings.log_filters ??
            true;
        if (!shouldLog)
            return;
        const channel = await guild.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!channel || !('send' in channel))
            return;
        const embed = buildInfractionEmbed(infraction, user, moderator, settings);
        await channel.send({ embeds: [embed] });
    }
    catch (error) {
        Logger_js_1.default.error('[ModLogService]', `Failed to log infraction: ${error.message}`);
    }
}
/**
 * Build embed for infraction log
 */
function buildInfractionEmbed(infraction, user, moderator, settings) {
    const type = infraction.type.toUpperCase();
    const color = COLORS[type] || COLORS.DEFAULT;
    const emoji = EMOJIS[type] || EMOJIS.CASE;
    const userAvatar = 'displayAvatarURL' in user
        ? user.displayAvatarURL?.()
        : ('avatarURL' in user ? user.avatarURL?.() : undefined);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(color)
        .setAuthor({
        name: `${emoji} ${formatTypeName(infraction.type)} | Case #${infraction.case_id}`,
        iconURL: userAvatar || undefined
    })
        .setThumbnail(userAvatar || null)
        .setTimestamp();
    // User field
    const userTag = 'tag' in user ? user.tag : user.username;
    embed.addFields({
        name: `${EMOJIS.USER} User`,
        value: `${userTag || 'Unknown'} (<@${user.id}>)\n\`${user.id}\``,
        inline: true
    });
    // Moderator field
    if (settings.include_moderator !== false) {
        const modTag = 'tag' in moderator ? moderator.tag : moderator.username;
        embed.addFields({
            name: `${EMOJIS.MODERATOR} Moderator`,
            value: `${modTag || 'Unknown'}\n<@${moderator.id}>`,
            inline: true
        });
    }
    // Duration field
    if (infraction.duration_ms) {
        embed.addFields({
            name: `${EMOJIS.DURATION} Duration`,
            value: (0, time_js_1.formatDuration)(infraction.duration_ms),
            inline: true
        });
    }
    // Reason field
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
    // Metadata
    if (infraction.metadata) {
        if (infraction.metadata.trigger) {
            embed.addFields({
                name: '🎯 Trigger',
                value: String(infraction.metadata.trigger),
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
    embed.setFooter({ text: `User ID: ${user.id}` });
    return embed;
}
/**
 * Format infraction type name
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
 * Log a message delete
 */
async function logMessageDelete(guild, message, executor = null) {
    try {
        const rawSettings = await ModLogRepository.get(guild.id);
        if (!rawSettings?.log_channel_id)
            return;
        const settings = rawSettings;
        if (!settings.log_message_deletes)
            return;
        const channel = await guild.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!channel || !('send' in channel))
            return;
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0xFF6B6B)
            .setAuthor({
            name: '🗑️ Message Deleted',
            iconURL: message.author?.displayAvatarURL()
        })
            .addFields({ name: 'Author', value: `<@${message.author?.id}>`, inline: true }, { name: 'Channel', value: `<#${message.channelId}>`, inline: true })
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
        if (message.attachments.size > 0) {
            const attachList = [...message.attachments.values()]
                .slice(0, 5)
                .map(a => a.name || 'unknown')
                .join(', ');
            embed.addFields({
                name: `Attachments (${message.attachments.size})`,
                value: attachList
            });
        }
        embed.setFooter({ text: `Message ID: ${message.id}` });
        await channel.send({ embeds: [embed] });
    }
    catch (error) {
        Logger_js_1.default.error('[ModLogService]', `Failed to log message delete: ${error.message}`);
    }
}
/**
 * Log a message edit
 */
async function logMessageEdit(guild, oldMessage, newMessage) {
    try {
        const rawSettings = await ModLogRepository.get(guild.id);
        if (!rawSettings?.log_channel_id)
            return;
        const settings = rawSettings;
        if (!settings.log_message_edits)
            return;
        // Skip if content didn't change
        if (oldMessage.content === newMessage.content)
            return;
        const channel = await guild.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!channel || !('send' in channel))
            return;
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0xFFAA00)
            .setAuthor({
            name: '✏️ Message Edited',
            iconURL: newMessage.author?.displayAvatarURL()
        })
            .addFields({ name: 'Author', value: `<@${newMessage.author?.id}>`, inline: true }, { name: 'Channel', value: `<#${newMessage.channelId}>`, inline: true }, { name: 'Before', value: oldMessage.content?.slice(0, 1024) || '*Empty*' }, { name: 'After', value: newMessage.content?.slice(0, 1024) || '*Empty*' })
            .setFooter({ text: `Message ID: ${newMessage.id}` })
            .setTimestamp();
        await channel.send({ embeds: [embed] });
    }
    catch (error) {
        Logger_js_1.default.error('[ModLogService]', `Failed to log message edit: ${error.message}`);
    }
}
/**
 * Get mod log settings
 */
async function getSettings(guildId) {
    const result = await ModLogRepository.get(guildId);
    return result;
}
/**
 * Update mod log settings
 */
async function updateSettings(guildId, updates) {
    const result = await ModLogRepository.update(guildId, updates);
    return result;
}
/**
 * Set log channel
 */
async function setLogChannel(guildId, channelId) {
    const result = await ModLogRepository.update(guildId, { log_channel_id: channelId });
    return result;
}
/**
 * Log a member join
 */
async function logMemberJoin(member) {
    try {
        const rawSettings = await ModLogRepository.get(member.guild.id);
        if (!rawSettings?.log_channel_id)
            return;
        const settings = rawSettings;
        const channel = await member.guild.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!channel || !('send' in channel))
            return;
        const accountAge = Date.now() - member.user.createdTimestamp;
        const accountAgeDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));
        const isNewAccount = accountAgeDays < 7;
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x00FF00)
            .setAuthor({
            name: '📥 Member Joined',
            iconURL: member.user.displayAvatarURL()
        })
            .addFields({ name: 'User', value: `<@${member.id}> (${member.user.tag})`, inline: true }, { name: 'Account Age', value: `${accountAgeDays} days${isNewAccount ? ' ⚠️' : ''}`, inline: true }, { name: 'Member #', value: `${member.guild.memberCount}`, inline: true })
            .setFooter({ text: `User ID: ${member.id}` })
            .setTimestamp();
        await channel.send({ embeds: [embed] });
    }
    catch (error) {
        Logger_js_1.default.error('[ModLogService]', `Failed to log member join: ${error.message}`);
    }
}
/**
 * Log a member leave
 */
async function logMemberLeave(member) {
    try {
        const rawSettings = await ModLogRepository.get(member.guild.id);
        if (!rawSettings?.log_channel_id)
            return;
        const settings = rawSettings;
        const channel = await member.guild.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!channel || !('send' in channel))
            return;
        const joinedAt = member.joinedAt;
        const stayDuration = joinedAt ? Date.now() - joinedAt.getTime() : 0;
        const stayDurationStr = joinedAt ? (0, time_js_1.formatDuration)(stayDuration) : 'Unknown';
        const roles = member.roles.cache
            .filter(r => r.id !== member.guild.id)
            .map(r => r.name)
            .slice(0, 10)
            .join(', ') || 'None';
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0xFF0000)
            .setAuthor({
            name: '📤 Member Left',
            iconURL: member.user.displayAvatarURL()
        })
            .addFields({ name: 'User', value: `<@${member.id}> (${member.user.tag})`, inline: true }, { name: 'Stayed For', value: stayDurationStr, inline: true }, { name: 'Roles', value: roles.slice(0, 1024), inline: false })
            .setFooter({ text: `User ID: ${member.id}` })
            .setTimestamp();
        await channel.send({ embeds: [embed] });
    }
    catch (error) {
        Logger_js_1.default.error('[ModLogService]', `Failed to log member leave: ${error.message}`);
    }
}
// EXPORTS
exports.default = {
    logInfraction,
    logMessageDelete,
    logMessageEdit,
    logMemberJoin,
    logMemberLeave,
    getSettings,
    updateSettings,
    setLogChannel,
    COLORS,
    EMOJIS
};
//# sourceMappingURL=ModLogService.js.map
/**
 * Auto-Mod Handler
 * Integrates auto-mod with message events
 * @module handlers/moderation/AutoModHandler
 */

const AutoModService = require('../../services/moderation/AutoModService');
const { EmbedBuilder } = require('discord.js');
const moderationConfig = require('../../config/features/moderation');
const logger = require('../../core/Logger');

/**
 * Handle message create event
 * @param {Object} client - Discord client (unused but passed by event)
 * @param {Object} message - Discord message
 * @returns {Promise<boolean>} Whether message was handled (deleted)
 */
async function handleMessage(client, message) {
    // Skip DMs and system messages
    if (!message.guild) return false;
    if (message.system) return false;
    if (message.author.bot) return false;

    try {
        // Process through auto-mod
        const violation = await AutoModService.processMessage(message);

        if (violation) {
            // Execute action
            const result = await AutoModService.executeAction(message, violation);

            // Send notification to channel (optional)
            if (result.warned && !result.deleted) {
                await sendViolationNotice(message, violation);
            }

            // Log violation
            logger.info('AutoMod', `${violation.type} | ${message.author.tag} | ${message.guild.name}: ${violation.trigger}`);

            return result.deleted;
        }

        return false;

    } catch (error) {
        logger.error('[AutoMod] Handler error:', error.message);
        return false;
    }
}

/**
 * Send a violation notice to the channel
 * @param {Object} message - Original message
 * @param {Object} violation - Violation details
 */
async function sendViolationNotice(message, violation) {
    try {
        const embed = new EmbedBuilder()
            .setColor(moderationConfig.COLORS.AUTOMOD)
            .setDescription(`${moderationConfig.EMOJIS.AUTOMOD} <@${message.author.id}>, your message was flagged: **${violation.trigger}**`)
            .setFooter({ text: 'Auto-Mod' })
            .setTimestamp();

        const notice = await message.channel.send({ embeds: [embed] });

        // Auto-delete notice after 10 seconds
        setTimeout(() => {
            notice.delete().catch(() => {});
        }, 10000);

    } catch (error) {
        // Channel might not allow sending
    }
}

/**
 * Handle message update event (edited messages)
 * @param {Object} oldMessage - Old message
 * @param {Object} newMessage - New message
 * @returns {Promise<boolean>} Whether message was handled
 */
async function handleMessageUpdate(oldMessage, newMessage) {
    // Only check if content changed
    if (oldMessage.content === newMessage.content) return false;

    // Re-check the edited message
    return handleMessage(newMessage);
}

/**
 * Build auto-mod settings embed
 * @param {Object} settings - Auto-mod settings
 * @param {Object} guild - Discord guild
 * @returns {EmbedBuilder} Settings embed
 */
function buildSettingsEmbed(settings, guild) {
    const embed = new EmbedBuilder()
        .setColor(settings.enabled ? 0x00FF00 : 0xFF0000)
        .setTitle(`${moderationConfig.EMOJIS.AUTOMOD} Auto-Mod Settings`)
        .setDescription(settings.enabled 
            ? '✅ Auto-Mod is **enabled**' 
            : '❌ Auto-Mod is **disabled**')
        .setTimestamp();

    // Features status
    const features = [
        ['Spam Detection', settings.spam_enabled, `${settings.spam_threshold} msgs/${settings.spam_window_ms/1000}s`],
        ['Duplicate Messages', settings.duplicate_enabled, `${settings.duplicate_threshold} duplicates`],
        ['Link Filter', settings.links_enabled, settings.links_action],
        ['Invite Filter', settings.invites_enabled, settings.invites_action],
        ['Mention Spam', settings.mention_enabled, `Max ${settings.mention_limit} mentions`],
        ['Caps Lock', settings.caps_enabled, `${settings.caps_percent}% threshold`]
    ];

    let featuresText = '';
    for (const [name, enabled, detail] of features) {
        const status = enabled ? '✅' : '❌';
        featuresText += `${status} **${name}**${enabled ? ` - ${detail}` : ''}\n`;
    }

    embed.addFields({ name: '🔧 Features', value: featuresText, inline: false });

    // Ignored channels
    if (settings.ignored_channels?.length > 0) {
        const channels = settings.ignored_channels.slice(0, 5).map(id => `<#${id}>`).join(', ');
        const more = settings.ignored_channels.length > 5 ? ` +${settings.ignored_channels.length - 5} more` : '';
        embed.addFields({ name: '📍 Ignored Channels', value: channels + more, inline: true });
    }

    // Ignored roles
    if (settings.ignored_roles?.length > 0) {
        const roles = settings.ignored_roles.slice(0, 5).map(id => `<@&${id}>`).join(', ');
        const more = settings.ignored_roles.length > 5 ? ` +${settings.ignored_roles.length - 5} more` : '';
        embed.addFields({ name: '👥 Ignored Roles', value: roles + more, inline: true });
    }

    // Log channel
    if (settings.log_channel_id) {
        embed.addFields({ name: '📝 Log Channel', value: `<#${settings.log_channel_id}>`, inline: true });
    }

    return embed;
}

/**
 * Format action type for display
 * @param {string} action - Action type
 * @returns {string} Formatted action
 */
function formatAction(action) {
    const actions = {
        'delete': '🗑️ Delete',
        'delete_warn': '🗑️⚠️ Delete + Warn',
        'warn': '⚠️ Warn',
        'mute': '🔇 Mute',
        'kick': '👢 Kick',
        'ban': '🔨 Ban'
    };
    return actions[action] || action;
}

module.exports = {
    handleMessage,
    handleMessageUpdate,
    buildSettingsEmbed,
    formatAction
};

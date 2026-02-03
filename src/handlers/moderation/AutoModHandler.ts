/**
 * Auto-Mod Handler
 * Integrates auto-mod with message events
 * @module handlers/moderation/AutoModHandler
 */

import { EmbedBuilder, Message, Guild, GuildTextBasedChannel } from 'discord.js';
import { logger } from '../../core/Logger.js';

const getDefault = <T>(mod: { default?: T } | T): T => (mod as { default?: T }).default || mod as T;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AutoModService = getDefault(require('../../services/moderation/AutoModService'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const moderationConfig = getDefault(require('../../config/features/moderation'));
/**
 * Violation types
 */
export type ViolationType = 
    | 'spam' 
    | 'duplicate' 
    | 'links' 
    | 'invites' 
    | 'mentions' 
    | 'caps' 
    | 'banned_words';

/**
 * Action types for auto-mod
 */
export type ActionType = 'delete' | 'delete_warn' | 'warn' | 'mute' | 'kick' | 'ban';

/**
 * Violation result from auto-mod processing
 */
export interface Violation {
    type: ViolationType;
    trigger: string;
    severity?: number;
    action?: ActionType;
}

/**
 * Action execution result
 */
export interface ActionResult {
    deleted: boolean;
    warned: boolean;
    muted?: boolean;
    kicked?: boolean;
    banned?: boolean;
    escalated?: boolean;
    warnCount?: number;
    warnThreshold?: number;
    muteDuration?: number;
}

/**
 * Auto-mod settings structure
 */
export interface AutoModSettings {
    enabled: boolean;
    spam_enabled?: boolean;
    spam_threshold?: number;
    spam_window_ms?: number;
    duplicate_enabled?: boolean;
    duplicate_threshold?: number;
    links_enabled?: boolean;
    links_action?: ActionType;
    invites_enabled?: boolean;
    invites_action?: ActionType;
    mention_enabled?: boolean;
    mention_limit?: number;
    caps_enabled?: boolean;
    caps_percent?: number;
    ignored_channels?: string[];
    ignored_roles?: string[];
    log_channel_id?: string;
}

/**
 * Feature configuration tuple
 */
type FeatureConfig = [string, boolean | undefined, string];
/**
 * Action type display mapping
 */
const ACTION_DISPLAYS: Record<ActionType, string> = {
    'delete': '🗑️ Delete',
    'delete_warn': '🗑️⚠️ Delete + Warn',
    'warn': '⚠️ Warn',
    'mute': '🔇 Mute',
    'kick': '👢 Kick',
    'ban': '🔨 Ban'
};
/**
 * Handle message create event
 * @param client - Discord client (unused but passed by event)
 * @param message - Discord message
 * @returns Whether message was handled (deleted)
 */
export async function handleMessage(client: unknown, message: Message): Promise<boolean> {
    // Skip DMs and system messages
    if (!message.guild) return false;
    if (message.system) return false;
    if (message.author.bot) return false;

    try {
        // Process through auto-mod
        const violation: Violation | null = await AutoModService.processMessage(message);

        if (violation) {
            // Execute action
            const result: ActionResult = await AutoModService.executeAction(message, violation);

            // Send soft warn notification for warn actions (including delete_warn)
            if (result.warned) {
                await sendViolationNotice(message, violation, result);
            }

            // Log violation
            logger.info('AutoMod', `${violation.type} | ${message.author.tag} | ${message.guild.name}: ${violation.trigger}`);

            return result.deleted;
        }

        return false;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[AutoMod] Handler error:', errorMessage);
        return false;
    }
}

/**
 * Send a violation notice to the channel (plain text, not embed)
 * @param message - Original message
 * @param violation - Violation details
 * @param result - Action result with warn info
 */
async function sendViolationNotice(message: Message, violation: Violation, result: ActionResult): Promise<void> {
    try {
        const channel = message.channel as GuildTextBasedChannel;
        
        let noticeText: string;
        
        if (result.escalated && result.muted) {
            // User was muted due to reaching threshold
            noticeText = `⚠️ <@${message.author.id}>, you have been **muted for ${result.muteDuration || 15} minutes** for repeated violations.`;
        } else if (result.warned && result.warnCount && result.warnThreshold) {
            // Regular warn with count
            const remaining = result.warnThreshold - result.warnCount;
            if (remaining > 0) {
                noticeText = `⚠️ <@${message.author.id}>, you violated the rules: **${violation.trigger}**. **${remaining}** more violation${remaining > 1 ? 's' : ''} and you will be muted for **${result.muteDuration || 15} minutes**.`;
            } else {
                noticeText = `⚠️ <@${message.author.id}>, you violated the rules: **${violation.trigger}**.`;
            }
        } else {
            // Fallback
            noticeText = `⚠️ <@${message.author.id}>, you violated the rules: **${violation.trigger}**. Please follow server rules.`;
        }

        const notice = await channel.send(noticeText);

        // Auto-delete notice after 15 seconds
        setTimeout(() => {
            notice.delete().catch(() => {});
        }, 15000);

    } catch {
        // Channel might not allow sending
    }
}

/**
 * Handle message update event (edited messages)
 * @param oldMessage - Old message
 * @param newMessage - New message
 * @returns Whether message was handled
 */
export async function handleMessageUpdate(
    oldMessage: Message, 
    newMessage: Message
): Promise<boolean> {
    // Only check if content changed
    if (oldMessage.content === newMessage.content) return false;

    // Re-check the edited message
    return handleMessage(null, newMessage);
}

/**
 * Build auto-mod settings embed
 * @param settings - Auto-mod settings
 * @param guild - Discord guild
 * @returns Settings embed
 */
export function buildSettingsEmbed(settings: AutoModSettings, guild: Guild): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(settings.enabled ? 0x00FF00 : 0xFF0000)
        .setTitle(`${moderationConfig.EMOJIS?.AUTOMOD || '🤖'} Auto-Mod Settings`)
        .setDescription(settings.enabled 
            ? '✅ Auto-Mod is **enabled**' 
            : '❌ Auto-Mod is **disabled**')
        .setTimestamp();

    // Features status
    const features: FeatureConfig[] = [
        ['Spam Detection', settings.spam_enabled, `${settings.spam_threshold} msgs/${(settings.spam_window_ms || 5000)/1000}s`],
        ['Duplicate Messages', settings.duplicate_enabled, `${settings.duplicate_threshold} duplicates`],
        ['Link Filter', settings.links_enabled, settings.links_action || 'delete'],
        ['Invite Filter', settings.invites_enabled, settings.invites_action || 'delete'],
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
    if (settings.ignored_channels && settings.ignored_channels.length > 0) {
        const channels = settings.ignored_channels.slice(0, 5).map(id => `<#${id}>`).join(', ');
        const more = settings.ignored_channels.length > 5 ? ` +${settings.ignored_channels.length - 5} more` : '';
        embed.addFields({ name: '📍 Ignored Channels', value: channels + more, inline: true });
    }

    // Ignored roles
    if (settings.ignored_roles && settings.ignored_roles.length > 0) {
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
 * @param action - Action type
 * @returns Formatted action string
 */
export function formatAction(action: ActionType | string): string {
    return ACTION_DISPLAYS[action as ActionType] || action;
}

// Default export for backward compatibility
export default {
    handleMessage,
    handleMessageUpdate,
    buildSettingsEmbed,
    formatAction
};

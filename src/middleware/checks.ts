/**
 * Access Checks Middleware
 * Access control, maintenance check, NSFW check
 * @module middleware/checks
 */

import { EmbedBuilder } from 'discord.js';
import type { 
    GuildMember,
    TextChannel,
    ChatInputCommandInteraction,
    ButtonInteraction
} from 'discord.js';
import { isServerAdmin } from './permissions.js';
import { createErrorEmbed, createWarningEmbed } from './embeds';
import { isBlockedHost } from './urlValidator.js';

// Types
export interface ValidationResult {
    valid: boolean;
    error?: string;
}

export interface AccessCheckResult {
    blocked: boolean;
    embed?: EmbedBuilder;
}

export interface MaintenanceCheckResult {
    inMaintenance: boolean;
    embed?: EmbedBuilder;
}

export type AnyInteraction = ChatInputCommandInteraction | ButtonInteraction;

// Access Types
export const AccessType = {
    PUBLIC: 'public',
    SUB: 'sub',
    MAIN: 'main',
    BOTH: 'both',
    ADMIN: 'admin',
    OWNER: 'owner',
    DJ: 'dj',
    NSFW: 'nsfw',
} as const;

export type AccessTypeValue = typeof AccessType[keyof typeof AccessType];

/**
 * Check if channel is NSFW
 */
export function checkNSFW(channel: TextChannel | null): ValidationResult {
    if (!channel?.nsfw) {
        return { 
            valid: false, 
            error: 'This command can only be used in NSFW channels.' 
        };
    }
    return { valid: true };
}

/**
 * Check access for a command
 */
export async function checkAccess(interaction: AnyInteraction, accessType: AccessTypeValue): Promise<AccessCheckResult> {
    const member = interaction.member as GuildMember;
    
    if (accessType === AccessType.PUBLIC || accessType === AccessType.SUB || accessType === AccessType.BOTH) {
        return { blocked: false };
    }
    
    if (accessType === AccessType.MAIN) {
        return { blocked: false };
    }
    
    if (accessType === AccessType.ADMIN) {
        if (!isServerAdmin(member)) {
            return {
                blocked: true,
                embed: createErrorEmbed('Permission Denied', 'You need administrator permissions to use this command.')
            };
        }
        return { blocked: false };
    }
    
    if (accessType === AccessType.OWNER) {
        const ownerId = process.env.OWNER_ID;
        if (interaction.user.id !== ownerId) {
            return {
                blocked: true,
                embed: createErrorEmbed('Owner Only', 'This command is restricted to the bot owner.')
            };
        }
        return { blocked: false };
    }
    
    if (accessType === AccessType.DJ) {
        if (!isServerAdmin(member)) {
            const djRole = member.roles.cache.find(r => r.name.toLowerCase() === 'dj');
            if (!djRole) {
                return {
                    blocked: true,
                    embed: createErrorEmbed('DJ Only', 'You need the DJ role or admin permissions.')
                };
            }
        }
        return { blocked: false };
    }
    
    if (accessType === AccessType.NSFW) {
        const channel = interaction.channel as TextChannel;
        if (!channel?.nsfw) {
            return {
                blocked: true,
                embed: createErrorEmbed('NSFW Only', 'This command can only be used in NSFW channels.')
            };
        }
        return { blocked: false };
    }
    
    return { blocked: false };
}

/**
 * Check if bot is in maintenance mode
 */
export function checkMaintenance(): MaintenanceCheckResult {
    const inMaintenance = process.env.MAINTENANCE_MODE === 'true';
    if (inMaintenance) {
        return {
            inMaintenance: true,
            embed: createWarningEmbed('Maintenance Mode', 'The bot is currently undergoing maintenance. Please try again later.')
        };
    }
    return { inMaintenance: false };
}

/**
 * Validate URL for video downloads
 */
export function validateVideoUrl(url: string): ValidationResult {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { valid: false, error: 'URL must start with http:// or https://' };
    }

    try {
        const parsedUrl = new URL(url);

        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return { valid: false, error: 'Only HTTP/HTTPS URLs are supported.' };
        }

        if (isBlockedHost(parsedUrl.hostname)) {
            return { valid: false, error: 'This URL is not allowed for security reasons.' };
        }
        
        if (parsedUrl.username || parsedUrl.password) {
            return { valid: false, error: 'URLs with credentials are not allowed.' };
        }

    } catch (error) {
        return { valid: false, error: 'Invalid URL format.' };
    }

    return { valid: true };
}

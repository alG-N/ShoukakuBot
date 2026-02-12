/**
 * Permission Checks Middleware
 * Role hierarchy and permission validation
 * @module middleware/permissions
 */

import { PermissionFlagsBits } from 'discord.js';
import type { GuildMember } from 'discord.js';

// Types
export interface ModerateResult {
    allowed: boolean;
    reason?: string;
}

/**
 * Check if user has required permissions
 */
export function hasPermissions(member: GuildMember | null, permissions: bigint[]): boolean {
    if (!member || !permissions || permissions.length === 0) return true;
    return permissions.every(perm => member.permissions.has(perm));
}

/**
 * Check if user is server admin
 */
export function isServerAdmin(member: GuildMember | null): boolean {
    if (!member) return false;
    return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Check if user is server owner
 */
export function isServerOwner(member: GuildMember | null): boolean {
    if (!member) return false;
    return member.id === member.guild.ownerId;
}

/**
 * Check if user can moderate target (role hierarchy check)
 */
export function canModerate(moderator: GuildMember, target: GuildMember): ModerateResult {
    if (target.id === target.guild.ownerId) {
        return { allowed: false, reason: 'Cannot moderate the server owner.' };
    }
    if (moderator.id === target.id) {
        return { allowed: false, reason: 'You cannot moderate yourself.' };
    }
    if (moderator.roles.highest.position <= target.roles.highest.position) {
        return { allowed: false, reason: 'Your role is not higher than the target\'s role.' };
    }
    return { allowed: true };
}

/**
 * Check if bot can moderate target (role hierarchy check)
 */
export function botCanModerate(botMember: GuildMember, target: GuildMember): ModerateResult {
    if (target.id === target.guild.ownerId) {
        return { allowed: false, reason: 'I cannot moderate the server owner.' };
    }
    if (botMember.roles.highest.position <= target.roles.highest.position) {
        return { allowed: false, reason: 'My role is not higher than the target\'s role.' };
    }
    return { allowed: true };
}

/**
 * Convenience validators object
 */
export const validators = {
    hasPermissions,
    isServerAdmin,
    isServerOwner,
    canModerate,
    botCanModerate
};

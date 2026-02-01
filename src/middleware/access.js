/**
 * Access Middleware
 * Centralized access control, rate limiting, and validation
 * @module middleware/access
 */

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { COLORS, EMOJIS } = require('../constants');

// ============================================================================
// ACCESS TYPES
// ============================================================================

/**
 * Access types for commands
 */
const AccessType = {
    PUBLIC: 'public',      // Anyone can use
    SUB: 'sub',           // Sub-bot (same as public for now)
    MAIN: 'main',         // Main bot only
    BOTH: 'both',         // Both bots
    ADMIN: 'admin',       // Server admins only
    OWNER: 'owner',       // Bot owners only
    DJ: 'dj',             // DJ role or admin
    NSFW: 'nsfw',         // NSFW channels only
};

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Generic rate limiter for any feature
 * @class
 */
class RateLimiter {
    constructor(options = {}) {
        this.cooldowns = new Map();
        this.active = new Set();
        this.cooldownMs = (options.cooldownSeconds || 30) * 1000;
        this.maxConcurrent = options.maxConcurrent || 5;
        
        // Auto cleanup interval
        if (options.autoCleanup !== false) {
            this._cleanupInterval = setInterval(() => this._cleanup(), 60000);
        }
    }

    /**
     * Check if user is on cooldown
     * @param {string} userId - User ID
     * @returns {number} Remaining seconds, 0 if not on cooldown
     */
    checkCooldown(userId) {
        const expiry = this.cooldowns.get(userId);
        if (expiry && Date.now() < expiry) {
            return Math.ceil((expiry - Date.now()) / 1000);
        }
        return 0;
    }

    /**
     * Set cooldown for user
     * @param {string} userId - User ID
     * @param {number} [customMs] - Custom cooldown in ms
     */
    setCooldown(userId, customMs) {
        this.cooldowns.set(userId, Date.now() + (customMs || this.cooldownMs));
    }

    /**
     * Clear cooldown for user
     * @param {string} userId - User ID
     */
    clearCooldown(userId) {
        this.cooldowns.delete(userId);
    }

    /**
     * Check if concurrent limit reached
     * @returns {boolean} True if at limit
     */
    isAtLimit() {
        return this.active.size >= this.maxConcurrent;
    }

    /**
     * Add user to active set
     * @param {string} userId - User ID
     */
    addActive(userId) {
        this.active.add(userId);
    }

    /**
     * Remove user from active set
     * @param {string} userId - User ID
     */
    removeActive(userId) {
        this.active.delete(userId);
    }

    /**
     * Cleanup expired cooldowns
     * @private
     */
    _cleanup() {
        const now = Date.now();
        for (const [userId, expiry] of this.cooldowns.entries()) {
            if (now > expiry) {
                this.cooldowns.delete(userId);
            }
        }
    }

    /**
     * Destroy rate limiter
     */
    destroy() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
        this.cooldowns.clear();
        this.active.clear();
    }
}

// ============================================================================
// PERMISSION CHECKS
// ============================================================================

/**
 * Check if user has required permissions
 * @param {GuildMember} member - Guild member
 * @param {Array<bigint>} permissions - Required permissions
 * @returns {boolean} Whether user has permissions
 */
function hasPermissions(member, permissions) {
    if (!member || !permissions || permissions.length === 0) return true;
    return permissions.every(perm => member.permissions.has(perm));
}

/**
 * Check if user is server admin
 * @param {GuildMember} member - Guild member
 * @returns {boolean} Whether user is admin
 */
function isServerAdmin(member) {
    if (!member) return false;
    return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Check if user is server owner
 * @param {GuildMember} member - Guild member
 * @returns {boolean} Whether user is server owner
 */
function isServerOwner(member) {
    if (!member) return false;
    return member.id === member.guild.ownerId;
}

/**
 * Check if user can moderate target (role hierarchy)
 * @param {GuildMember} moderator - Moderator member
 * @param {GuildMember} target - Target member
 * @returns {Object} Result with allowed status and reason
 */
function canModerate(moderator, target) {
    // Can't moderate server owner
    if (target.id === target.guild.ownerId) {
        return { allowed: false, reason: 'Cannot moderate the server owner.' };
    }

    // Can't moderate self
    if (moderator.id === target.id) {
        return { allowed: false, reason: 'You cannot moderate yourself.' };
    }

    // Check role hierarchy
    if (moderator.roles.highest.position <= target.roles.highest.position) {
        return { allowed: false, reason: 'Your role is not higher than the target\'s role.' };
    }

    return { allowed: true };
}

/**
 * Check if bot can moderate target
 * @param {GuildMember} botMember - Bot member
 * @param {GuildMember} target - Target member
 * @returns {Object} Result with allowed status and reason
 */
function botCanModerate(botMember, target) {
    // Can't moderate server owner
    if (target.id === target.guild.ownerId) {
        return { allowed: false, reason: 'I cannot moderate the server owner.' };
    }

    // Check role hierarchy
    if (botMember.roles.highest.position <= target.roles.highest.position) {
        return { allowed: false, reason: 'My role is not higher than the target\'s role.' };
    }

    return { allowed: true };
}

// ============================================================================
// VOICE CHANNEL CHECKS (for Music module)
// ============================================================================

/**
 * Check if user is in voice channel
 * @param {GuildMember} member - Guild member
 * @returns {Object} { valid: boolean, channel?: VoiceChannel, error?: string }
 */
function checkVoiceChannel(member) {
    const voiceChannel = member?.voice?.channel;
    
    if (!voiceChannel) {
        return { valid: false, error: 'Join a voice channel first.' };
    }
    
    return { valid: true, channel: voiceChannel };
}

/**
 * Check if user is in same voice channel as bot
 * @param {GuildMember} member - Guild member
 * @param {string} botChannelId - Bot's current voice channel ID
 * @returns {Object} { valid: boolean, error?: string }
 */
function checkSameVoiceChannel(member, botChannelId) {
    if (!botChannelId) {
        return { valid: true };
    }

    const memberChannelId = member?.voice?.channel?.id;
    if (memberChannelId !== botChannelId) {
        return { 
            valid: false, 
            error: 'You must be in the same voice channel as the bot.' 
        };
    }

    return { valid: true };
}

/**
 * Check voice permissions
 * @param {VoiceChannel} voiceChannel - Voice channel
 * @returns {Object} { valid: boolean, error?: string }
 */
function checkVoicePermissions(voiceChannel) {
    if (!voiceChannel) {
        return { valid: false, error: 'Invalid voice channel.' };
    }

    const permissions = voiceChannel.permissionsFor(voiceChannel.guild.members.me);
    
    if (!permissions?.has(PermissionFlagsBits.Connect)) {
        return { valid: false, error: 'I don\'t have permission to connect to this channel.' };
    }

    if (!permissions?.has(PermissionFlagsBits.Speak)) {
        return { valid: false, error: 'I don\'t have permission to speak in this channel.' };
    }

    return { valid: true };
}

// ============================================================================
// URL VALIDATION (for Video module)
// ============================================================================

/**
 * Validate URL for video downloads
 * @param {string} url - URL to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateVideoUrl(url) {
    // Basic protocol check
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { valid: false, error: 'URL must start with http:// or https://' };
    }

    // Try to parse URL
    try {
        const parsedUrl = new URL(url);

        // Block internal URLs
        const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '192.168.', '10.', '172.'];
        if (blockedHosts.some(host => parsedUrl.hostname.includes(host))) {
            return { valid: false, error: 'Internal URLs are not allowed.' };
        }

        // Block non-http protocols
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return { valid: false, error: 'Only HTTP/HTTPS URLs are supported.' };
        }

    } catch (error) {
        return { valid: false, error: 'Invalid URL format.' };
    }

    return { valid: true };
}

// ============================================================================
// NSFW CHECK
// ============================================================================

/**
 * Check if channel is NSFW
 * @param {TextChannel} channel - Text channel
 * @returns {Object} { valid: boolean, error?: string }
 */
function checkNSFW(channel) {
    if (!channel?.nsfw) {
        return { 
            valid: false, 
            error: 'This command can only be used in NSFW channels.' 
        };
    }
    return { valid: true };
}

// ============================================================================
// EMBED HELPERS
// ============================================================================

/**
 * Create error embed
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @returns {EmbedBuilder} Error embed
 */
function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`${EMOJIS?.ERROR || '❌'} ${title}`)
        .setDescription(description);
}

/**
 * Create warning embed
 * @param {string} title - Warning title
 * @param {string} description - Warning description
 * @returns {EmbedBuilder} Warning embed
 */
function createWarningEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${EMOJIS?.WARNING || '⚠️'} ${title}`)
        .setDescription(description);
}

/**
 * Create success embed
 * @param {string} title - Success title
 * @param {string} description - Success description
 * @returns {EmbedBuilder} Success embed
 */
function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`${EMOJIS?.SUCCESS || '✅'} ${title}`)
        .setDescription(description);
}

/**
 * Create info embed
 * @param {string} title - Info title
 * @param {string} description - Info description
 * @returns {EmbedBuilder} Info embed
 */
function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(COLORS.INFO || COLORS.PRIMARY)
        .setTitle(`${EMOJIS?.INFO || 'ℹ️'} ${title}`)
        .setDescription(description);
}

/**
 * Create cooldown embed
 * @param {number} remainingSeconds - Remaining cooldown seconds
 * @returns {EmbedBuilder} Cooldown embed
 */
function createCooldownEmbed(remainingSeconds) {
    return new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle('⏳ Cooldown Active')
        .setDescription(`Please wait **${remainingSeconds} seconds** before using this command again.`)
        .setFooter({ text: 'This helps prevent server overload' });
}

/**
 * Check access for a command
 * @param {Object} interaction - Discord interaction
 * @param {string} accessType - Type of access required
 * @returns {Promise<{blocked: boolean, embed?: EmbedBuilder}>}
 */
async function checkAccess(interaction, accessType) {
    // PUBLIC and SUB are always allowed
    if (accessType === AccessType.PUBLIC || accessType === AccessType.SUB || accessType === AccessType.BOTH) {
        return { blocked: false };
    }
    
    // MAIN bot only
    if (accessType === AccessType.MAIN) {
        // For now, allow all (can add bot ID check later)
        return { blocked: false };
    }
    
    // ADMIN check
    if (accessType === AccessType.ADMIN) {
        if (!isServerAdmin(interaction.member)) {
            return {
                blocked: true,
                embed: createErrorEmbed('Permission Denied', 'You need administrator permissions to use this command.')
            };
        }
        return { blocked: false };
    }
    
    // OWNER check
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
    
    // DJ check
    if (accessType === AccessType.DJ) {
        if (!isServerAdmin(interaction.member)) {
            // Check for DJ role
            const djRole = interaction.member.roles.cache.find(r => r.name.toLowerCase() === 'dj');
            if (!djRole) {
                return {
                    blocked: true,
                    embed: createErrorEmbed('DJ Only', 'You need the DJ role or admin permissions.')
                };
            }
        }
        return { blocked: false };
    }
    
    // NSFW check
    if (accessType === AccessType.NSFW) {
        if (!interaction.channel?.nsfw) {
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
 * @returns {{inMaintenance: boolean, embed?: EmbedBuilder}}
 */
function checkMaintenance() {
    // Can check env or config for maintenance mode
    const inMaintenance = process.env.MAINTENANCE_MODE === 'true';
    if (inMaintenance) {
        return {
            inMaintenance: true,
            embed: createWarningEmbed('Maintenance Mode', 'The bot is currently undergoing maintenance. Please try again later.')
        };
    }
    return { inMaintenance: false };
}

module.exports = {
    // Types
    AccessType,
    
    // Rate Limiting
    RateLimiter,
    
    // Permission Checks
    hasPermissions,
    isServerAdmin,
    isServerOwner,
    canModerate,
    botCanModerate,
    
    // Voice Checks
    checkVoiceChannel,
    checkSameVoiceChannel,
    checkVoicePermissions,
    
    // URL Validation
    validateVideoUrl,
    
    // NSFW
    checkNSFW,
    
    // Access Control
    checkAccess,
    checkMaintenance,
    
    // Embed Helpers
    createErrorEmbed,
    createWarningEmbed,
    createSuccessEmbed,
    createInfoEmbed,
    createCooldownEmbed
};

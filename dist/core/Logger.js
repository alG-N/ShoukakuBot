"use strict";
/**
 * alterGolden Logging System
 * Handles both console and Discord channel logging
 * Supports JSON structured logging for production
 * Optimized for high-volume logging at scale
 * @module core/Logger
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = exports.LOG_LEVELS = exports.LOG_CHANNEL_ID = void 0;
const discord_js_1 = require("discord.js");
// CONFIGURATION
/**
 * Log channel ID for Discord logging
 */
exports.LOG_CHANNEL_ID = process.env.SYSTEM_LOG_CHANNEL_ID || '1195762287729537045';
/**
 * Log format: 'json' for production, 'text' for development
 */
const LOG_FORMAT = process.env.LOG_FORMAT || 'text';
/**
 * Log levels with colors and configuration
 */
exports.LOG_LEVELS = {
    DEBUG: { emoji: '🔍', color: 0x7289DA, console: 'log', priority: 0, name: 'debug' },
    INFO: { emoji: 'ℹ️', color: 0x3498DB, console: 'info', priority: 1, name: 'info' },
    SUCCESS: { emoji: '✅', color: 0x2ECC71, console: 'log', priority: 2, name: 'info' },
    WARN: { emoji: '⚠️', color: 0xF1C40F, console: 'warn', priority: 3, name: 'warn' },
    ERROR: { emoji: '❌', color: 0xE74C3C, console: 'error', priority: 4, name: 'error' },
    CRITICAL: { emoji: '🚨', color: 0x992D22, console: 'error', priority: 5, name: 'fatal' }
};
/**
 * Minimum log level (can be set via env)
 */
const MIN_LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
// LOGGER CLASS
/**
 * Logger class for handling console and Discord logging
 */
class Logger {
    client = null;
    logChannel = null;
    minPriority;
    format;
    serviceName;
    environment;
    // Rate limiting for Discord logs
    discordLogQueue = [];
    isProcessingQueue = false;
    lastDiscordLog = 0;
    discordLogCooldown = 1000; // 1 second between logs
    constructor() {
        this.minPriority = exports.LOG_LEVELS[MIN_LOG_LEVEL]?.priority ?? 1;
        this.format = LOG_FORMAT;
        this.serviceName = process.env.SERVICE_NAME || 'alterGolden';
        this.environment = process.env.NODE_ENV || 'development';
    }
    /**
     * Initialize logger with Discord client
     */
    initialize(client) {
        this.client = client;
        this._fetchLogChannel();
    }
    /**
     * Set log format dynamically
     */
    setFormat(format) {
        this.format = format;
    }
    /**
     * Fetch log channel (with retry)
     */
    async _fetchLogChannel() {
        if (!this.client)
            return;
        try {
            const channel = await this.client.channels.fetch(exports.LOG_CHANNEL_ID);
            if (channel?.isTextBased()) {
                this.logChannel = channel;
            }
        }
        catch (error) {
            console.warn('[Logger] Could not fetch log channel:', error.message);
        }
    }
    /**
     * Check if log level should be logged
     */
    _shouldLog(level) {
        const levelConfig = exports.LOG_LEVELS[level];
        return levelConfig && levelConfig.priority >= this.minPriority;
    }
    /**
     * Format log entry as JSON for structured logging
     */
    _formatJson(level, category, message, metadata = {}) {
        const logLevel = exports.LOG_LEVELS[level] || exports.LOG_LEVELS.INFO;
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: logLevel.name,
            severity: level,
            service: this.serviceName,
            environment: this.environment,
            category: category,
            message: message,
            ...metadata
        };
        // Add shard info if available
        if (this.client?.shard) {
            logEntry.shardId = this.client.shard.ids[0];
        }
        return JSON.stringify(logEntry);
    }
    /**
     * Format log entry as text for human readable output
     */
    _formatText(level, category, message) {
        const logLevel = exports.LOG_LEVELS[level] || exports.LOG_LEVELS.INFO;
        const timestamp = new Date().toISOString();
        return `[${timestamp}] ${logLevel.emoji} [${category}] ${message}`;
    }
    /**
     * Log to console with formatted output
     */
    console(level, category, message, metadata = {}) {
        if (!this._shouldLog(level))
            return;
        const logLevel = exports.LOG_LEVELS[level] || exports.LOG_LEVELS.INFO;
        let formattedMessage;
        if (this.format === 'json') {
            formattedMessage = this._formatJson(level, category, message, metadata);
        }
        else {
            formattedMessage = this._formatText(level, category, message);
        }
        console[logLevel.console](formattedMessage);
    }
    /**
     * Log with additional metadata (for structured logging)
     */
    log(level, category, message, metadata = {}) {
        this.console(level, category, message, metadata);
    }
    /**
     * Log to Discord channel (rate-limited)
     */
    async discord(level, title, description, fields = null) {
        // Queue the log
        this.discordLogQueue.push({ level, title, description, fields });
        // Process queue if not already processing
        if (!this.isProcessingQueue) {
            this._processDiscordQueue();
        }
    }
    /**
     * Process Discord log queue with rate limiting
     */
    async _processDiscordQueue() {
        if (this.isProcessingQueue || this.discordLogQueue.length === 0)
            return;
        this.isProcessingQueue = true;
        while (this.discordLogQueue.length > 0) {
            // Rate limit
            const timeSinceLastLog = Date.now() - this.lastDiscordLog;
            if (timeSinceLastLog < this.discordLogCooldown) {
                await new Promise(r => setTimeout(r, this.discordLogCooldown - timeSinceLastLog));
            }
            const log = this.discordLogQueue.shift();
            if (log) {
                await this._sendDiscordLog(log);
            }
            this.lastDiscordLog = Date.now();
        }
        this.isProcessingQueue = false;
    }
    /**
     * Send a single Discord log
     */
    async _sendDiscordLog({ level, title, description, fields }) {
        if (!this.logChannel) {
            await this._fetchLogChannel();
            if (!this.logChannel)
                return;
        }
        const logLevel = exports.LOG_LEVELS[level] || exports.LOG_LEVELS.INFO;
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${logLevel.emoji} ${title}`)
            .setDescription(description?.slice(0, 4000) || 'No description')
            .setColor(logLevel.color)
            .setTimestamp();
        if (fields) {
            const fieldEntries = Object.entries(fields).slice(0, 25); // Max 25 fields
            fieldEntries.forEach(([name, value]) => {
                embed.addFields({
                    name: name.slice(0, 256),
                    value: String(value).slice(0, 1024),
                    inline: true
                });
            });
        }
        try {
            await this.logChannel.send({ embeds: [embed] });
        }
        catch (error) {
            console.error('[Logger] Failed to send Discord log:', error.message);
            this.logChannel = null; // Reset and refetch next time
        }
    }
    // CONVENIENCE METHODS
    debug(category, message, meta) {
        this.console('DEBUG', category, message, meta);
    }
    info(category, message, meta) {
        this.console('INFO', category, message, meta);
    }
    success(category, message, meta) {
        this.console('SUCCESS', category, message, meta);
    }
    warn(category, message, meta) {
        this.console('WARN', category, message, meta);
    }
    error(category, message, meta) {
        this.console('ERROR', category, message, meta);
    }
    critical(category, message, meta) {
        this.console('CRITICAL', category, message, meta);
    }
    // Structured logging convenience methods with metadata
    debugWithMeta(category, message, meta) {
        this.console('DEBUG', category, message, meta);
    }
    infoWithMeta(category, message, meta) {
        this.console('INFO', category, message, meta);
    }
    errorWithMeta(category, message, meta) {
        this.console('ERROR', category, message, meta);
    }
    /**
     * Log a request/response for API tracking
     */
    logRequest(options) {
        const { method, url, statusCode, duration, userId, guildId, error } = options;
        this.console(error ? 'ERROR' : 'INFO', 'HTTP', `${method} ${url} ${statusCode} ${duration}ms`, {
            method,
            url,
            statusCode,
            duration,
            userId,
            guildId,
            error: error?.message
        });
    }
    /**
     * Log a command execution
     */
    logCommand(options) {
        const { command, userId, guildId, duration, success, error } = options;
        this.console(success ? 'INFO' : 'ERROR', 'Command', `${command} ${success ? 'success' : 'failed'} (${duration}ms)`, {
            command,
            userId,
            guildId,
            duration,
            success: String(success),
            error: error?.message
        });
    }
    // DISCORD LOGGING CONVENIENCE METHODS
    async logSystemEvent(title, description) {
        await this.discord('INFO', title, description);
    }
    async logError(title, error, context = {}) {
        const description = error instanceof Error
            ? `\`\`\`${(error.stack || error.message).slice(0, 3900)}\`\`\``
            : `\`\`\`${String(error).slice(0, 3900)}\`\`\``;
        await this.discord('ERROR', title, description, context);
    }
    /**
     * Log detailed error with embed format (like Sentry-style)
     */
    async logErrorDetailed(options) {
        if (!this.logChannel) {
            await this._fetchLogChannel();
            if (!this.logChannel)
                return;
        }
        const { title, error, file, line, function: fn, context } = options;
        // Get memory usage
        const memUsage = process.memoryUsage();
        const heapUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
        const heapTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
        const rss = (memUsage.rss / 1024 / 1024).toFixed(2);
        // Get uptime
        const uptimeSeconds = Math.floor(process.uptime());
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        // Parse error type
        const errorType = error.name || 'Error';
        const errorCode = error.code;
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0xFF6B6B) // Red/coral color
            .setTitle(`⚠️ ${title}`)
            .setTimestamp();
        // Error Location
        if (file || line || fn) {
            let locationText = '';
            if (file)
                locationText += `📁 **File:** \`${file}\`\n`;
            if (line)
                locationText += `📍 **Line:** ${line}\n`;
            if (fn)
                locationText += `⚙️ **Function:** \`${fn}\`\n`;
            embed.addFields({ name: '📍 Error Location', value: locationText, inline: false });
        }
        // Error Details
        let detailsText = `**Type:** \`${errorType}${errorCode ? `[${errorCode}]` : ''}\`\n`;
        detailsText += `**Message:** ${error.message.slice(0, 500)}`;
        embed.addFields({ name: '⚠️ Error Details', value: detailsText, inline: false });
        // Stack Trace Preview
        if (error.stack) {
            const stackLines = error.stack.split('\n').slice(1, 6); // First 5 lines of stack
            const stackPreview = stackLines.map(line => line.trim()).join('\n');
            embed.addFields({
                name: '📚 Stack Trace Preview',
                value: `\`\`\`\n${stackPreview.slice(0, 900)}\n\`\`\``,
                inline: false
            });
        }
        // Context
        if (context && Object.keys(context).length > 0) {
            const contextText = Object.entries(context)
                .slice(0, 5)
                .map(([k, v]) => `• **${k}:** ${String(v).slice(0, 100)}`)
                .join('\n');
            embed.addFields({ name: '🔍 Context', value: contextText || 'None', inline: false });
        }
        // System Info & Memory Usage (inline)
        embed.addFields({
            name: '🖥️ System Info',
            value: `**Uptime:** ${uptimeStr}\n**Servers:** ${this.client?.guilds.cache.size || 0}\n**Users:** ${this.client?.users.cache.size || 0}`,
            inline: true
        }, {
            name: '📊 Memory Usage',
            value: `**Heap:** ${heapUsed} / ${heapTotal} MB\n**RSS:** ${rss} MB`,
            inline: true
        });
        // Footer with error count and timestamp
        const errorCount = this._errorCount || 1;
        embed.setFooter({ text: `Error #${errorCount} • ${this.serviceName} • ${new Date().toLocaleString()}` });
        try {
            await this.logChannel.send({ embeds: [embed] });
            this._errorCount = errorCount + 1;
        }
        catch (err) {
            console.error('[Logger] Failed to send detailed error log:', err.message);
        }
    }
    async logGuildEvent(type, guild) {
        const title = type === 'join' ? '📥 Joined Server' : '📤 Left Server';
        const description = `**${guild.name}**\nMembers: ${guild.memberCount}`;
        await this.discord(type === 'join' ? 'SUCCESS' : 'WARN', title, description, {
            'Guild ID': guild.id,
            'Total Guilds': this.client?.guilds.cache.size || 'N/A'
        });
    }
    /**
     * Log detailed guild join/leave event with full info and invite link
     */
    async logGuildEventDetailed(type, guild) {
        if (!this.logChannel) {
            await this._fetchLogChannel();
            if (!this.logChannel)
                return;
        }
        const isJoin = type === 'join';
        const owner = await guild.fetchOwner().catch(() => null);
        // Calculate server age
        const createdAt = guild.createdAt;
        const now = new Date();
        const ageMs = now.getTime() - createdAt.getTime();
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        const ageStr = ageDays === 0 ? '0d old' : ageDays === 1 ? '1d old' : `${ageDays}d old`;
        // Count channel types
        const textChannels = guild.channels.cache.filter(c => c.type === discord_js_1.ChannelType.GuildText).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === discord_js_1.ChannelType.GuildVoice).size;
        const categories = guild.channels.cache.filter(c => c.type === discord_js_1.ChannelType.GuildCategory).size;
        // Count member types  
        const bots = guild.members.cache.filter(m => m.user.bot).size;
        const humans = guild.memberCount - bots;
        // Count roles
        const totalRoles = guild.roles.cache.size;
        const managedRoles = guild.roles.cache.filter(r => r.managed).size;
        const hoistedRoles = guild.roles.cache.filter(r => r.hoist).size;
        // Get boost info
        const boostLevel = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount || 0;
        const boostEmojis = ['⚪', '🥉', '🥈', '🥇'];
        const boostStatus = boostCount > 0
            ? `${boostEmojis[boostLevel] || '⚪'} Level ${boostLevel} (${boostCount} boosts)`
            : '⚪ None (0 boosts)';
        // Emojis count
        const totalEmojis = guild.emojis.cache.size;
        const animatedEmojis = guild.emojis.cache.filter(e => e.animated === true).size;
        const staticEmojis = totalEmojis - animatedEmojis;
        // Try to get invite link (for join events)
        let inviteUrl = '';
        if (isJoin) {
            try {
                // Find a channel we can create invite for
                const inviteChannel = guild.channels.cache.find(c => c.type === discord_js_1.ChannelType.GuildText &&
                    c.permissionsFor(guild.members.me)?.has(discord_js_1.PermissionFlagsBits.CreateInstantInvite));
                if (inviteChannel && inviteChannel.isTextBased()) {
                    const invite = await inviteChannel.createInvite({
                        maxAge: 0, // Never expires
                        maxUses: 0, // Unlimited
                        unique: true,
                        reason: 'Bot logging - server join'
                    }).catch(() => null);
                    if (invite)
                        inviteUrl = invite.url;
                }
            }
            catch {
                // Ignore invite creation errors
            }
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(isJoin ? '🎉 Joined New Server!' : '👋 Left Server')
            .setColor(isJoin ? 0x57F287 : 0xED4245)
            .setThumbnail(guild.iconURL({ size: 256 }) || null)
            .setTimestamp();
        // Server Name & ID & Owner (top row)
        embed.addFields({ name: '📋 Server Name', value: guild.name, inline: true }, { name: '🆔 Server ID', value: guild.id, inline: true }, { name: '👑 Owner', value: owner ? `${owner.user.tag}\n${owner.id}` : 'Unknown', inline: true });
        // Members & Created & Boost Status (second row)
        embed.addFields({ name: '👥 Members', value: `${guild.memberCount} ( 👤 ${humans} • 🤖 ${bots})`, inline: true }, { name: '📅 Created', value: `${createdAt.toLocaleDateString()}\n(${ageStr})`, inline: true }, { name: '🚀 Boost Status', value: boostStatus, inline: true });
        // Channels
        embed.addFields({
            name: '📺 Channels',
            value: `💬 ${textChannels} • 🔊 ${voiceChannels} • 📁 ${categories}`,
            inline: true
        });
        // Roles
        embed.addFields({
            name: '🏷️ Roles',
            value: `${totalRoles} roles (🤖 ${managedRoles} managed • 📌 ${hoistedRoles} hoisted)`,
            inline: true
        });
        // Emojis
        embed.addFields({
            name: '😀 Emojis',
            value: `${totalEmojis} (😀 ${staticEmojis} • :emoji: ${animatedEmojis})`,
            inline: true
        });
        // Footer with total servers count
        const totalServers = this.client?.guilds.cache.size || 0;
        embed.setFooter({
            text: `Total Servers: ${totalServers} • ${new Date().toLocaleString()}`
        });
        // Add invite link if available (for join)
        if (inviteUrl) {
            embed.addFields({
                name: '🔗 Invite Link',
                value: inviteUrl,
                inline: false
            });
        }
        try {
            await this.logChannel.send({ embeds: [embed] });
        }
        catch (err) {
            console.error('[Logger] Failed to send guild event log:', err.message);
        }
    }
    /**
     * Log moderation action with detailed embed
     */
    async logModerationAction(options) {
        if (!this.logChannel) {
            await this._fetchLogChannel();
            if (!this.logChannel)
                return;
        }
        const { action, caseNumber, user, moderator, reason, trigger, guildName, duration, details } = options;
        // Action color mapping
        const actionColors = {
            'warn': 0xFEE75C,
            'mute': 0xE67E22,
            'kick': 0xE74C3C,
            'ban': 0x992D22,
            'unban': 0x57F287,
            'unmute': 0x57F287,
            'delete': 0x5865F2,
            'delete_warn': 0xEB459E,
            'filter': 0xEB459E,
            'auto-mod': 0xEB459E
        };
        const color = actionColors[action.toLowerCase()] || 0x5865F2;
        const caseText = caseNumber ? ` | Case #${caseNumber}` : '';
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`🛡️ ${action}${caseText}`)
            .setColor(color)
            .setThumbnail(user.avatarURL || null)
            .setTimestamp();
        // User & Moderator (top row)
        embed.addFields({
            name: '👤 User',
            value: `${user.tag} (@${user.tag.split('#')[0]})\n${user.id}`,
            inline: true
        }, {
            name: '👮 Moderator',
            value: `${moderator.tag}\n@${moderator.tag.split('#')[0]}`,
            inline: true
        });
        // Reason
        embed.addFields({
            name: '📝 Reason',
            value: reason.slice(0, 1000),
            inline: false
        });
        // Trigger (if provided, e.g., for auto-mod)
        if (trigger) {
            embed.addFields({
                name: '🎯 Trigger',
                value: trigger.slice(0, 500),
                inline: false
            });
        }
        // Duration (for mutes/bans)
        if (duration) {
            embed.addFields({
                name: '⏱️ Duration',
                value: duration,
                inline: true
            });
        }
        // Additional details
        if (details) {
            Object.entries(details).slice(0, 5).forEach(([key, value]) => {
                embed.addFields({ name: key, value: value.slice(0, 500), inline: true });
            });
        }
        // Footer
        embed.setFooter({
            text: `User ID: ${user.id} • ${new Date().toLocaleString()}`
        });
        try {
            await this.logChannel.send({ embeds: [embed] });
        }
        catch (err) {
            console.error('[Logger] Failed to send moderation log:', err.message);
        }
    }
    /**
     * Log performance metrics (useful at scale)
     */
    performance(operation, duration, metadata = {}) {
        if (duration > 5000) {
            this.warn('Performance', `Slow operation: ${operation} took ${duration}ms`, metadata);
        }
        else {
            this.debug('Performance', `${operation}: ${duration}ms`, metadata);
        }
    }
}
exports.Logger = Logger;
// SINGLETON EXPORT
/**
 * Singleton logger instance
 */
const logger = new Logger();
exports.logger = logger;
// Default export
exports.default = logger;
// Expose methods on module.exports for CommonJS compatibility
// This allows both `require('Logger')` and `require('Logger').logger` to work
module.exports = logger;
module.exports.default = logger;
module.exports.logger = logger;
module.exports.Logger = Logger;
module.exports.LOG_CHANNEL_ID = exports.LOG_CHANNEL_ID;
module.exports.LOG_LEVELS = exports.LOG_LEVELS;
//# sourceMappingURL=Logger.js.map
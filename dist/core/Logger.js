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
    async logGuildEvent(type, guild) {
        const title = type === 'join' ? '📥 Joined Server' : '📤 Left Server';
        const description = `**${guild.name}**\nMembers: ${guild.memberCount}`;
        await this.discord(type === 'join' ? 'SUCCESS' : 'WARN', title, description, {
            'Guild ID': guild.id,
            'Total Guilds': this.client?.guilds.cache.size || 'N/A'
        });
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
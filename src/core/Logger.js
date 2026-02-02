/**
 * alterGolden Logging System
 * Handles both console and Discord channel logging
 * Supports JSON structured logging for production
 * Optimized for high-volume logging at scale
 * @module core/Logger
 */

const { EmbedBuilder } = require('discord.js');

// Log channel ID for Discord logging
const LOG_CHANNEL_ID = process.env.SYSTEM_LOG_CHANNEL_ID || '1195762287729537045';

// Log format: 'json' for production, 'text' for development
const LOG_FORMAT = process.env.LOG_FORMAT || 'text';

// Log levels with colors
const LOG_LEVELS = {
    DEBUG: { emoji: '🔍', color: 0x7289DA, console: 'log', priority: 0, name: 'debug' },
    INFO: { emoji: 'ℹ️', color: 0x3498DB, console: 'info', priority: 1, name: 'info' },
    SUCCESS: { emoji: '✅', color: 0x2ECC71, console: 'log', priority: 2, name: 'info' },
    WARN: { emoji: '⚠️', color: 0xF1C40F, console: 'warn', priority: 3, name: 'warn' },
    ERROR: { emoji: '❌', color: 0xE74C3C, console: 'error', priority: 4, name: 'error' },
    CRITICAL: { emoji: '🚨', color: 0x992D22, console: 'error', priority: 5, name: 'fatal' }
};

// Minimum log level (can be set via env)
const MIN_LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';

class Logger {
    constructor() {
        this.client = null;
        this.logChannel = null;
        this.minPriority = LOG_LEVELS[MIN_LOG_LEVEL]?.priority ?? 1;
        this.format = LOG_FORMAT;
        this.serviceName = process.env.SERVICE_NAME || 'alterGolden';
        this.environment = process.env.NODE_ENV || 'development';
        
        // Rate limiting for Discord logs to prevent spam
        this.discordLogQueue = [];
        this.isProcessingQueue = false;
        this.lastDiscordLog = 0;
        this.discordLogCooldown = 1000; // 1 second between logs
    }

    /**
     * Initialize logger with Discord client
     * @param {Client} client - Discord client instance
     */
    initialize(client) {
        this.client = client;
        this._fetchLogChannel();
    }

    /**
     * Set log format dynamically
     * @param {'json' | 'text'} format 
     */
    setFormat(format) {
        this.format = format;
    }

    /**
     * Fetch log channel (with retry)
     * @private
     */
    async _fetchLogChannel() {
        if (!this.client) return;
        
        try {
            this.logChannel = await this.client.channels.fetch(LOG_CHANNEL_ID);
        } catch (error) {
            console.warn('[Logger] Could not fetch log channel:', error.message);
        }
    }

    /**
     * Check if log level should be logged
     * @private
     */
    _shouldLog(level) {
        const levelConfig = LOG_LEVELS[level];
        return levelConfig && levelConfig.priority >= this.minPriority;
    }

    /**
     * Format log entry as JSON for structured logging
     * @private
     */
    _formatJson(level, category, message, metadata = {}) {
        const logLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
        
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level: logLevel.name,
            severity: level,
            service: this.serviceName,
            environment: this.environment,
            category: category,
            message: message,
            ...metadata,
            // Add shard info if available
            ...(this.client?.shard && { shardId: this.client.shard.ids[0] })
        });
    }

    /**
     * Format log entry as text for human readable output
     * @private
     */
    _formatText(level, category, message) {
        const logLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
        const timestamp = new Date().toISOString();
        return `[${timestamp}] ${logLevel.emoji} [${category}] ${message}`;
    }

    /**
     * Log to console with formatted output
     * @param {string} level - Log level
     * @param {string} category - Log category/module
     * @param {string} message - Log message
     * @param {Object} [metadata] - Additional metadata for JSON format
     */
    console(level, category, message, metadata = {}) {
        if (!this._shouldLog(level)) return;
        
        const logLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
        
        let formattedMessage;
        if (this.format === 'json') {
            formattedMessage = this._formatJson(level, category, message, metadata);
        } else {
            formattedMessage = this._formatText(level, category, message);
        }
        
        console[logLevel.console](formattedMessage);
    }

    /**
     * Log with additional metadata (for structured logging)
     * @param {string} level - Log level
     * @param {string} category - Category
     * @param {string} message - Message
     * @param {Object} metadata - Additional structured data
     */
    log(level, category, message, metadata = {}) {
        this.console(level, category, message, metadata);
    }

    /**
     * Log to Discord channel (rate-limited)
     * @param {string} level - Log level
     * @param {string} title - Embed title
     * @param {string} description - Embed description
     * @param {Object} [fields] - Additional fields
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
     * @private
     */
    async _processDiscordQueue() {
        if (this.isProcessingQueue || this.discordLogQueue.length === 0) return;
        
        this.isProcessingQueue = true;
        
        while (this.discordLogQueue.length > 0) {
            // Rate limit
            const timeSinceLastLog = Date.now() - this.lastDiscordLog;
            if (timeSinceLastLog < this.discordLogCooldown) {
                await new Promise(r => setTimeout(r, this.discordLogCooldown - timeSinceLastLog));
            }
            
            const log = this.discordLogQueue.shift();
            await this._sendDiscordLog(log);
            this.lastDiscordLog = Date.now();
        }
        
        this.isProcessingQueue = false;
    }

    /**
     * Send a single Discord log
     * @private
     */
    async _sendDiscordLog({ level, title, description, fields }) {
        if (!this.logChannel) {
            await this._fetchLogChannel();
            if (!this.logChannel) return;
        }

        const logLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
        
        const embed = new EmbedBuilder()
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
        } catch (error) {
            console.error('[Logger] Failed to send Discord log:', error.message);
            this.logChannel = null; // Reset and refetch next time
        }
    }

    // Convenience methods
    debug(category, message, meta) { this.console('DEBUG', category, message, meta); }
    info(category, message, meta) { this.console('INFO', category, message, meta); }
    success(category, message, meta) { this.console('SUCCESS', category, message, meta); }
    warn(category, message, meta) { this.console('WARN', category, message, meta); }
    error(category, message, meta) { this.console('ERROR', category, message, meta); }
    critical(category, message, meta) { this.console('CRITICAL', category, message, meta); }

    // Structured logging convenience methods with metadata
    debugWithMeta(category, message, meta) { this.console('DEBUG', category, message, meta); }
    infoWithMeta(category, message, meta) { this.console('INFO', category, message, meta); }
    errorWithMeta(category, message, meta) { this.console('ERROR', category, message, meta); }

    /**
     * Log a request/response for API tracking
     * @param {Object} options - Request details
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
     * @param {Object} options - Command details
     */
    logCommand(options) {
        const { command, userId, guildId, duration, success, error } = options;
        this.console(success ? 'INFO' : 'ERROR', 'Command', `${command} ${success ? 'success' : 'failed'} (${duration}ms)`, {
            command,
            userId,
            guildId,
            duration,
            success,
            error: error?.message
        });
    }

    // Discord logging convenience methods
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
     * @param {string} operation - Operation name
     * @param {number} duration - Duration in ms
     * @param {Object} metadata - Additional metadata
     */
    performance(operation, duration, metadata = {}) {
        if (duration > 5000) {
            this.warn('Performance', `Slow operation: ${operation} took ${duration}ms`);
        } else {
            this.debug('Performance', `${operation}: ${duration}ms`);
        }
    }
}

// Export singleton instance
const logger = new Logger();
module.exports = logger;
module.exports.Logger = Logger;
module.exports.LOG_CHANNEL_ID = LOG_CHANNEL_ID;
module.exports.LOG_LEVELS = LOG_LEVELS;

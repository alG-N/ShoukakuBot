/**
 * alterGolden Logging System
 * Handles both console and Discord channel logging
 * Supports JSON structured logging for production
 * Optimized for high-volume logging at scale
 * @module core/Logger
 */

import { Client, EmbedBuilder, TextChannel } from 'discord.js';
// TYPES & INTERFACES
/**
 * Log level names
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'CRITICAL';

/**
 * Log format types
 */
export type LogFormat = 'json' | 'text';

/**
 * Console method names
 */
type ConsoleMethods = 'log' | 'info' | 'warn' | 'error';

/**
 * Sentry severity names
 */
type SentrySeverity = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Log level configuration
 */
interface LogLevelConfig {
    emoji: string;
    color: number;
    console: ConsoleMethods;
    priority: number;
    name: SentrySeverity;
}

/**
 * Discord log entry in queue
 */
interface DiscordLogEntry {
    level: LogLevel;
    title: string;
    description: string;
    fields?: Record<string, unknown> | null;
}

/**
 * Metadata for structured logging
 */
export interface LogMetadata {
    [key: string]: unknown;
    error?: string;
    userId?: string;
    guildId?: string;
    shardId?: number;
}

/**
 * Request log options
 */
export interface RequestLogOptions {
    method: string;
    url: string;
    statusCode: number;
    duration: number;
    userId?: string;
    guildId?: string;
    error?: Error | null;
}

/**
 * Command log options
 */
export interface CommandLogOptions {
    command: string;
    userId: string;
    guildId?: string;
    duration: number;
    success: boolean;
    error?: Error | null;
}

/**
 * Guild interface for logging (simplified)
 */
interface GuildLike {
    id: string;
    name: string;
    memberCount: number;
}
// CONFIGURATION
/**
 * Log channel ID for Discord logging
 */
export const LOG_CHANNEL_ID: string = process.env.SYSTEM_LOG_CHANNEL_ID || '1195762287729537045';

/**
 * Log format: 'json' for production, 'text' for development
 */
const LOG_FORMAT: LogFormat = (process.env.LOG_FORMAT as LogFormat) || 'text';

/**
 * Log levels with colors and configuration
 */
export const LOG_LEVELS: Record<LogLevel, LogLevelConfig> = {
    DEBUG: { emoji: '🔍', color: 0x7289DA, console: 'log', priority: 0, name: 'debug' },
    INFO: { emoji: 'ℹ️', color: 0x3498DB, console: 'info', priority: 1, name: 'info' },
    SUCCESS: { emoji: '✅', color: 0x2ECC71, console: 'log', priority: 2, name: 'info' },
    WARN: { emoji: '⚠️', color: 0xF1C40F, console: 'warn', priority: 3, name: 'warn' },
    ERROR: { emoji: '❌', color: 0xE74C3C, console: 'error', priority: 4, name: 'error' },
    CRITICAL: { emoji: '🚨', color: 0x992D22, console: 'error', priority: 5, name: 'fatal' }
} as const;

/**
 * Minimum log level (can be set via env)
 */
const MIN_LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'INFO';
// LOGGER CLASS
/**
 * Logger class for handling console and Discord logging
 */
export class Logger {
    private client: Client | null = null;
    private logChannel: TextChannel | null = null;
    private minPriority: number;
    private format: LogFormat;
    private serviceName: string;
    private environment: string;
    
    // Rate limiting for Discord logs
    private discordLogQueue: DiscordLogEntry[] = [];
    private isProcessingQueue: boolean = false;
    private lastDiscordLog: number = 0;
    private discordLogCooldown: number = 1000; // 1 second between logs

    constructor() {
        this.minPriority = LOG_LEVELS[MIN_LOG_LEVEL]?.priority ?? 1;
        this.format = LOG_FORMAT;
        this.serviceName = process.env.SERVICE_NAME || 'alterGolden';
        this.environment = process.env.NODE_ENV || 'development';
    }

    /**
     * Initialize logger with Discord client
     */
    initialize(client: Client): void {
        this.client = client;
        this._fetchLogChannel();
    }

    /**
     * Set log format dynamically
     */
    setFormat(format: LogFormat): void {
        this.format = format;
    }

    /**
     * Fetch log channel (with retry)
     */
    private async _fetchLogChannel(): Promise<void> {
        if (!this.client) return;
        
        try {
            const channel = await this.client.channels.fetch(LOG_CHANNEL_ID);
            if (channel?.isTextBased()) {
                this.logChannel = channel as TextChannel;
            }
        } catch (error) {
            console.warn('[Logger] Could not fetch log channel:', (error as Error).message);
        }
    }

    /**
     * Check if log level should be logged
     */
    private _shouldLog(level: LogLevel): boolean {
        const levelConfig = LOG_LEVELS[level];
        return levelConfig && levelConfig.priority >= this.minPriority;
    }

    /**
     * Format log entry as JSON for structured logging
     */
    private _formatJson(level: LogLevel, category: string, message: string, metadata: LogMetadata = {}): string {
        const logLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
        
        interface StructuredLog {
            timestamp: string;
            level: SentrySeverity;
            severity: LogLevel;
            service: string;
            environment: string;
            category: string;
            message: string;
            shardId?: number;
            [key: string]: unknown;
        }

        const logEntry: StructuredLog = {
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
    private _formatText(level: LogLevel, category: string, message: string): string {
        const logLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
        const timestamp = new Date().toISOString();
        return `[${timestamp}] ${logLevel.emoji} [${category}] ${message}`;
    }

    /**
     * Log to console with formatted output
     */
    console(level: LogLevel, category: string, message: string, metadata: LogMetadata = {}): void {
        if (!this._shouldLog(level)) return;
        
        const logLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
        
        let formattedMessage: string;
        if (this.format === 'json') {
            formattedMessage = this._formatJson(level, category, message, metadata);
        } else {
            formattedMessage = this._formatText(level, category, message);
        }
        
        console[logLevel.console](formattedMessage);
    }

    /**
     * Log with additional metadata (for structured logging)
     */
    log(level: LogLevel, category: string, message: string, metadata: LogMetadata = {}): void {
        this.console(level, category, message, metadata);
    }

    /**
     * Log to Discord channel (rate-limited)
     */
    async discord(level: LogLevel, title: string, description: string, fields: Record<string, unknown> | null = null): Promise<void> {
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
    private async _processDiscordQueue(): Promise<void> {
        if (this.isProcessingQueue || this.discordLogQueue.length === 0) return;
        
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
    private async _sendDiscordLog({ level, title, description, fields }: DiscordLogEntry): Promise<void> {
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
            console.error('[Logger] Failed to send Discord log:', (error as Error).message);
            this.logChannel = null; // Reset and refetch next time
        }
    }
    // CONVENIENCE METHODS
    debug(category: string, message: string, meta?: LogMetadata): void { 
        this.console('DEBUG', category, message, meta); 
    }
    
    info(category: string, message: string, meta?: LogMetadata): void { 
        this.console('INFO', category, message, meta); 
    }
    
    success(category: string, message: string, meta?: LogMetadata): void { 
        this.console('SUCCESS', category, message, meta); 
    }
    
    warn(category: string, message: string, meta?: LogMetadata): void { 
        this.console('WARN', category, message, meta); 
    }
    
    error(category: string, message: string, meta?: LogMetadata): void { 
        this.console('ERROR', category, message, meta); 
    }
    
    critical(category: string, message: string, meta?: LogMetadata): void { 
        this.console('CRITICAL', category, message, meta); 
    }

    // Structured logging convenience methods with metadata
    debugWithMeta(category: string, message: string, meta: LogMetadata): void { 
        this.console('DEBUG', category, message, meta); 
    }
    
    infoWithMeta(category: string, message: string, meta: LogMetadata): void { 
        this.console('INFO', category, message, meta); 
    }
    
    errorWithMeta(category: string, message: string, meta: LogMetadata): void { 
        this.console('ERROR', category, message, meta); 
    }

    /**
     * Log a request/response for API tracking
     */
    logRequest(options: RequestLogOptions): void {
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
    logCommand(options: CommandLogOptions): void {
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
    async logSystemEvent(title: string, description: string): Promise<void> {
        await this.discord('INFO', title, description);
    }

    async logError(title: string, error: Error | string, context: Record<string, unknown> = {}): Promise<void> {
        const description = error instanceof Error 
            ? `\`\`\`${(error.stack || error.message).slice(0, 3900)}\`\`\``
            : `\`\`\`${String(error).slice(0, 3900)}\`\`\``;
        
        await this.discord('ERROR', title, description, context);
    }

    async logGuildEvent(type: 'join' | 'leave', guild: GuildLike): Promise<void> {
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
    performance(operation: string, duration: number, metadata: LogMetadata = {}): void {
        if (duration > 5000) {
            this.warn('Performance', `Slow operation: ${operation} took ${duration}ms`, metadata);
        } else {
            this.debug('Performance', `${operation}: ${duration}ms`, metadata);
        }
    }
}
// SINGLETON EXPORT
/**
 * Singleton logger instance
 */
const logger = new Logger();

// Default export
export default logger;

// Named exports for ESM
export { logger };

// Expose methods on module.exports for CommonJS compatibility
// This allows both `require('Logger')` and `require('Logger').logger` to work
module.exports = logger;
module.exports.default = logger;
module.exports.logger = logger;
module.exports.Logger = Logger;
module.exports.LOG_CHANNEL_ID = LOG_CHANNEL_ID;
module.exports.LOG_LEVELS = LOG_LEVELS;

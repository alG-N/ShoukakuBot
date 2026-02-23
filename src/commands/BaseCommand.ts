/**
 * BaseCommand Class
 * Abstract base class for all slash commands
 * Provides common functionality: error handling, cooldowns, validation
 * @module commands/BaseCommand
 */

import {
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    EmbedBuilder,
    PermissionFlagsBits,
    PermissionResolvable,
    InteractionReplyOptions,
    Message,
    Client,
    Guild,
    User,
    GuildMember,
} from 'discord.js';

import { COLORS, TIMEOUTS, EMOJIS } from '../constants.js';
import { AppError, ValidationError, PermissionError } from '../errors/index.js';
import { trackCommand, commandsActive, commandErrorsTotal } from '../core/metrics.js';
import { isOwner } from '../config/owner.js';
import { logger } from '../core/Logger.js';
import { globalCooldownManager } from '../utils/common/cooldown.js';
// TYPES & INTERFACES
/**
 * Command categories enum
 */
export const CommandCategory = {
    GENERAL: 'general',
    ADMIN: 'admin',
    OWNER: 'owner',
    MUSIC: 'music',
    VIDEO: 'video',
    API: 'api',
    FUN: 'fun',
} as const;

export type CommandCategoryType = typeof CommandCategory[keyof typeof CommandCategory];

/**
 * Command options for constructor
 */
export interface CommandOptions {
    /** Command category */
    category?: CommandCategoryType;
    /** Cooldown in seconds */
    cooldown?: number;
    /** Owner only command */
    ownerOnly?: boolean;
    /** Admin only command */
    adminOnly?: boolean;
    /** Guild only command */
    guildOnly?: boolean;
    /** NSFW only command */
    nsfw?: boolean;
    /** Required user permissions */
    userPermissions?: PermissionResolvable[];
    /** Required bot permissions */
    botPermissions?: PermissionResolvable[];
    /** Whether to defer reply */
    deferReply?: boolean;
    /** Whether reply should be ephemeral */
    ephemeral?: boolean;
}

/**
 * Cooldown check result
 */
interface CooldownResult {
    onCooldown: boolean;
    remaining?: number;
}

/**
 * Command execution context
 */
export interface CommandContext {
    client: Client;
    guild: Guild | null;
    user: User;
    member: GuildMember | null;
}

/**
 * Command data type - accepts any SlashCommand variant
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandData = any;
// BASE COMMAND CLASS
/**
 * Base command class - extend this for all commands
 */
export abstract class BaseCommand {
    /** Command category */
    readonly category: CommandCategoryType;
    
    /** Cooldown in seconds */
    readonly cooldown: number;
    
    /** Owner only command */
    readonly ownerOnly: boolean;
    
    /** Admin only command */
    readonly adminOnly: boolean;
    
    /** Guild only command */
    readonly guildOnly: boolean;
    
    /** NSFW only command */
    readonly nsfw: boolean;
    
    /** Required user permissions */
    readonly userPermissions: PermissionResolvable[];
    
    /** Required bot permissions */
    readonly botPermissions: PermissionResolvable[];
    
    /** Whether to defer reply */
    readonly deferReply: boolean;
    
    /** Whether reply should be ephemeral */
    readonly ephemeral: boolean;
    
    // Cooldowns managed by globalCooldownManager (Redis-backed, shard-safe)

    constructor(options: CommandOptions = {}) {
        this.category = options.category || CommandCategory.GENERAL;
        this.cooldown = options.cooldown ?? TIMEOUTS.COMMAND_COOLDOWN / 1000;
        this.ownerOnly = options.ownerOnly || false;
        this.adminOnly = options.adminOnly || false;
        this.guildOnly = options.guildOnly ?? true;
        this.nsfw = options.nsfw || false;
        this.userPermissions = options.userPermissions || [];
        this.botPermissions = options.botPermissions || [];
        this.deferReply = options.deferReply ?? false;
        this.ephemeral = options.ephemeral ?? false;
    }

    /**
     * SlashCommandBuilder data - MUST be overridden
     */
    abstract get data(): CommandData;

    /**
     * Main execution logic - MUST be overridden
     */
    abstract run(interaction: ChatInputCommandInteraction, context?: CommandContext): Promise<void>;

    /**
     * Handle autocomplete - Override if needed
     */
    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        await interaction.respond([]);
    }

    /**
     * Handle button interactions - Override if needed
     */
    async handleButton(_interaction: ButtonInteraction): Promise<void> {
        // Default: no button handling
    }

    /**
     * Handle select menu interactions - Override if needed
     */
    async handleSelectMenu(_interaction: StringSelectMenuInteraction): Promise<void> {
        // Default: no select menu handling
    }

    /**
     * Handle modal submissions - Override if needed
     */
    async handleModal(_interaction: ModalSubmitInteraction): Promise<void> {
        // Default: no modal handling
    }

    /**
     * Execute command with full error handling and validation
     */
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const startTime = Date.now();
        const commandName = this.data?.name || 'unknown';
        
        // Track active commands
        commandsActive.inc({ command: commandName });

        try {
            // Pre-execution validations
            await this._validateExecution(interaction);

            // Check cooldown (Redis-backed, shard-safe)
            const cooldownResult = await this._checkCooldown(interaction.user.id);
            if (cooldownResult.onCooldown && cooldownResult.remaining) {
                await this._sendCooldownMessage(interaction, cooldownResult.remaining);
                return;
            }

            // Defer if configured
            if (this.deferReply && !interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: this.ephemeral });
            }

            // Execute command
            await this.run(interaction, {
                client: interaction.client,
                guild: interaction.guild,
                user: interaction.user,
                member: interaction.member as GuildMember | null,
            });

            // Set cooldown after successful execution (Redis-backed, shard-safe)
            await this._setCooldown(interaction.user.id);

            // Track metrics
            const duration = Date.now() - startTime;
            trackCommand(commandName, this.category, duration, 'success');
            commandsActive.dec({ command: commandName });

            // Log slow executions (playlist/video commands can take 10s+ legitimately)
            if (duration > 10000) {
                logger.warn(commandName, `Slow command execution: ${duration}ms`);
            }

        } catch (error) {
            // Track error metrics
            const duration = Date.now() - startTime;
            trackCommand(commandName, this.category, duration, 'error');
            commandsActive.dec({ command: commandName });
            commandErrorsTotal.inc({ 
                command: commandName, 
                category: this.category,
                error_type: (error as Error).name || 'Unknown' 
            });
            
            await this._handleError(interaction, error as Error, commandName);
        }
    }

    /**
     * Validate execution requirements
     */
    private async _validateExecution(interaction: ChatInputCommandInteraction): Promise<void> {
        // Guild only check
        if (this.guildOnly && !interaction.guild) {
            throw new ValidationError('This command can only be used in a server');
        }

        // NSFW check
        if (this.nsfw && interaction.channel && 'nsfw' in interaction.channel && !interaction.channel.nsfw) {
            throw new ValidationError('This command can only be used in NSFW channels');
        }

        // Owner only check
        if (this.ownerOnly) {
            if (!isOwner(interaction.user.id)) {
                throw new PermissionError('This command is restricted to bot owners');
            }
        }

        // Admin only check
        if (this.adminOnly && interaction.guild && interaction.member) {
            const member = interaction.member as GuildMember;
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            const isGuildOwner = interaction.guild.ownerId === interaction.user.id;
            if (!isAdmin && !isGuildOwner) {
                throw new PermissionError('This command requires Administrator permission');
            }
        }

        // User permissions check
        if (this.userPermissions.length > 0 && interaction.guild && interaction.member) {
            const member = interaction.member as GuildMember;
            const missing = this.userPermissions.filter(
                perm => !member.permissions.has(perm)
            );
            if (missing.length > 0) {
                throw new PermissionError(`Missing permissions: ${missing.join(', ')}`);
            }
        }

        // Bot permissions check
        if (this.botPermissions.length > 0 && interaction.guild) {
            const botMember = interaction.guild.members.me;
            if (botMember) {
                const missing = this.botPermissions.filter(
                    perm => !botMember.permissions.has(perm)
                );
                if (missing.length > 0) {
                    throw new PermissionError(`I'm missing permissions: ${missing.join(', ')}`);
                }
            }
        }
    }

    /**
     * Check cooldown via Redis-backed CooldownManager (shard-safe)
     */
    private async _checkCooldown(userId: string): Promise<CooldownResult> {
        if (this.cooldown <= 0) return { onCooldown: false };

        const commandName = this.data?.name || 'unknown';
        const result = await globalCooldownManager.check(userId, commandName, this.cooldown * 1000);

        if (result.onCooldown) {
            return {
                onCooldown: true,
                remaining: Math.ceil(result.remaining / 1000),
            };
        }

        return { onCooldown: false };
    }

    /**
     * Set cooldown via Redis-backed CooldownManager (shard-safe)
     * Redis TTL handles auto-cleanup — no setTimeout needed
     */
    private async _setCooldown(userId: string): Promise<void> {
        if (this.cooldown <= 0) return;
        const commandName = this.data?.name || 'unknown';
        await globalCooldownManager.set(userId, commandName, this.cooldown * 1000);
    }

    /**
     * Send cooldown message
     */
    private async _sendCooldownMessage(interaction: ChatInputCommandInteraction, remaining: number): Promise<void> {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setDescription(`${EMOJIS.CLOCK} Please wait **${remaining}s** before using this command again.`);

        await this.safeReply(interaction, { embeds: [embed], ephemeral: true });
    }

    /**
     * Handle errors uniformly
     */
    private async _handleError(
        interaction: ChatInputCommandInteraction, 
        error: Error, 
        commandName: string
    ): Promise<void> {
        // Log error
        logger.error(commandName, `Error: ${error.message}`);
        if (error.stack && !AppError.isOperationalError(error)) {
            logger.error('BaseCommand', `Unhandled error: ${error.message}`);
        }

        // Determine error message
        let userMessage = 'An unexpected error occurred. Please try again later.';
        let color: number = COLORS.ERROR;

        if (error instanceof AppError) {
            userMessage = error.message;
            if (error.code === 'VALIDATION_ERROR') {
                color = COLORS.WARNING;
            }
        } else if ((error as NodeJS.ErrnoException).code === 'InteractionAlreadyReplied') {
            return;
        }

        // Send error response
        const embed = new EmbedBuilder()
            .setColor(color)
            .setDescription(`${EMOJIS.ERROR} ${userMessage}`);

        await this.safeReply(interaction, { embeds: [embed], ephemeral: true });
    }

    /**
     * Safe reply helper - handles deferred/replied states
     */
    async safeReply(
        interaction: ChatInputCommandInteraction, 
        options: InteractionReplyOptions
    ): Promise<Message | void> {
        try {
            if (interaction.deferred) {
                // Extract only compatible properties for editReply
                const { content, embeds, components, files, allowedMentions } = options;
                return await interaction.editReply({ content, embeds, components, files, allowedMentions });
            } else if (interaction.replied) {
                return await interaction.followUp(options);
            } else {
                const response = await interaction.reply({ ...options, withResponse: false });
                return response as unknown as Message;
            }
        } catch (error) {
            logger.debug('BaseCommand', `Reply failed: ${(error as Error).message}`);
        }
    }
    // EMBED HELPERS
    /**
     * Create success embed
     */
    successEmbed(title: string, description: string): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(`${EMOJIS.SUCCESS} ${title}`)
            .setDescription(description)
            .setTimestamp();
    }

    /**
     * Create error embed
     */
    errorEmbed(message: string): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setDescription(`${EMOJIS.ERROR} ${message}`);
    }

    /**
     * Create info embed
     */
    infoEmbed(title: string, description: string): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle(`${EMOJIS.INFO} ${title}`)
            .setDescription(description);
    }

    /**
     * Create warning embed
     */
    warningEmbed(message: string): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setDescription(`${EMOJIS.WARNING} ${message}`);
    }
    // REPLY HELPERS
    /**
     * Send info reply
     */
    async infoReply(
        interaction: ChatInputCommandInteraction, 
        message: string, 
        ephemeral = true
    ): Promise<Message | void> {
        const embed = this.infoEmbed('Info', message);
        return this.safeReply(interaction, { embeds: [embed], ephemeral });
    }

    /**
     * Send error reply
     */
    async errorReply(
        interaction: ChatInputCommandInteraction, 
        message: string, 
        ephemeral = true
    ): Promise<Message | void> {
        const embed = this.errorEmbed(message);
        return this.safeReply(interaction, { embeds: [embed], ephemeral });
    }

    /**
     * Send success reply
     */
    async successReply(
        interaction: ChatInputCommandInteraction, 
        title: string, 
        description: string, 
        ephemeral = false
    ): Promise<Message | void> {
        const embed = this.successEmbed(title, description);
        return this.safeReply(interaction, { embeds: [embed], ephemeral });
    }

    /**
     * Send warning reply
     */
    async warningReply(
        interaction: ChatInputCommandInteraction, 
        message: string, 
        ephemeral = true
    ): Promise<Message | void> {
        const embed = this.warningEmbed(message);
        return this.safeReply(interaction, { embeds: [embed], ephemeral });
    }
}

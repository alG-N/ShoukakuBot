/**
 * BaseCommand Class
 * Abstract base class for all slash commands
 * Provides common functionality: error handling, cooldowns, validation
 * @module commands/BaseCommand
 */

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { COLORS, TIMEOUTS, EMOJIS } = require('../constants');
const { AppError, ValidationError, PermissionError } = require('../errors');
const logger = require('../core/Logger');

/**
 * Command categories
 */
const CommandCategory = {
    GENERAL: 'general',
    ADMIN: 'admin',
    OWNER: 'owner',
    MUSIC: 'music',
    VIDEO: 'video',
    API: 'api',
    FUN: 'fun',
};

/**
 * Base command class - extend this for all commands
 */
class BaseCommand {
    constructor(options = {}) {
        // Command metadata
        this.category = options.category || CommandCategory.GENERAL;
        this.cooldown = options.cooldown ?? TIMEOUTS.COMMAND_COOLDOWN / 1000; // seconds
        this.ownerOnly = options.ownerOnly || false;
        this.adminOnly = options.adminOnly || false;
        this.guildOnly = options.guildOnly ?? true;
        this.nsfw = options.nsfw || false;
        
        // Required permissions
        this.userPermissions = options.userPermissions || [];
        this.botPermissions = options.botPermissions || [];
        
        // Defer settings
        this.deferReply = options.deferReply ?? false;
        this.ephemeral = options.ephemeral ?? false;
        
        // Cooldown tracking (in-memory, per command instance)
        this._cooldowns = new Map();
    }

    /**
     * SlashCommandBuilder data - MUST be overridden
     * @returns {SlashCommandBuilder}
     */
    get data() {
        throw new Error('Command must implement data getter');
    }

    /**
     * Main execution logic - MUST be overridden
     * @param {CommandInteraction} interaction
     * @param {Object} context - Additional context (client, services, etc.)
     */
    async run(interaction, context = {}) {
        throw new Error('Command must implement run method');
    }

    /**
     * Handle autocomplete - Override if needed
     * @param {AutocompleteInteraction} interaction
     */
    async autocomplete(interaction) {
        // Default: no autocomplete
        await interaction.respond([]);
    }

    /**
     * Handle button interactions - Override if needed
     * @param {ButtonInteraction} interaction
     */
    async handleButton(interaction) {
        // Default: no button handling
    }

    /**
     * Handle select menu interactions - Override if needed
     * @param {StringSelectMenuInteraction} interaction
     */
    async handleSelectMenu(interaction) {
        // Default: no select menu handling
    }

    /**
     * Handle modal submissions - Override if needed
     * @param {ModalSubmitInteraction} interaction
     */
    async handleModal(interaction) {
        // Default: no modal handling
    }

    /**
     * Execute command with full error handling and validation
     * This is called by the interaction handler
     * @param {CommandInteraction} interaction
     */
    async execute(interaction) {
        const startTime = Date.now();
        const commandName = this.data?.name || 'unknown';

        try {
            // Pre-execution validations
            await this._validateExecution(interaction);

            // Check cooldown
            const cooldownResult = this._checkCooldown(interaction.user.id);
            if (cooldownResult.onCooldown) {
                return await this._sendCooldownMessage(interaction, cooldownResult.remaining);
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
                member: interaction.member,
            });

            // Set cooldown after successful execution
            this._setCooldown(interaction.user.id);

            // Log execution time
            const duration = Date.now() - startTime;
            if (duration > 3000) {
                logger.warn(commandName, `Slow command execution: ${duration}ms`);
            }

        } catch (error) {
            await this._handleError(interaction, error, commandName);
        }
    }

    /**
     * Validate execution requirements
     */
    async _validateExecution(interaction) {
        // Guild only check
        if (this.guildOnly && !interaction.guild) {
            throw new ValidationError('This command can only be used in a server');
        }

        // NSFW check
        if (this.nsfw && !interaction.channel?.nsfw) {
            throw new ValidationError('This command can only be used in NSFW channels');
        }

        // Owner only check
        if (this.ownerOnly) {
            const { isOwner } = require('../config/owner');
            if (!isOwner(interaction.user.id)) {
                throw new PermissionError('This command is restricted to bot owners');
            }
        }

        // Admin only check
        if (this.adminOnly && interaction.guild) {
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            const isOwner = interaction.guild.ownerId === interaction.user.id;
            if (!isAdmin && !isOwner) {
                throw new PermissionError('This command requires Administrator permission');
            }
        }

        // User permissions check
        if (this.userPermissions.length > 0 && interaction.guild) {
            const missing = this.userPermissions.filter(
                perm => !interaction.member.permissions.has(perm)
            );
            if (missing.length > 0) {
                throw new PermissionError(`Missing permissions: ${missing.join(', ')}`);
            }
        }

        // Bot permissions check
        if (this.botPermissions.length > 0 && interaction.guild) {
            const botMember = interaction.guild.members.me;
            const missing = this.botPermissions.filter(
                perm => !botMember.permissions.has(perm)
            );
            if (missing.length > 0) {
                throw new PermissionError(`I'm missing permissions: ${missing.join(', ')}`);
            }
        }
    }

    /**
     * Check cooldown
     */
    _checkCooldown(userId) {
        if (this.cooldown <= 0) return { onCooldown: false };

        const now = Date.now();
        const cooldownEnd = this._cooldowns.get(userId);

        if (cooldownEnd && now < cooldownEnd) {
            return {
                onCooldown: true,
                remaining: Math.ceil((cooldownEnd - now) / 1000),
            };
        }

        return { onCooldown: false };
    }

    /**
     * Set cooldown
     */
    _setCooldown(userId) {
        if (this.cooldown <= 0) return;
        this._cooldowns.set(userId, Date.now() + (this.cooldown * 1000));

        // Auto-cleanup after cooldown expires
        setTimeout(() => {
            this._cooldowns.delete(userId);
        }, this.cooldown * 1000 + 1000);
    }

    /**
     * Send cooldown message
     */
    async _sendCooldownMessage(interaction, remaining) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setDescription(`${EMOJIS.CLOCK} Please wait **${remaining}s** before using this command again.`);

        return this.safeReply(interaction, { embeds: [embed], ephemeral: true });
    }

    /**
     * Handle errors uniformly
     */
    async _handleError(interaction, error, commandName) {
        // Log error
        logger.error(commandName, `Error: ${error.message}`);
        if (error.stack && !AppError.isOperationalError(error)) {
            console.error(error.stack);
        }

        // Determine error message
        let userMessage = 'An unexpected error occurred. Please try again later.';
        let color = COLORS.ERROR;

        if (error instanceof AppError) {
            userMessage = error.message;
            if (error.code === 'VALIDATION_ERROR') {
                color = COLORS.WARNING;
            }
        } else if (error.code === 'InteractionAlreadyReplied') {
            // Already handled, ignore
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
    async safeReply(interaction, options) {
        try {
            if (interaction.deferred) {
                return await interaction.editReply(options);
            } else if (interaction.replied) {
                return await interaction.followUp(options);
            } else {
                return await interaction.reply(options);
            }
        } catch (error) {
            // Silently handle reply errors (interaction expired, etc.)
            logger.debug('BaseCommand', `Reply failed: ${error.message}`);
        }
    }

    /**
     * Create success embed
     */
    successEmbed(title, description) {
        return new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(`${EMOJIS.SUCCESS} ${title}`)
            .setDescription(description)
            .setTimestamp();
    }

    /**
     * Create error embed
     */
    errorEmbed(message) {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setDescription(`${EMOJIS.ERROR} ${message}`);
    }

    /**
     * Create info embed
     */
    infoEmbed(title, description) {
        return new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle(`${EMOJIS.INFO} ${title}`)
            .setDescription(description);
    }

    /**
     * Create warning embed
     */
    warningEmbed(message) {
        return new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setDescription(`${EMOJIS.WARNING} ${message}`);
    }

    /**
     * Send info reply
     */
    async infoReply(interaction, message, ephemeral = true) {
        const embed = this.infoEmbed('Info', message);
        return this.safeReply(interaction, { embeds: [embed], ephemeral });
    }

    /**
     * Send error reply
     */
    async errorReply(interaction, message, ephemeral = true) {
        const embed = this.errorEmbed(message);
        return this.safeReply(interaction, { embeds: [embed], ephemeral });
    }

    /**
     * Send success reply
     */
    async successReply(interaction, title, description, ephemeral = false) {
        const embed = this.successEmbed(title, description);
        return this.safeReply(interaction, { embeds: [embed], ephemeral });
    }

    /**
     * Send warning reply
     */
    async warningReply(interaction, message, ephemeral = true) {
        const embed = this.warningEmbed(message);
        return this.safeReply(interaction, { embeds: [embed], ephemeral });
    }
}

/**
 * Helper to create command from legacy format
 * Allows gradual migration
 */
function wrapLegacyCommand(legacyCommand) {
    return {
        ...legacyCommand,
        execute: async function(interaction) {
            try {
                await legacyCommand.execute(interaction);
            } catch (error) {
                logger.error(legacyCommand.data?.name || 'unknown', error.message);
                
                const embed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setDescription(`${EMOJIS.ERROR} An error occurred while executing this command.`);

                try {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply({ embeds: [embed], ephemeral: true });
                    } else {
                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                } catch {}
            }
        }
    };
}

module.exports = {
    BaseCommand,
    CommandCategory,
    wrapLegacyCommand,
};




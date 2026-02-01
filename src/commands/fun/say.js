/**
 * Say Command - Presentation Layer
 * Send a message as the bot
 * @module presentation/commands/fun/say
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');
const { checkAccess, AccessType } = require('../../services');

// Import services
let sayService, logger;
try {
    sayService = require('../../services/fun/say/SayService');
    logger = require('../../utils/say/logger');
} catch (e) {
    console.warn('[Say] Could not load services:', e.message);
}

// Message type colors
const TYPE_COLORS = {
    normal: COLORS.PRIMARY,
    info: COLORS.INFO,
    warning: COLORS.WARNING,
    error: COLORS.ERROR,
    success: COLORS.SUCCESS
};

class SayCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.FUN,
            cooldown: 5,
            deferReply: false,
            ephemeral: true
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('say')
            .setDescription('Send a message as the bot.')
            .addStringOption(option =>
                option.setName('message')
                    .setDescription('What should the bot say?')
                    .setRequired(true)
            )
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('Send the message to a specific channel (default: current)')
                    .setRequired(false)
            )
            .addBooleanOption(option =>
                option.setName('embed')
                    .setDescription('Send the message as an embed?')
                    .setRequired(false)
            )
            .addBooleanOption(option =>
                option.setName('credit')
                    .setDescription('Show who requested this message?')
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Type of message: normal, info, warning, error, success')
                    .setRequired(false)
                    .addChoices(
                        { name: 'Normal', value: 'normal' },
                        { name: 'Info', value: 'info' },
                        { name: 'Warning', value: 'warning' },
                        { name: 'Error', value: 'error' },
                        { name: 'Success', value: 'success' }
                    )
            );
    }

    async run(interaction) {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.reply({ embeds: [access.embed], ephemeral: true });
        }

        const message = interaction.options.getString('message');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const useEmbed = interaction.options.getBoolean('embed') || false;
        const showCredit = interaction.options.getBoolean('credit');
        const type = interaction.options.getString('type') || 'normal';

        // Validate channel
        if (sayService && !sayService.validateChannel(channel)) {
            return interaction.reply({
                content: '❌ That channel is not a text-based channel!',
                ephemeral: true
            });
        }

        // Check if bot can send messages to channel
        const permissions = channel.permissionsFor(interaction.client.user);
        if (!permissions?.has('SendMessages')) {
            return interaction.reply({
                content: '❌ I don\'t have permission to send messages in that channel!',
                ephemeral: true
            });
        }

        try {
            const safeMessage = sayService?.sanitizeMessage?.(message) || message;
            const creditText = showCredit 
                ? `\n\n*— Requested by <@${interaction.user.id}>*`
                : '';

            if (useEmbed) {
                const embed = new EmbedBuilder()
                    .setColor(TYPE_COLORS[type] || COLORS.PRIMARY)
                    .setDescription(safeMessage + creditText);

                await channel.send({ embeds: [embed] });
            } else {
                await channel.send(safeMessage + creditText);
            }

            await interaction.reply({ 
                content: `✅ Message sent to ${channel}`, 
                ephemeral: true 
            });

            // Log
            if (logger) {
                logger.log(interaction.user.tag, interaction.user.id, channel.name, channel.id, type, safeMessage);
                await logger.logToChannel(interaction.client, interaction.user.tag, interaction.user.id, channel.name, channel.id, type, safeMessage);
            }

        } catch (error) {
            console.error('[Say]', error);
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '❌ Failed to send the message.', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ Failed to send the message.', ephemeral: true });
            }
        }
    }
}

module.exports = new SayCommand();




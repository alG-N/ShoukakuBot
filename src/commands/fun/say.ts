/**
 * Say Command - Presentation Layer
 * Send a message as the bot
 * @module presentation/commands/fun/say
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ChatInputCommandInteraction,
    GuildTextBasedChannel,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { COLORS } from '../../constants.js';
import { checkAccess, AccessType } from '../../services/index.js';

// Import services
let sayService: { validateChannel: (ch: unknown) => boolean; sanitizeMessage: (msg: string) => string } | undefined;

const getDefault = <T>(mod: { default?: T } | T): T => (mod as { default?: T }).default || mod as T;

try {
    sayService = getDefault(require('../../services/fun/say/SayService'));
} catch (e) {
    console.warn('[Say] Could not load services:', (e as Error).message);
}

// Message type colors
const TYPE_COLORS: Record<string, number> = {
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

    get data(): CommandData {
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

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        const message = interaction.options.getString('message', true);
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as GuildTextBasedChannel;
        const useEmbed = interaction.options.getBoolean('embed') || false;
        const showCredit = interaction.options.getBoolean('credit');
        const type = interaction.options.getString('type') || 'normal';

        // Validate channel
        if (sayService && !sayService.validateChannel(channel)) {
            await interaction.reply({
                content: '❌ That channel is not a text-based channel!',
                ephemeral: true
            });
            return;
        }

        // Check if bot can send messages to channel
        const permissions = channel.permissionsFor(interaction.client.user!);
        if (!permissions?.has('SendMessages')) {
            await interaction.reply({
                content: '❌ I don\'t have permission to send messages in that channel!',
                ephemeral: true
            });
            return;
        }

        try {
            // Sanitize message - always sanitize even if service unavailable
            let safeMessage: string;
            if (sayService?.sanitizeMessage) {
                safeMessage = sayService.sanitizeMessage(message);
            } else {
                // Fallback sanitization: prevent @everyone/@here pings and other exploits
                safeMessage = message
                    .replace(/@(everyone|here)/gi, '@\u200b$1')
                    .replace(/<@&\d+>/g, '[role]')
                    .replace(/```/g, '\\`\\`\\`');
            }
            
            const creditText = showCredit 
                ? `\n\n*— Requested by <@${interaction.user.id}>*`
                : '';

            // Build "I am the bot" button linking to user profile
            const userProfileButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setLabel(`Sent by ${interaction.user.displayName}`)
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://discord.com/users/${interaction.user.id}`)
                    .setEmoji('👤')
            );

            if (useEmbed) {
                const embed = new EmbedBuilder()
                    .setColor(TYPE_COLORS[type] || COLORS.PRIMARY)
                    .setDescription(safeMessage + creditText);

                await channel.send({ embeds: [embed], components: [userProfileButton] });
            } else {
                await channel.send({ content: safeMessage + creditText, components: [userProfileButton] });
            }

            await interaction.reply({ 
                content: `✅ Message sent to ${channel}`, 
                ephemeral: true 
            });

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

export default new SayCommand();

"use strict";
/**
 * Say Command - Presentation Layer
 * Send a message as the bot
 * @module presentation/commands/fun/say
 */
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const BaseCommand_js_1 = require("../BaseCommand.js");
const constants_js_1 = require("../../constants.js");
const index_js_1 = require("../../services/index.js");
// Import services
let sayService;
const getDefault = (mod) => mod.default || mod;
try {
    sayService = getDefault(require('../../services/fun/say/SayService'));
}
catch (e) {
    console.warn('[Say] Could not load services:', e.message);
}
// Message type colors
const TYPE_COLORS = {
    normal: constants_js_1.COLORS.PRIMARY,
    info: constants_js_1.COLORS.INFO,
    warning: constants_js_1.COLORS.WARNING,
    error: constants_js_1.COLORS.ERROR,
    success: constants_js_1.COLORS.SUCCESS
};
class SayCommand extends BaseCommand_js_1.BaseCommand {
    constructor() {
        super({
            category: BaseCommand_js_1.CommandCategory.FUN,
            cooldown: 5,
            deferReply: false,
            ephemeral: true
        });
    }
    get data() {
        return new discord_js_1.SlashCommandBuilder()
            .setName('say')
            .setDescription('Send a message as the bot.')
            .addStringOption(option => option.setName('message')
            .setDescription('What should the bot say?')
            .setRequired(true))
            .addChannelOption(option => option.setName('channel')
            .setDescription('Send the message to a specific channel (default: current)')
            .setRequired(false))
            .addBooleanOption(option => option.setName('embed')
            .setDescription('Send the message as an embed?')
            .setRequired(false))
            .addBooleanOption(option => option.setName('credit')
            .setDescription('Show who requested this message?')
            .setRequired(false))
            .addStringOption(option => option.setName('type')
            .setDescription('Type of message: normal, info, warning, error, success')
            .setRequired(false)
            .addChoices({ name: 'Normal', value: 'normal' }, { name: 'Info', value: 'info' }, { name: 'Warning', value: 'warning' }, { name: 'Error', value: 'error' }, { name: 'Success', value: 'success' }));
    }
    async run(interaction) {
        // Access control
        const access = await (0, index_js_1.checkAccess)(interaction, index_js_1.AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed], ephemeral: true });
            return;
        }
        const message = interaction.options.getString('message', true);
        const channel = (interaction.options.getChannel('channel') || interaction.channel);
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
        const permissions = channel.permissionsFor(interaction.client.user);
        if (!permissions?.has('SendMessages')) {
            await interaction.reply({
                content: '❌ I don\'t have permission to send messages in that channel!',
                ephemeral: true
            });
            return;
        }
        try {
            // Sanitize message - always sanitize even if service unavailable
            let safeMessage;
            if (sayService?.sanitizeMessage) {
                safeMessage = sayService.sanitizeMessage(message);
            }
            else {
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
            const userProfileButton = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                .setLabel(`Sent by ${interaction.user.displayName}`)
                .setStyle(discord_js_1.ButtonStyle.Link)
                .setURL(`https://discord.com/users/${interaction.user.id}`)
                .setEmoji('👤'));
            if (useEmbed) {
                const embed = new discord_js_1.EmbedBuilder()
                    .setColor(TYPE_COLORS[type] || constants_js_1.COLORS.PRIMARY)
                    .setDescription(safeMessage + creditText);
                await channel.send({ embeds: [embed], components: [userProfileButton] });
            }
            else {
                await channel.send({ content: safeMessage + creditText, components: [userProfileButton] });
            }
            await interaction.reply({
                content: `✅ Message sent to ${channel}`,
                ephemeral: true
            });
        }
        catch (error) {
            console.error('[Say]', error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '❌ Failed to send the message.', ephemeral: true });
            }
            else {
                await interaction.reply({ content: '❌ Failed to send the message.', ephemeral: true });
            }
        }
    }
}
exports.default = new SayCommand();
//# sourceMappingURL=say.js.map
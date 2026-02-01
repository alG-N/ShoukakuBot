/**
 * Report Command - Presentation Layer
 * Submit reports to bot developers
 * @module presentation/commands/general/report
 */

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');

class ReportCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.GENERAL,
            cooldown: 60, // 1 minute cooldown to prevent spam
            deferReply: false
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('report')
            .setDescription('Report a bug or issue to the developers');
    }

    async run(interaction) {
        const modal = new ModalBuilder()
            .setCustomId(`report_submit_${interaction.user.id}`)
            .setTitle('📝 Bug Report');

        const titleInput = new TextInputBuilder()
            .setCustomId('report_title')
            .setLabel('Title')
            .setPlaceholder('Brief description of the issue')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('report_description')
            .setLabel('Description')
            .setPlaceholder('Detailed description of the bug or issue')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000);

        const stepsInput = new TextInputBuilder()
            .setCustomId('report_steps')
            .setLabel('Steps to Reproduce (Optional)')
            .setPlaceholder('1. Go to...\n2. Click on...\n3. See error')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(stepsInput)
        );

        await interaction.showModal(modal);
    }

    /**
     * Handle modal submission
     * This is called from InteractionHandler
     */
    static async handleModal(interaction) {
        const title = interaction.fields.getTextInputValue('report_title');
        const description = interaction.fields.getTextInputValue('report_description');
        const steps = interaction.fields.getTextInputValue('report_steps') || 'Not provided';

        // Get report channel from config
        let reportChannelId;
        try {
            const { REPORT_CHANNEL_ID } = require('../../config/owner');
            reportChannelId = REPORT_CHANNEL_ID;
        } catch {
            reportChannelId = null;
        }

        const reportEmbed = new EmbedBuilder()
            .setTitle(`🐛 Bug Report: ${title}`)
            .setColor(COLORS.ERROR)
            .addFields(
                { name: '👤 Reporter', value: `${interaction.user.tag}\n\`${interaction.user.id}\``, inline: true },
                { name: '🏠 Server', value: interaction.guild?.name || 'DM', inline: true },
                { name: '📅 Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📝 Description', value: description.substring(0, 1024), inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `Report ID: ${Date.now().toString(36)}` });

        if (steps !== 'Not provided') {
            reportEmbed.addFields({ 
                name: '📋 Steps to Reproduce', 
                value: steps.substring(0, 1024), 
                inline: false 
            });
        }

        // Send to report channel if configured
        let sentToChannel = false;
        if (reportChannelId) {
            try {
                const reportChannel = await interaction.client.channels.fetch(reportChannelId);
                if (reportChannel) {
                    await reportChannel.send({ embeds: [reportEmbed] });
                    sentToChannel = true;
                }
            } catch (error) {
                console.error('[Report] Failed to send to channel:', error.message);
            }
        }

        // Confirm to user
        const confirmEmbed = new EmbedBuilder()
            .setTitle('✅ Report Submitted')
            .setDescription(sentToChannel 
                ? 'Thank you for your report! Our team will review it shortly.'
                : 'Your report has been logged. Thank you!')
            .setColor(COLORS.SUCCESS)
            .setTimestamp();

        await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
    }
}

const command = new ReportCommand();
module.exports = command;
module.exports.handleModal = ReportCommand.handleModal;




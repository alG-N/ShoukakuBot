/**
 * Invite Command - Presentation Layer
 * Generate bot invite link
 * @module presentation/commands/general/invite
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChatInputCommandInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, CommandData } from '../baseCommand.js';
import { COLORS } from '../../constants.js';

class InviteCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.GENERAL,
            cooldown: 10,
            deferReply: false,
            ephemeral: true
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('invite')
            .setDescription('Invite the bot to your server');
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Get client ID
        let clientId: string;
        try {
            const { bot } = await import('../../config/index.js');
            clientId = (bot as { clientId?: string }).clientId || interaction.client.user?.id || '';
        } catch {
            clientId = interaction.client.user?.id || '';
        }

        // Generate invite URLs with different permission sets
        const fullInvite = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&integration_type=0&scope=bot+applications.commands`;
        const musicInvite = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=36768832&integration_type=0&scope=bot+applications.commands`;
        const basicInvite = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=274878024704&integration_type=0&scope=bot+applications.commands`;

        const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle('🤖 Invite Shoukaku')
            .setDescription('Choose an invite option based on your needs:')
            .setThumbnail(interaction.client.user?.displayAvatarURL({ size: 256 }) || null)
            .addFields(
                { 
                    name: '👑 Full Access', 
                    value: 'Administrator permissions - All features enabled',
                    inline: false 
                },
                { 
                    name: '🎵 Music Only', 
                    value: 'Voice, embed, and message permissions',
                    inline: false 
                },
                { 
                    name: '📋 Basic', 
                    value: 'Minimal permissions for utility commands',
                    inline: false 
                }
            )
            .setFooter({ text: 'Thank you for using Shoukaku! 💖' })
            .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Full Access')
                    .setStyle(ButtonStyle.Link)
                    .setURL(fullInvite)
                    .setEmoji('👑'),
                new ButtonBuilder()
                    .setLabel('Music Only')
                    .setStyle(ButtonStyle.Link)
                    .setURL(musicInvite)
                    .setEmoji('🎵'),
                new ButtonBuilder()
                    .setLabel('Basic')
                    .setStyle(ButtonStyle.Link)
                    .setURL(basicInvite)
                    .setEmoji('📋')
            );

        await interaction.reply({ 
            embeds: [embed], 
            components: [row],
            ephemeral: true 
        });
    }
}

export default new InviteCommand();


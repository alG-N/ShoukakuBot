/**
 * Display Command - Presentation Layer
 * Change your server display name (nickname)
 * @module commands/general/display
 */

import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    GuildMember,
} from 'discord.js';
import { BaseCommand, CommandCategory, CommandData } from '../baseCommand.js';
import { COLORS } from '../../constants.js';

const MAX_NICKNAME_LENGTH = 32;

class DisplayCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.GENERAL,
            cooldown: 10,
            guildOnly: true,
            deferReply: false,
            botPermissions: [PermissionFlagsBits.ManageNicknames],
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('display')
            .setDescription('Change your display name (server nickname)')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription(`Your new display name (max ${MAX_NICKNAME_LENGTH} chars). Leave empty to reset.`)
                    .setRequired(false)
                    .setMinLength(1)
                    .setMaxLength(MAX_NICKNAME_LENGTH)
            );
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        const newName = interaction.options.getString('name');
        const guild = interaction.guild!;
        const targetMember = interaction.member as GuildMember;

        const oldName = targetMember.displayName;
        const isResetting = newName === null;

        try {
            await guild.members.edit(targetMember, {
                nick: newName ?? null,
                reason: `${interaction.user.tag} used /display`,
            });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            await interaction.reply({
                content: `❌ Failed to change the display name.\n\`\`\`${detail}\`\`\``,
                ephemeral: true,
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(isResetting ? COLORS.WARNING : COLORS.SUCCESS)
            .setTitle(isResetting ? '🔄 Display Name Reset' : '✏️ Display Name Changed')
            .addFields(
                { name: 'Before', value: oldName || '*None*', inline: true },
                { name: 'After', value: isResetting ? '*Reset to default*' : (newName ?? '*None*'), inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

const command = new DisplayCommand();
export default command;

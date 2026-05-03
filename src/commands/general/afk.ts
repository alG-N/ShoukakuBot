/**
 * AFK Command - Presentation Layer
 * Set AFK status (guild or global)
 * Uses AfkRepository for PostgreSQL-backed storage (shard-safe)
 * @module presentation/commands/general/afk
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ChatInputCommandInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, CommandData } from '../baseCommand.js';
import afkRepository, { type AfkInfo } from '../../repositories/general/afkRepository.js';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format duration from seconds to readable string
 */
export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours < 24) {
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/**
 * Remove user from AFK (exported for external use)
 */
export async function removeAfk(userId: string, guildId: string | null = null): Promise<AfkInfo | null> {
    return afkRepository.removeAfk(userId, guildId);
}

// ============================================================================
// COMMAND CLASS
// ============================================================================

class AfkCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.GENERAL,
            cooldown: 10,
            deferReply: false
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('afk')
            .setDescription('Set your AFK status')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('AFK type')
                    .addChoices(
                        { name: 'guild', value: 'guild' },
                        { name: 'global', value: 'global' }
                    )
            )
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for being AFK')
                    .setMaxLength(200)
            );
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        const userId = interaction.user.id;
        const guildId = interaction.guild?.id || null;
        const type = (interaction.options.getString('type') || 'guild') as 'guild' | 'global';
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        const success = await afkRepository.setAfk({
            userId,
            guildId: type === 'global' ? null : guildId,
            reason,
            type
        });

        if (!success) {
            await interaction.reply({
                content: '❌ Failed to set AFK status. Please try again.',
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x8A2BE2)
            .setTitle('AFK mode activated!')
            .setDescription(`**Type:** ${type}\n**Reason:** ${reason}`)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setFooter({
                text: 'I will let others know if they mention you 💬',
                iconURL: interaction.client.user?.displayAvatarURL()
            });

        await interaction.reply({ embeds: [embed] });
    }
}

// Export command and utility functions
const command = new AfkCommand();
export default command;


/**
 * History Handler
 * Handles listening history
 * @module handlers/music/historyHandler
 */

import { ChatInputCommandInteraction } from 'discord.js';
import { trackHandler } from './trackHandler.js';
import { checkVoiceChannel, checkVoicePermissions } from '../../middleware/voiceChannelCheck.js';
import { musicFacade as musicService } from '../../services/music/core/MusicFacade.js';

// Use any for Track type - different but runtime compatible
type Track = any;
export type HistorySubcommand = 'list' | 'play' | 'clear';
export const historyHandler = {
    async handleHistory(interaction: ChatInputCommandInteraction, subcommand: HistorySubcommand, userId: string): Promise<void> {
        switch (subcommand) {
            case 'list':
                return await this.handleHistoryList(interaction, userId);
            case 'play':
                return await this.handleHistoryPlay(interaction, userId);
            case 'clear':
                return await this.handleHistoryClear(interaction, userId);
        }
    },

    async handleHistoryList(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        const history = await musicService.getHistory(userId, 100) as Track[];
        const page = interaction.options.getInteger('page') || 1;

        const embed = trackHandler.createHistoryEmbed(history, userId, page);
        await interaction.reply({ embeds: [embed] });
    },

    async handleHistoryPlay(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        const number = interaction.options.getInteger('number')!;
        const history = await musicService.getHistory(userId, 100) as Track[];

        if (number > history.length) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed(`Invalid number. History only has ${history.length} items.`)],
                ephemeral: true
            });
            return;
        }

        const historyItem = history[number - 1];
        
        if (!await checkVoiceChannel(interaction)) return;
        if (!await checkVoicePermissions(interaction)) return;

        await interaction.deferReply();

        const guildId = interaction.guild!.id;
        await musicService.connect(interaction);

        const trackData = await musicService.search(historyItem.url) as Track | null;
        
        if (!trackData) {
            await interaction.editReply({
                embeds: [trackHandler.createErrorEmbed('Failed to load track')]
            });
            return;
        }

        musicService.addTrack(guildId, trackData);

        const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
        if (!currentTrack) {
            const queue = musicService.getQueueList(guildId) as Track[];
            const nextTrack = queue[0];
            if (nextTrack) {
                musicService.removeTrack(guildId, 0);
                await musicService.playTrack(guildId, nextTrack);
            }
        }

        const position = currentTrack ? musicService.getQueueLength(guildId) : 0;
        const embed = trackHandler.createQueuedEmbed(trackData, position, interaction.user);
        await interaction.editReply({ embeds: [embed] });
    },

    async handleHistoryClear(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        await musicService.clearHistory(userId);
        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed('🗑️ Cleared', 'Listening history cleared', 'success')]
        });
    }
};

export default historyHandler;

/**
 * Favorites Handler
 * Handles favorites management
 * @module handlers/music/favoritesHandler
 */

import { ChatInputCommandInteraction } from 'discord.js';
import { trackHandler } from './trackHandler.js';
import { checkVoiceChannel, checkVoicePermissions } from '../../middleware/voiceChannelCheck.js';
import { musicFacade as musicService } from '../../services/music/core/MusicFacade.js';

// Use any for Track type - different but runtime compatible
type Track = any;
export type FavoritesSubcommand = 'list' | 'play' | 'remove' | 'clear';
export const favoritesHandler = {
    async handleFavorites(interaction: ChatInputCommandInteraction, subcommand: FavoritesSubcommand, userId: string): Promise<void> {
        switch (subcommand) {
            case 'list':
                return await this.handleFavoritesList(interaction, userId);
            case 'play':
                return await this.handleFavoritesPlay(interaction, userId);
            case 'remove':
                return await this.handleFavoritesRemove(interaction, userId);
            case 'clear':
                return await this.handleFavoritesClear(interaction, userId);
        }
    },

    async handleFavoritesList(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        const favorites = await musicService.getFavorites(userId) as Track[];
        const page = interaction.options.getInteger('page') || 1;

        const embed = trackHandler.createFavoritesEmbed(favorites, userId, page);
        await interaction.reply({ embeds: [embed] });
    },

    async handleFavoritesPlay(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        const number = interaction.options.getInteger('number')!;
        const favorites = await musicService.getFavorites(userId) as Track[];

        if (number > favorites.length) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed(`Invalid number. You only have ${favorites.length} favorites.`)],
                ephemeral: true
            });
            return;
        }

        const favorite = favorites[number - 1];
        
        if (!await checkVoiceChannel(interaction)) return;
        if (!await checkVoicePermissions(interaction)) return;

        await interaction.deferReply();

        const guildId = interaction.guild!.id;
        await musicService.connect(interaction);

        const trackData = await musicService.search(favorite.url) as Track | null;
        
        if (!trackData) {
            await interaction.editReply({
                embeds: [trackHandler.createErrorEmbed('Failed to load favorite track')]
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

    async handleFavoritesRemove(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        const number = interaction.options.getInteger('number')!;
        const favorites = await musicService.getFavorites(userId) as Track[];

        if (number > favorites.length) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed(`Invalid number. You only have ${favorites.length} favorites.`)],
                ephemeral: true
            });
            return;
        }

        const removed = favorites[number - 1];
        await musicService.removeFavorite(userId, removed.url);

        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed('💔 Removed', `Removed **${removed.title}** from favorites`, 'success')]
        });
    },

    async handleFavoritesClear(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        const favorites = await musicService.getFavorites(userId) as Track[];
        if (favorites.length === 0) {
            await interaction.reply({
                embeds: [trackHandler.createInfoEmbed('💖 Favorites', 'You have no favorites to clear.')],
                ephemeral: true
            });
            return;
        }

        // Clear all favorites
        for (const fav of favorites) {
            await musicService.removeFavorite(userId, fav.url);
        }

        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed('🗑️ Cleared', 'All favorites have been cleared', 'success')]
        });
    }
};

export default favoritesHandler;

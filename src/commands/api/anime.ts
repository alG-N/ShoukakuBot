/**
 * Anime Command - Presentation Layer
 * Search anime/manga on AniList and MyAnimeList
 * @module presentation/commands/api/anime
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { COLORS } from '../../constants.js';
import { checkAccess, AccessType } from '../../services/index.js';
import { getDefault } from '../../utils/common/moduleHelper.js';
// TYPES
interface AnimeTitle {
    english?: string;
    romaji?: string;
    native?: string;
    default?: string;
}

interface Anime {
    id: number;
    idMal?: number;
    title?: AnimeTitle | string;
    siteUrl?: string;
    url?: string;
    name?: string;
}

interface Favourite {
    title: string;
    source: string;
}

interface AnilistService {
    searchAnime: (name: string) => Promise<Anime | null>;
    searchAnimeAutocomplete: (query: string) => Promise<Anime[]>;
}

interface MyAnimeListService {
    searchMedia: (name: string, type: string) => Promise<Anime | null>;
    searchMediaAutocomplete: (query: string, type: string) => Promise<Anime[]>;
}

interface AnimeHandler {
    createMediaEmbed: (anime: Anime, source: string, mediaType: string) => Promise<EmbedBuilder>;
}

interface AnimeRepository {
    getUserFavourites: (userId: string) => Promise<Favourite[]>;
    isFavourited: (userId: string, animeId: number | string) => Promise<boolean>;
    addFavourite: (userId: string, animeId: number | string, title: string, source?: string) => Promise<void>;
    removeFavourite: (userId: string, animeId: number | string) => Promise<void>;
}

interface CachedAnime {
    anime: Anime;
    source: string;
    mediaType: string;
    timestamp: number;
}

interface AutocompleteCache {
    results: Array<{ name: string; value: string }>;
    timestamp: number;
}
// SERVICE IMPORTS
let anilistService: AnilistService | undefined;
let myAnimeListService: MyAnimeListService | undefined;
let animeHandler: AnimeHandler | undefined;
let animeRepository: AnimeRepository | undefined;


try {
    anilistService = getDefault(require('../../services/api/anilistService'));
    myAnimeListService = getDefault(require('../../services/api/myAnimeListService'));
    animeHandler = getDefault(require('../../handlers/api/animeHandler'));
    animeRepository = getDefault(require('../../repositories/api/animeRepository'));
} catch (e) {
    console.warn('[Anime] Could not load services:', (e as Error).message);
}
// CACHE
const autocompleteCache = new Map<string, AutocompleteCache>();
const searchResultCache = new Map<string, CachedAnime>();
const AUTOCOMPLETE_CACHE_DURATION = 60000;
const SEARCH_CACHE_DURATION = 600000;

// Cleanup
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of autocompleteCache) {
        if (now - value.timestamp > AUTOCOMPLETE_CACHE_DURATION) {
            autocompleteCache.delete(key);
        }
    }
    for (const [key, value] of searchResultCache) {
        if (now - value.timestamp > SEARCH_CACHE_DURATION) {
            searchResultCache.delete(key);
        }
    }
}, 120000);

// MAL media types
const MAL_TYPES: Record<string, { emoji: string; label: string; endpoint: string }> = {
    anime: { emoji: '📺', label: 'Anime', endpoint: 'anime' },
    manga: { emoji: '📚', label: 'Manga', endpoint: 'manga' },
    lightnovel: { emoji: '📖', label: 'Light Novel', endpoint: 'manga' },
    webnovel: { emoji: '💻', label: 'Web Novel', endpoint: 'manga' },
    oneshot: { emoji: '📄', label: 'One-shot', endpoint: 'manga' }
};
// COMMAND
class AnimeCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: true
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('anime')
            .setDescription('Search for anime and manga')
            .addSubcommand(sub => sub
                .setName('search')
                .setDescription('Search for anime on AniList')
                .addStringOption(opt => opt
                    .setName('name')
                    .setDescription('Anime name to search')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
            )
            .addSubcommand(sub => sub
                .setName('mal')
                .setDescription('Search on MyAnimeList')
                .addStringOption(opt => opt
                    .setName('name')
                    .setDescription('Title to search')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
                .addStringOption(opt => opt
                    .setName('type')
                    .setDescription('Media type')
                    .setRequired(false)
                    .addChoices(
                        { name: '📺 Anime', value: 'anime' },
                        { name: '📚 Manga', value: 'manga' },
                        { name: '📖 Light Novel', value: 'lightnovel' },
                        { name: '💻 Web Novel', value: 'webnovel' },
                        { name: '📄 One-shot', value: 'oneshot' }
                    )
                )
            )
            .addSubcommand(sub => sub
                .setName('favourites')
                .setDescription('View your favourite anime/manga')
            );
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'search':
                await this._searchAniList(interaction);
                break;
            case 'mal':
                await this._searchMAL(interaction);
                break;
            case 'favourites':
                await this._showFavourites(interaction);
                break;
        }
    }

    private async _searchAniList(interaction: ChatInputCommandInteraction): Promise<void> {
        const animeName = interaction.options.getString('name', true);

        try {
            const result = await anilistService!.searchAnime(animeName);
            if (!result) {
                await this.errorReply(interaction, `Could not find anime: **${animeName}**`);
                return;
            }

            const embed = await animeHandler!.createMediaEmbed(result, 'anilist', 'anime');
            const row = await this._createActionRow(result, 'anilist', 'anime', interaction.user.id);

            searchResultCache.set(interaction.user.id, {
                anime: result,
                source: 'anilist',
                mediaType: 'anime',
                timestamp: Date.now()
            });

            await this.safeReply(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            console.error('[Anime Search]', error);
            await this.errorReply(interaction, `Could not find anime: **${animeName}**`);
        }
    }

    private async _searchMAL(interaction: ChatInputCommandInteraction): Promise<void> {
        const name = interaction.options.getString('name', true);
        const mediaType = interaction.options.getString('type') || 'anime';

        try {
            const result = await myAnimeListService!.searchMedia(name, mediaType);
            if (!result) {
                const typeLabel = MAL_TYPES[mediaType]?.label || 'anime';
                await this.errorReply(interaction, `Could not find ${typeLabel}: **${name}** on MyAnimeList`);
                return;
            }

            const embed = await animeHandler!.createMediaEmbed(result, 'mal', mediaType);
            const row = await this._createActionRow(result, 'mal', mediaType, interaction.user.id);

            searchResultCache.set(interaction.user.id, {
                anime: result,
                source: 'mal',
                mediaType,
                timestamp: Date.now()
            });

            await this.safeReply(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            console.error('[MAL Search]', error);
            const typeLabel = MAL_TYPES[mediaType]?.label || 'anime';
            await this.errorReply(interaction, `Could not find ${typeLabel}: **${name}** on MyAnimeList`);
        }
    }

    private async _showFavourites(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const favourites = await animeRepository!.getUserFavourites(interaction.user.id);
            
            if (!favourites || favourites.length === 0) {
                await this.infoReply(interaction, 'You have no favourite anime/manga yet. Use the ⭐ button on search results to add some!');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.PRIMARY)
                .setTitle('⭐ Your Favourites')
                .setDescription(favourites.slice(0, 20).map((f, i) => 
                    `${i + 1}. **${f.title}** (${f.source})`
                ).join('\n'))
                .setFooter({ text: `Total: ${favourites.length} favourites` });

            await this.safeReply(interaction, { embeds: [embed] });
        } catch (error) {
            console.error('[Anime Favourites]', error);
            await this.errorReply(interaction, 'Failed to fetch favourites.');
        }
    }

    private async _createActionRow(anime: Anime, source: string, mediaType: string, userId: string): Promise<ActionRowBuilder<ButtonBuilder>> {
        const typeInfo = MAL_TYPES[mediaType] || MAL_TYPES.anime;
        const animeId = anime.id || anime.idMal;
        
        let buttonLabel: string;
        let buttonEmoji: string;
        let url: string;
        
        if (source === 'mal') {
            buttonLabel = `View on MyAnimeList`;
            buttonEmoji = '📗';
            url = anime.url || `https://myanimelist.net/${typeInfo.endpoint}/${animeId}`;
        } else {
            buttonLabel = 'View on AniList';
            buttonEmoji = '📘';
            url = anime.siteUrl || `https://anilist.co/anime/${animeId}`;
        }

        let isFavourited = false;
        try {
            isFavourited = await animeRepository!.isFavourited(userId, animeId!);
        } catch (e) { /* ignore */ }
        
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel(buttonLabel)
                .setStyle(ButtonStyle.Link)
                .setEmoji(buttonEmoji)
                .setURL(url),
            new ButtonBuilder()
                .setCustomId(`anime_fav_${animeId}`)
                .setLabel(isFavourited ? 'Remove from Favourites' : 'Add to Favourites')
                .setStyle(isFavourited ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setEmoji(isFavourited ? '💔' : '⭐')
        );
    }

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const focusedValue = interaction.options.getFocused();
        const subcommand = interaction.options.getSubcommand();

        if (focusedValue.length < 2) {
            await interaction.respond([]);
            return;
        }

        const cacheKey = `${subcommand}_${focusedValue.toLowerCase()}`;
        const cached = autocompleteCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < AUTOCOMPLETE_CACHE_DURATION) {
            await interaction.respond(cached.results);
            return;
        }

        try {
            let results: Array<{ name: string; value: string }> = [];
            
            if (subcommand === 'search') {
                const suggestions = await anilistService!.searchAnimeAutocomplete(focusedValue);
                results = suggestions.slice(0, 25).map(s => {
                    const titleObj = s.title as AnimeTitle | undefined;
                    const title = titleObj?.english || titleObj?.romaji || titleObj?.native || 'Unknown';
                    return {
                        name: title.length > 100 ? title.slice(0, 97) + '...' : title,
                        value: title.slice(0, 100)
                    };
                });
            } else if (subcommand === 'mal') {
                const mediaType = interaction.options.getString('type') || 'anime';
                const suggestions = await myAnimeListService!.searchMediaAutocomplete(focusedValue, mediaType);
                results = suggestions.slice(0, 25).map(s => {
                    const titleObj = s.title;
                    const title = typeof titleObj === 'string' 
                        ? titleObj 
                        : ((titleObj as AnimeTitle)?.english || (titleObj as AnimeTitle)?.romaji || (titleObj as AnimeTitle)?.default || s.name || 'Unknown');
                    return {
                        name: title.length > 100 ? title.slice(0, 97) + '...' : title,
                        value: title.slice(0, 100)
                    };
                });
            }

            autocompleteCache.set(cacheKey, { results, timestamp: Date.now() });
            await interaction.respond(results);
        } catch (error) {
            console.error('[Anime Autocomplete]', error);
            await interaction.respond([]);
        }
    }

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        const parts = interaction.customId.split('_');
        const action = parts[1]; // 'fav'
        const animeId = parts[2];
        const userId = interaction.user.id;

        if (action === 'fav') {
            try {
                await interaction.deferUpdate();

                const cached = searchResultCache.get(userId);
                let animeTitle = 'Unknown';
                let source = 'anilist';
                
                if (cached && cached.anime) {
                    const anime = cached.anime;
                    source = cached.source;
                    const titleObj = anime.title;
                    animeTitle = typeof titleObj === 'string' 
                        ? titleObj 
                        : ((titleObj as AnimeTitle)?.english || (titleObj as AnimeTitle)?.romaji || (titleObj as AnimeTitle)?.native || 'Unknown');
                }

                const isFav = await animeRepository!.isFavourited(userId, animeId);
                
                if (isFav) {
                    await animeRepository!.removeFavourite(userId, animeId);
                    
                    const row = await this._createActionRow(
                        cached?.anime || { id: parseInt(animeId) }, 
                        source, 
                        cached?.mediaType || 'anime', 
                        userId
                    );
                    
                    await interaction.editReply({ components: [row] });
                    await interaction.followUp({ 
                        content: `💔 Removed **${animeTitle}** from favourites`, 
                        ephemeral: true 
                    });
                } else {
                    await animeRepository!.addFavourite(userId, animeId, animeTitle, source);
                    
                    const row = await this._createActionRow(
                        cached?.anime || { id: parseInt(animeId) }, 
                        source, 
                        cached?.mediaType || 'anime', 
                        userId
                    );
                    
                    await interaction.editReply({ components: [row] });
                    await interaction.followUp({ 
                        content: `⭐ Added **${animeTitle}** to favourites!`, 
                        ephemeral: true 
                    });
                }
            } catch (error) {
                console.error('[Anime Favourite]', error);
                await interaction.followUp({ 
                    content: '❌ Failed to update favourites. Please try again.', 
                    ephemeral: true 
                }).catch(() => {});
            }
        }
    }
}

export default new AnimeCommand();

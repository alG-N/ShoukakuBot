/**
 * Anime Command - Presentation Layer
 * Search anime/manga on AniList and MyAnimeList
 * @module presentation/commands/anime
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
import { BaseCommand, CommandCategory, CommandData } from './BaseCommand.js';
import { COLORS } from '../constants.js';
import cacheService from '../cache/CacheService.js';
import { checkAccess, AccessType } from '../services/index.js';
import _anilistService from '../services/api/anilistService.js';
import _myAnimeListService from '../services/api/myAnimeListService.js';
import * as _animeHandler from '../handlers/api/anime/index.js';
import _animeRepository from '../repositories/api/animeRepository.js';
import logger from '../core/Logger.js';
import type {
    AnimeCommandTitle,
    AnimeLookupItem as Anime,
    AnimeCachedSearch as CachedAnime,
    TimedAutocompleteCache as AutocompleteCache
} from '../types/api/models/content-session.js';
import type { AnimeContentSource, MALMediaType, MALTypeDisplay } from '../types/api/models/mal.js';
import type {
    AnilistService,
    MyAnimeListService,
    AnimeHandler,
    AnimeRepository
} from '../types/commands/external/anime-command.js';

// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const anilistService: AnilistService = _anilistService as any;
const myAnimeListService: MyAnimeListService = _myAnimeListService as any;
const animeHandler: AnimeHandler = _animeHandler as any;
const animeRepository: AnimeRepository = _animeRepository as any;
// CACHE
const autocompleteCache = new Map<string, AutocompleteCache>();
const searchResultCache = new Map<string, CachedAnime>();
const AUTOCOMPLETE_CACHE_DURATION = 60000;
const SEARCH_CACHE_DURATION = 600000;
const ANIME_SEARCH_CACHE_NS = 'api:anime';
const SEARCH_CACHE_TTL_SECONDS = Math.floor(SEARCH_CACHE_DURATION / 1000);

function resolveAnimeCacheId(anime: Partial<Anime> | null | undefined): string | null {
    const animeId = anime?.id ?? anime?.idMal;
    if (animeId === null || animeId === undefined) {
        return null;
    }
    return String(animeId);
}

function buildSearchResultCacheKey(userId: string, source: AnimeContentSource, animeId: string): string {
    return `anime:search:${userId}:${source}:${animeId}`;
}

async function setCachedSearchResult(userId: string, cached: CachedAnime): Promise<void> {
    const animeId = resolveAnimeCacheId(cached.anime);
    if (!animeId) {
        return;
    }

    const cacheKey = buildSearchResultCacheKey(userId, cached.source, animeId);
    searchResultCache.set(cacheKey, cached);
    await cacheService.set<CachedAnime>(
        ANIME_SEARCH_CACHE_NS,
        cacheKey,
        cached,
        SEARCH_CACHE_TTL_SECONDS
    );
}

async function getCachedSearchResult(userId: string, source: AnimeContentSource, animeId: string): Promise<CachedAnime | null> {
    const cacheKey = buildSearchResultCacheKey(userId, source, animeId);
    const local = searchResultCache.get(cacheKey);
    if (local) {
        if (Date.now() - local.timestamp < SEARCH_CACHE_DURATION) {
            return local;
        }
        searchResultCache.delete(cacheKey);
    }

    const cached = await cacheService.peek<CachedAnime>(ANIME_SEARCH_CACHE_NS, cacheKey);
    if (cached) {
        searchResultCache.set(cacheKey, cached);
        return cached;
    }

    return null;
}

// Cleanup
const cacheCleanupTimer = setInterval(() => {
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
cacheCleanupTimer.unref(); // Don't prevent process exit

// MAL media types
const MAL_TYPES: Record<MALMediaType, MALTypeDisplay> = {
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

            await setCachedSearchResult(interaction.user.id, {
                anime: result,
                source: 'anilist',
                mediaType: 'anime',
                timestamp: Date.now()
            });

            await this.safeReply(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            logger.error('Anime', `Search error: ${(error as Error).message}`);
            await this.errorReply(interaction, `Could not find anime: **${animeName}**`);
        }
    }

    private async _searchMAL(interaction: ChatInputCommandInteraction): Promise<void> {
        const name = interaction.options.getString('name', true);
        const mediaType = (interaction.options.getString('type') || 'anime') as MALMediaType;

        try {
            const result = await myAnimeListService!.searchMedia(name, mediaType);
            if (!result) {
                const typeLabel = MAL_TYPES[mediaType]?.label || 'anime';
                await this.errorReply(interaction, `Could not find ${typeLabel}: **${name}** on MyAnimeList`);
                return;
            }

            const embed = await animeHandler!.createMediaEmbed(result, 'mal', mediaType);
            const row = await this._createActionRow(result, 'mal', mediaType, interaction.user.id);

            await setCachedSearchResult(interaction.user.id, {
                anime: result,
                source: 'mal',
                mediaType,
                timestamp: Date.now()
            });

            await this.safeReply(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            logger.error('Anime', `MAL search error: ${(error as Error).message}`);
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
            logger.error('Anime', `Favourites error: ${(error as Error).message}`);
            await this.errorReply(interaction, 'Failed to fetch favourites.');
        }
    }

    private async _createActionRow(anime: Anime, source: AnimeContentSource, mediaType: MALMediaType, userId: string): Promise<ActionRowBuilder<ButtonBuilder>> {
        const typeInfo = MAL_TYPES[mediaType] || MAL_TYPES.anime;
        const animeId = resolveAnimeCacheId(anime);
        if (!animeId) {
            throw new Error('Anime result is missing an ID');
        }
        
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
                .setCustomId(`anime_fav_${source}_${animeId}`)
                .setLabel(isFavourited ? 'Remove from Favourites' : 'Add to Favourites')
                .setStyle(isFavourited ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setEmoji(isFavourited ? '💔' : '⭐')
        );
    }

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const isIgnorableInteractionError = (error: unknown): boolean => {
            const err = error as { code?: number; message?: string };
            return err?.code === 10062 || err?.code === 40060 
                || err?.message === 'Unknown interaction'
                || err?.message?.includes('already been acknowledged') === true;
        };

        const safeRespond = async (choices: Array<{ name: string; value: string }>): Promise<void> => {
            try {
                if ((interaction as { responded?: boolean }).responded) return;
                await interaction.respond(choices);
            } catch (error) {
                if (isIgnorableInteractionError(error)) {
                    logger.debug('Anime', `Autocomplete respond expired (normal during fast typing)`);
                    return;
                }
                throw error;
            }
        };

        const focusedValue = interaction.options.getFocused();
        const subcommand = interaction.options.getSubcommand();

        if (focusedValue.length < 2) {
            await safeRespond([]);
            return;
        }

        const cacheKey = `${subcommand}_${focusedValue.toLowerCase()}`;
        const cached = autocompleteCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < AUTOCOMPLETE_CACHE_DURATION) {
            await safeRespond(cached.results);
            return;
        }

        try {
            let results: Array<{ name: string; value: string }> = [];
            
            if (subcommand === 'search') {
                const raw = await anilistService!.searchAnimeAutocomplete(focusedValue);
                const suggestions = Array.isArray(raw) ? raw : [];
                results = suggestions.slice(0, 25).map(s => {
                    const titleObj = s.title as AnimeCommandTitle | undefined;
                    const title = titleObj?.english || titleObj?.romaji || titleObj?.native || 'Unknown';
                    return {
                        name: title.length > 100 ? title.slice(0, 97) + '...' : title,
                        value: title.slice(0, 100)
                    };
                });
            } else if (subcommand === 'mal') {
                const mediaType = (interaction.options.getString('type') || 'anime') as MALMediaType;
                const raw = await myAnimeListService!.searchMediaAutocomplete(focusedValue, mediaType);
                const suggestions = Array.isArray(raw) ? raw : [];
                results = suggestions.slice(0, 25).map(s => {
                    const titleObj = s.title;
                    const title = typeof titleObj === 'string' 
                        ? titleObj 
                        : ((titleObj as AnimeCommandTitle)?.english || (titleObj as AnimeCommandTitle)?.romaji || (titleObj as AnimeCommandTitle)?.default || s.name || 'Unknown');
                    return {
                        name: title.length > 100 ? title.slice(0, 97) + '...' : title,
                        value: title.slice(0, 100)
                    };
                });
            }

            autocompleteCache.set(cacheKey, { results, timestamp: Date.now() });
            await safeRespond(results);
        } catch (error) {
            if (isIgnorableInteractionError(error)) {
                logger.warn('Anime', `Autocomplete interaction lifecycle issue: ${(error as Error).message}`);
                return;
            }

            logger.error('Anime', `Autocomplete error: ${(error as Error).message}`);

            try {
                await safeRespond([]);
            } catch (fallbackError) {
                if (!isIgnorableInteractionError(fallbackError)) {
                    throw fallbackError;
                }
            }
        }
    }

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        const isIgnorableInteractionError = (error: unknown): boolean => {
            const err = error as { code?: number; message?: string };
            return err?.code === 10062 || err?.code === 40060 || err?.message === 'Unknown interaction';
        };

        const safeFollowUp = async (content: string): Promise<void> => {
            if (!interaction.deferred && !interaction.replied) return;
            await interaction.followUp({ content, ephemeral: true });
        };

        const inferSourceFromMessage = (): AnimeContentSource | null => {
            for (const row of interaction.message.components) {
                const components = (row as unknown as { components?: Array<{ url?: string }> }).components || [];
                for (const component of components) {
                    if (typeof component.url === 'string') {
                        if (component.url.includes('myanimelist.net')) return 'mal';
                        if (component.url.includes('anilist.co')) return 'anilist';
                    }
                }
            }
            return null;
        };

        const parts = interaction.customId.split('_');
        const action = parts[1]; // 'fav'
        const sourceFromId = parts[2] === 'anilist' || parts[2] === 'mal'
            ? parts[2] as AnimeContentSource
            : null;
        const animeId = sourceFromId ? parts[3] : parts[2];
        const userId = interaction.user.id;

        if (!animeId) {
            await interaction.reply({ content: '❌ Invalid anime action.', ephemeral: true }).catch(() => {});
            return;
        }

        if (action === 'fav') {
            try {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }

                let source: AnimeContentSource = sourceFromId || inferSourceFromMessage() || 'anilist';
                let cached = await getCachedSearchResult(userId, source, animeId);

                if (!cached && !sourceFromId) {
                    const fallbackSource = source === 'anilist' ? 'mal' : 'anilist';
                    const fallbackCached = await getCachedSearchResult(userId, fallbackSource, animeId);
                    if (fallbackCached) {
                        cached = fallbackCached;
                        source = fallbackSource;
                    }
                }

                let animeTitle = 'Unknown';
                
                if (cached && cached.anime) {
                    const anime = cached.anime;
                    source = cached.source;
                    const titleObj = anime.title;
                    animeTitle = typeof titleObj === 'string' 
                        ? titleObj 
                        : ((titleObj as AnimeCommandTitle)?.english || (titleObj as AnimeCommandTitle)?.romaji || (titleObj as AnimeCommandTitle)?.native || 'Unknown');
                }

                const isFav = await animeRepository!.isFavourited(userId, animeId);
                
                if (isFav) {
                    await animeRepository!.removeFavourite(userId, animeId);
                    
                    const row = await this._createActionRow(
                        cached?.anime || { id: parseInt(animeId, 10) }, 
                        source, 
                        cached?.mediaType || 'anime', 
                        userId
                    );
                    
                    await interaction.editReply({ components: [row] });
                    await safeFollowUp(`💔 Removed **${animeTitle}** from favourites`);
                } else {
                    await animeRepository!.addFavourite(userId, animeId, animeTitle, source);
                    
                    const row = await this._createActionRow(
                        cached?.anime || { id: parseInt(animeId, 10) }, 
                        source, 
                        cached?.mediaType || 'anime', 
                        userId
                    );
                    
                    await interaction.editReply({ components: [row] });
                    await safeFollowUp(`⭐ Added **${animeTitle}** to favourites!`);
                }
            } catch (error) {
                if (isIgnorableInteractionError(error)) {
                    logger.warn('Anime', `Favourite toggle interaction lifecycle issue: ${(error as Error).message}`);
                    return;
                }

                logger.error('Anime', `Favourite toggle error: ${(error as Error).message}`);

                try {
                    await safeFollowUp('❌ Failed to update favourites. Please try again.');
                } catch (followUpError) {
                    if (!isIgnorableInteractionError(followUpError)) {
                        logger.error('Anime', `Favourite toggle follow-up error: ${(followUpError as Error).message}`);
                    }
                }
            }
        }
    }
}

export default new AnimeCommand();







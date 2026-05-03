import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ComponentType,
    EmbedBuilder,
    ModalBuilder,
    ModalSubmitInteraction,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import logger from '../../../core/observability/Logger.js';
import nhentaiService from '../../../services/api/nhentaiService.js';
import nhentaiRepository, { NHentaiFavourite, NHentaiGallery } from '../../../repositories/api/nhentaiRepository.js';
import type { SearchData } from '../../../types/api/nhentai/model.js';
import type {
    FavouritesData,
    Gallery,
    PageSession,
    SearchSession,
    UserPreferences
} from '../../../types/api/nhentai/handler.js';
// applyTranslatedTitle no longer needed — translate now finds the English version

type GalleryResponseOptions = {
    isRandom?: boolean;
    isPopular?: boolean;
    popularPeriod?: string;
    spoilerCover?: boolean;
};

const FETCHING_GIF_URL = 'https://media.discordapp.net/attachments/1458402483448840225/1497112513790083122/aq0fly.gif?ex=69ec562e&is=69eb04ae&hm=e65a0cfef2c989d54df6462d210bf06b0881760e85723e9c0f4a5fe651111fd7&=&width=405&height=224';

export interface NhentaiButtonInteractionDeps {
    sessionTtl: number;
    createErrorEmbed: (message: string) => EmbedBuilder;
    getPageSession: (userId: string, sessionId?: string) => Promise<PageSession | null>;
    setPageSession: (userId: string, gallery: Gallery, currentPage?: number, sessionId?: string) => Promise<void>;
    updatePageSession: (userId: string, currentPage: number, sessionId?: string) => Promise<void>;
    createPageResponse: (gallery: Gallery, pageNum: number) => Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }>;
    createPageButtons: (galleryId: number, userId: string, currentPage: number, totalPages: number, sessionId?: string) => ActionRowBuilder<ButtonBuilder>[];
    createGalleryResponse: (gallery: Gallery, options?: GalleryResponseOptions) => Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }>;
    createMainButtons: (galleryId: number, userId: string, numPages: number, gallery?: Gallery | null, sessionId?: string) => Promise<ActionRowBuilder<ButtonBuilder>[]>;
    getUserPreferences: (userId: string) => Promise<UserPreferences>;
    getSearchSession: (userId: string, sessionId?: string) => Promise<SearchSession | null>;
    setSearchSession: (userId: string, data: Partial<SearchSession>, sessionId?: string) => Promise<void>;
    createSearchResultsEmbed: (query: string, data: SearchData, page: number, sort: string) => EmbedBuilder;
    createSearchButtons: (query: string, data: SearchData, page: number, userId: string, sessionId?: string) => ActionRowBuilder<ButtonBuilder>[];
    createFavouritesEmbed: (userId: string, page: number, sessionId?: string) => Promise<FavouritesData>;
    createFavouritesButtons: (userId: string, currentPage: number, totalPages: number, favourites: NHentaiFavourite[], sessionId?: string) => ActionRowBuilder<ButtonBuilder>[];
}

function getNhentaiSessionId(action: string, parts: string[]): string {
    switch (action) {
        case 'view':
        case 'read':
        case 'fav':
        case 'translate':
        case 'jump':
        case 'info':
            return parts.length >= 5 ? parts[3] : 'latest';
        case 'random':
        case 'popular':
        case 'sprev':
        case 'snext':
        case 'spage':
        case 'scount':
            return parts.length >= 4 ? parts[2] : 'latest';
        case 'favpage':
            return parts.length >= 5 ? parts[3] : 'latest';
        case 'first':
        case 'prev':
        case 'page':
        case 'next':
        case 'last':
            return parts.length >= 6 ? parts[4] : 'latest';
        default:
            return 'latest';
    }
}

export async function handleNhentaiButtonInteraction(
    interaction: ButtonInteraction,
    deps: NhentaiButtonInteractionDeps
): Promise<void> {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const sessionId = getNhentaiSessionId(action, parts);
    const userId = parts[parts.length - 1];

    if (userId !== interaction.user.id) {
        await interaction.reply({
            content: '❌ This button is not for you!',
            ephemeral: true
        });
        return;
    }

    try {
        if (action === 'jump') {
            const galleryId = parts[2];
            const session = await deps.getPageSession(userId, sessionId);
            const totalPages = session?.totalPages || 1;

            const modal = new ModalBuilder()
                .setCustomId(`nhentai_jumpmodal_${galleryId}_${sessionId}_${userId}`)
                .setTitle('Jump to Page');

            const pageInput = new TextInputBuilder()
                .setCustomId('page_number')
                .setLabel(`Enter page number (1-${totalPages})`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., 10')
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(5);

            const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(pageInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
            return;
        }

        await interaction.deferUpdate();

        switch (action) {
            case 'view': {
                const galleryId = parts[2];
                const result = await withNhentaiFetchingState(interaction, 'other doujin', async (signal) =>
                    nhentaiService.fetchGallery(galleryId, { signal })
                );
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(result.error || 'Gallery not found')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery);
                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery, sessionId);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            case 'read': {
                const galleryId = parts[2];
                const session = await deps.getPageSession(userId, sessionId);
                let gallery: Gallery | undefined = session?.gallery;

                if (!gallery || gallery.id !== parseInt(galleryId)) {
                    const result = await nhentaiService.fetchGallery(galleryId);
                    if (!result.success || !result.data) {
                        await interaction.editReply({
                            embeds: [deps.createErrorEmbed('Gallery not found')],
                            components: []
                        });
                        return;
                    }
                    gallery = result.data as Gallery;
                }

                const { embed: pageEmbed, files: pageFiles } = await deps.createPageResponse(gallery, 1);
                const pageRows = deps.createPageButtons(parseInt(galleryId), userId, 1, gallery.num_pages, sessionId);
                await interaction.editReply({ embeds: [pageEmbed], components: pageRows, files: pageFiles });
                await deps.setPageSession(userId, gallery, 1, sessionId);
                break;
            }

            case 'prev':
            case 'next':
            case 'first':
            case 'last': {
                const session = await deps.getPageSession(userId, sessionId);
                if (!session) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('Session expired. Please start again.')],
                        components: []
                    });
                    return;
                }

                const requestedPage = Number(parts[3]);
                if (Number.isInteger(requestedPage) && requestedPage !== session.currentPage) {
                    return;
                }

                let newPage = session.currentPage;
                if (action === 'prev') newPage = Math.max(1, newPage - 1);
                else if (action === 'next') newPage = Math.min(session.totalPages, newPage + 1);
                else if (action === 'first') newPage = 1;
                else if (action === 'last') newPage = session.totalPages;

                const { embed: pageEmbed, files: pageFiles } = await deps.createPageResponse(session.gallery, newPage);
                const pageRows = deps.createPageButtons(session.galleryId, userId, newPage, session.totalPages, sessionId);
                await interaction.editReply({ embeds: [pageEmbed], components: pageRows, files: pageFiles });
                await deps.updatePageSession(userId, newPage, sessionId);
                break;
            }

            case 'info': {
                const galleryId = parts[2];
                const result = await nhentaiService.fetchGallery(galleryId);
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('Gallery not found')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery);
                const rows = await deps.createMainButtons(parseInt(galleryId), userId, gallery.num_pages, gallery, sessionId);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            case 'fav': {
                const galleryId = parts[2];
                const session = await deps.getPageSession(userId, sessionId);
                let gallery: Gallery | undefined = session?.gallery;

                if (!gallery || gallery.id !== parseInt(galleryId)) {
                    const result = await nhentaiService.fetchGallery(galleryId);
                    if (!result.success || !result.data) {
                        await interaction.followUp({ content: '❌ Gallery not found', ephemeral: true });
                        return;
                    }
                    gallery = result.data as Gallery;
                }

                const isFav = await nhentaiRepository.isFavourited(userId, parseInt(galleryId));
                if (isFav) {
                    await nhentaiRepository.removeFavourite(userId, parseInt(galleryId));
                } else {
                    if (!gallery) {
                        await interaction.followUp({ content: '❌ Cannot add to favourites - gallery data unavailable', ephemeral: true });
                        return;
                    }
                    await nhentaiRepository.addFavourite(userId, gallery as NHentaiGallery);
                }
                // Rebuild buttons so the ❤️/💔 state reflects the new value
                const newFavRows = await deps.createMainButtons(parseInt(galleryId), userId, gallery!.num_pages, gallery!, sessionId);
                await interaction.editReply({ components: newFavRows });
                await interaction.followUp({
                    content: isFav ? '💔 Removed from favourites' : '❤️ Added to favourites!',
                    ephemeral: true
                });
                break;
            }

            case 'sprev':
            case 'snext': {
                const searchSession = await deps.getSearchSession(userId, sessionId);
                if (!searchSession) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('Search session expired. Please search again.')],
                        components: []
                    });
                    return;
                }

                const newPage = action === 'sprev'
                    ? Math.max(1, (searchSession.currentPage || 1) - 1)
                    : Math.min(searchSession.numPages || 1, (searchSession.currentPage || 1) + 1);

                const sort = searchSession.sort || 'popular';
                let searchData = getCachedSearchPage(searchSession, newPage);

                if (!searchData) {
                    const searchResult = await withNhentaiFetchingState(interaction, 'other doujin', async (signal) =>
                        nhentaiService.searchGalleries(searchSession.query || '', newPage, sort, { signal })
                    );
                    if (!searchResult.success || !searchResult.data || searchResult.data.results.length === 0) {
                        await interaction.editReply({
                            embeds: [deps.createErrorEmbed(searchResult.error || 'No results found')],
                            components: []
                        });
                        return;
                    }

                    searchData = searchResult.data;
                }

                const updatedPageCache = {
                    ...getSearchPageCache(searchSession),
                    [String(newPage)]: searchData
                };

                await deps.setSearchSession(userId, {
                    ...searchSession,
                    currentPage: newPage,
                    numPages: searchData.numPages,
                    results: searchData.results,
                    pageCache: updatedPageCache
                }, sessionId);

                prefetchNhentaiSearchPage(searchSession.query, newPage + 1, sort, searchData.numPages, updatedPageCache);

                const embed = deps.createSearchResultsEmbed(searchSession.query || '', searchData, newPage, sort);
                const rows = deps.createSearchButtons(searchSession.query || '', searchData, newPage, userId, sessionId);
                await interaction.editReply({ embeds: [embed], components: rows });
                break;
            }

            case 'favpage': {
                const direction = parts[2];
                const searchSession = await deps.getSearchSession(userId, sessionId);
                const currentPage = searchSession?.favPage || 1;
                const newPage = direction === 'prev'
                    ? Math.max(1, currentPage - 1)
                    : currentPage + 1;

                const { embed, totalPages, buttons } = await deps.createFavouritesEmbed(userId, newPage, sessionId);
                if (newPage > totalPages) {
                    await interaction.followUp({ content: '❌ No more pages', ephemeral: true });
                    return;
                }

                await deps.setSearchSession(userId, { ...searchSession, favPage: newPage }, sessionId);
                await interaction.editReply({ embeds: [embed], components: buttons });
                break;
            }

            case 'random': {
                const prefs = await deps.getUserPreferences(userId);
                let result;
                try {
                    result = await withNhentaiFetchingState(interaction, 'other manga', async (signal) =>
                        nhentaiService.fetchRandomGalleryByPeriod(prefs.randomPeriod, { signal })
                    , {
                        disableButtons: true,
                        loadingImageUrl: FETCHING_GIF_URL,
                        maxSecondsLabel: 15,
                        replaceEmbedContent: true,
                        showStatusText: true,
                        timeoutSeconds: 15
                    });
                } catch (error) {
                    if (isNhentaiFetchTimeoutError(error)) {
                        await interaction.editReply({
                            embeds: [deps.createErrorEmbed(error.message)],
                            components: []
                        });
                        return;
                    }
                    throw error;
                }
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(result.error || 'Could not fetch random gallery')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery, { isRandom: true, spoilerCover: true });
                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery, sessionId);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            case 'popular': {
                const prefs = await deps.getUserPreferences(userId);
                let result;
                try {
                    result = await withNhentaiFetchingState(interaction, 'other manga', async (signal) =>
                        nhentaiService.fetchPopularGallery(prefs.popularPeriod, { signal })
                    , {
                        disableButtons: true,
                        loadingImageUrl: FETCHING_GIF_URL,
                        maxSecondsLabel: 15,
                        replaceEmbedContent: true,
                        showStatusText: true,
                        timeoutSeconds: 15
                    });
                } catch (error) {
                    if (isNhentaiFetchTimeoutError(error)) {
                        await interaction.editReply({
                            embeds: [deps.createErrorEmbed(error.message)],
                            components: []
                        });
                        return;
                    }
                    throw error;
                }
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(result.error || 'Could not fetch popular gallery')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const periodLabels: Record<UserPreferences['popularPeriod'], string> = {
                    today: 'Today',
                    week: 'This Week',
                    month: 'This Month',
                    all: 'All Time'
                };
                const { embed, files } = await deps.createGalleryResponse(gallery, {
                    isPopular: true,
                    popularPeriod: periodLabels[prefs.popularPeriod] || 'All Time'
                });
                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery, sessionId);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            case 'translate': {
                const galleryId = parts[2];
                const result = await withNhentaiFetchingState(interaction, 'translated version', async (signal) =>
                    nhentaiService.fetchGallery(galleryId, { signal })
                );
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(result.error || 'Gallery not found')],
                        components: []
                    });
                    return;
                }

                const gallery = result.data;

                // Build search query from identifying tags to find the English-translated version
                const searchParts: string[] = [];
                const tags = gallery.tags || [];
                for (const tag of tags) {
                    if (tag.type === 'artist' || tag.type === 'group' || tag.type === 'parody') {
                        searchParts.push(`${tag.type}:"${tag.name}"`);
                    }
                }
                searchParts.push('language:english');

                if (searchParts.length <= 1) {
                    // No identifying tags found, fall back to title search
                    const titleQuery = gallery.title.english || gallery.title.pretty || '';
                    if (titleQuery) searchParts.unshift(`"${titleQuery}"`);
                }

                const searchQuery = searchParts.join(' ');
                const searchResult = await withNhentaiFetchingState(interaction, 'translated version', async (signal) =>
                    nhentaiService.searchGalleries(searchQuery, 1, 'popular', { signal })
                );

                if (!searchResult.success || !searchResult.data || searchResult.data.results.length === 0) {
                    // No translated version found, show original with message
                    const { embed, files } = await deps.createGalleryResponse(gallery);
                    const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery, sessionId);
                    await interaction.editReply({ embeds: [embed], components: rows, files });
                    await interaction.followUp({
                        content: '❌ No English-translated version found for this gallery.',
                        ephemeral: true
                    });
                    break;
                }

                // Find the best match (different gallery, English language)
                const englishGallery = searchResult.data.results.find(g =>
                    g.id !== gallery.id &&
                    g.tags?.some((t: { type: string; name: string }) => t.type === 'language' && t.name.toLowerCase() === 'english')
                ) || searchResult.data.results.find(g => g.id !== gallery.id);

                if (!englishGallery) {
                    const { embed, files } = await deps.createGalleryResponse(gallery);
                    const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery, sessionId);
                    await interaction.editReply({ embeds: [embed], components: rows, files });
                    await interaction.followUp({
                        content: '❌ No English-translated version found for this gallery.',
                        ephemeral: true
                    });
                    break;
                }

                // Fetch the full English gallery and display it
                const englishResult = await nhentaiService.fetchGallery(englishGallery.id);
                if (!englishResult.success || !englishResult.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('Could not load the translated version.')],
                        components: []
                    });
                    break;
                }

                const translatedGallery = englishResult.data;
                const { embed: translatedEmbed, files: translatedFiles } = await deps.createGalleryResponse(translatedGallery);
                const translatedRows = await deps.createMainButtons(translatedGallery.id, userId, translatedGallery.num_pages, translatedGallery, sessionId);
                await interaction.editReply({ embeds: [translatedEmbed], components: translatedRows, files: translatedFiles });
                break;
            }

            case 'randfav': {
                const randomFav = await nhentaiRepository.getRandomFavourite(userId);
                if (!randomFav) {
                    await interaction.followUp({ content: '❌ You have no favourites yet!', ephemeral: true });
                    return;
                }
                const result = await withNhentaiFetchingState(interaction, 'other doujin', async (signal) =>
                    nhentaiService.fetchGallery(randomFav.gallery_id, { signal })
                );
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(result.error || 'Gallery not found')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery);
                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery, sessionId);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            default:
                await interaction.followUp({ content: '❌ Unknown action', ephemeral: true });
        }
    } catch (error) {
        if (isNhentaiFetchTimeoutError(error)) {
            await interaction.editReply({
                embeds: [deps.createErrorEmbed(error.message)],
                components: []
            }).catch(async () => {
                await interaction.followUp?.({
                    content: `❌ ${error.message}`,
                    ephemeral: true
                }).catch(() => {});
            });
            return;
        }

        logger.error('NHentai', `Button error: ${(error as Error).message}`);
        await interaction.followUp?.({
            content: '❌ An error occurred. Please try again.',
            ephemeral: true
        }).catch(() => {});
    }
}

function buildDisabledButtonRows(interaction: ButtonInteraction): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (const row of interaction.message.components) {
        if (row.type !== ComponentType.ActionRow) continue;
        const rowComponents = (row as unknown as { components?: Array<unknown> }).components || [];
        const buttonRow = new ActionRowBuilder<ButtonBuilder>();
        for (const component of rowComponents as Array<any>) {
            if (component.type !== ComponentType.Button) continue;
            buttonRow.addComponents(ButtonBuilder.from(component as any).setDisabled(true));
        }
        if (buttonRow.components.length > 0) rows.push(buttonRow);
    }

    return rows;
}

function buildLoadingEmbed(
    currentEmbed: EmbedBuilder,
    context: string,
    options: FetchingStateOptions = {}
): EmbedBuilder {
    if (options.replaceEmbedContent === true) {
        const embed = new EmbedBuilder()
            .setColor(currentEmbed.data.color ?? 0xED2553);

        if (options.showStatusText) {
            embed.setDescription(`Shoukaku is fetching ${context}, please wait...\nMax: ${(options.maxSecondsLabel || options.timeoutSeconds || 30)}s`);
        }

        if (options.loadingImageUrl) {
            embed.setImage(options.loadingImageUrl);
        }

        return embed;
    }

    const embed = EmbedBuilder.from(currentEmbed);
    const currentDescription = embed.data.description || '';
    const cleanedDescription = currentDescription.replace(/^Shoukaku is fetching[^\n]*(?:\nMax: \d+s)?\n\n?/i, '');

    if (options.showStatusText) {
        const statusLine = `Shoukaku is fetching ${context}, please wait...\nMax: ${(options.maxSecondsLabel || options.timeoutSeconds || 30)}s`;
        embed.setDescription(cleanedDescription ? `${statusLine}\n\n${cleanedDescription}` : statusLine);
    } else if (cleanedDescription !== currentDescription) {
        embed.setDescription(cleanedDescription || null);
    }

    if (options.hideMedia === true) {
        embed.setImage(null);
        embed.setThumbnail(null);
    }
    return embed;
}

type FetchingStateOptions = {
    hideMedia?: boolean;
    disableButtons?: boolean;
    showStatusText?: boolean;
    maxSecondsLabel?: number;
    replaceEmbedContent?: boolean;
    loadingImageUrl?: string;
    timeoutSeconds?: number;
};

function getSearchPageCache(session: SearchSession | null | undefined): Record<string, SearchData> {
    return session?.pageCache || {};
}

function getCachedSearchPage(session: SearchSession | null | undefined, page: number): SearchData | null {
    return getSearchPageCache(session)[String(page)] || null;
}

function prefetchNhentaiSearchPage(
    query: string | undefined,
    page: number,
    sort: string | undefined,
    numPages: number,
    pageCache: Record<string, SearchData>
): void {
    if (!query || page <= 0 || page > numPages || pageCache[String(page)]) {
        return;
    }

    void nhentaiService.searchGalleries(query, page, sort || 'popular').catch((error) => {
        logger.debug('NHentai', `Search prefetch failed: ${(error as Error).message}`);
    });
}

function isAbortLikeError(error: unknown): boolean {
    const err = error as { code?: string; name?: string };
    return err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError';
}

async function withNhentaiFetchingState<T>(
    interaction: ButtonInteraction,
    context: string,
    task: (signal: AbortSignal) => Promise<T>,
    options: FetchingStateOptions = {}
): Promise<T> {
    const shouldUpdateLoadingState = interaction.message.embeds.length > 0
        && (options.hideMedia === true || options.showStatusText === true || options.disableButtons === true || options.replaceEmbedContent === true);
    const baseEmbed = shouldUpdateLoadingState ? EmbedBuilder.from(interaction.message.embeds[0]!) : null;
    const timeoutSeconds = options.timeoutSeconds || 60;
    const controller = new AbortController();
    const timeoutError = new Error(`Fetching ${context} timed out after ${timeoutSeconds} seconds. Please try again.`);
    timeoutError.name = 'NhentaiFetchTimeout';
    let timedOut = false;
    let stopped = false;

    const updateLoadingReply = async (): Promise<void> => {
        if (stopped || !shouldUpdateLoadingState || !baseEmbed) return;
        const loadingEmbed = buildLoadingEmbed(baseEmbed, context, options);
        const components = options.disableButtons === true
            ? buildDisabledButtonRows(interaction)
            : undefined;
        try {
            await interaction.editReply({ embeds: [loadingEmbed], components, files: [] });
        } catch (error) {
            logger.warn('NHentai', `Failed to update fetching state: ${(error as Error).message}`);
        }
    };

    if (shouldUpdateLoadingState) {
        await updateLoadingReply();
    }

    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            timedOut = true;
            reject(timeoutError);
            controller.abort(timeoutError);
        }, timeoutSeconds * 1000);
    });

    try {
        const taskPromise = task(controller.signal).catch((error) => {
            if (timedOut && isAbortLikeError(error)) {
                throw timeoutError;
            }
            throw error;
        });

        return await Promise.race([taskPromise, timeoutPromise]);
    } finally {
        stopped = true;
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

function isNhentaiFetchTimeoutError(error: unknown): error is Error {
    return error instanceof Error && error.name === 'NhentaiFetchTimeout';
}

export interface NhentaiModalInteractionDeps {
    createPageResponse: (gallery: Gallery, pageNum: number) => Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }>;
    createPageButtons: (galleryId: number, userId: string, currentPage: number, totalPages: number, sessionId?: string) => ActionRowBuilder<ButtonBuilder>[];
    setPageSession: (userId: string, gallery: Gallery, currentPage?: number, sessionId?: string) => Promise<void>;
}

export async function handleNhentaiModalInteraction(
    interaction: ModalSubmitInteraction,
    deps: NhentaiModalInteractionDeps
): Promise<void> {
    const parts = interaction.customId.split('_');
    if (parts[1] !== 'jumpmodal') return;

    const galleryId = parseInt(parts[2]);
    const sessionId = parts.length >= 5 ? parts[3] : 'latest';
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        await interaction.reply({
            content: '❌ This is not your gallery view.',
            ephemeral: true
        });
        return;
    }

    const pageInput = interaction.fields.getTextInputValue('page_number');
    const targetPage = parseInt(pageInput);

    if (isNaN(targetPage) || targetPage < 1) {
        await interaction.reply({
            content: '❌ Please enter a valid page number.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferUpdate();

    try {
        const result = await nhentaiService.fetchGallery(galleryId);
        if (!result.success || !result.data) {
            await interaction.followUp({
                content: '❌ Gallery not found.',
                ephemeral: true
            });
            return;
        }

        const gallery = result.data;
        const totalPages = gallery.num_pages || 1;
        const clampedPage = Math.max(1, Math.min(targetPage, totalPages));

        const { embed, files } = await deps.createPageResponse(gallery, clampedPage);
    const buttons = deps.createPageButtons(galleryId, userId, clampedPage, totalPages, sessionId);
    await deps.setPageSession(userId, gallery, clampedPage, sessionId);

        await interaction.editReply({ embeds: [embed], components: buttons, files });
    } catch (error) {
        logger.error('NHentai', `Modal error: ${(error as Error).message}`);
        await interaction.followUp?.({
            content: '❌ Failed to jump to page. Please try again.',
            ephemeral: true
        }).catch(() => {});
    }
}
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ButtonInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    AttachmentBuilder
} from 'discord.js';
import type { ParsedTags, SearchData } from '../../../types/api/models/nhentai.js';
import type {
    Gallery,
    GalleryTitle,
    GalleryTag,
    GalleryImages,
    PageSession,
    SearchSession,
    FavouritesData,
    Favourite,
    UserPreferences
} from '../../../types/api/handlers/nhentai-handler.js';
import { NhentaiCdnClient } from './cdn.js';
import { getExt } from './utils.js';
import {
    clearPageSession,
    getPageSession,
    getSearchSession,
    getUserPreferences,
    setPageSession,
    setSearchSession,
    setUserPreferences,
    updatePageSession
} from './sessionStore.js';
import {
    handleNhentaiButtonInteraction,
    handleNhentaiModalInteraction
} from './interactions.js';
import {
    createCooldownEmbed,
    createErrorEmbed,
    createGalleryEmbed,
    createSearchResultsEmbed,
    createSettingsEmbed
} from './embeds.js';
import {
    createFavouritesButtons,
    createMainButtons,
    createPageButtons,
    createSearchButtons
} from './buttons.js';
import {
    createFavouritesEmbed,
} from './favourites.js';
import type { NHentaiFavourite } from '../../../repositories/api/nhentaiRepository.js';

export class NHentaiHandler {
    private readonly SESSION_TTL = 1800;
    private readonly cdn = new NhentaiCdnClient();

    async createPageResponse(gallery: Gallery, pageNum: number): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
        const { id, media_id, num_pages, images } = gallery;
        const pages = images?.pages || [];

        if (pageNum < 1 || pageNum > pages.length) {
            return { embed: this.createErrorEmbed('Invalid page number.'), files: [] };
        }

        const page = pages[pageNum - 1];
        const imageUrl = this.cdn.getPageImageUrl(media_id, pageNum, page.t);

        const embed = new EmbedBuilder()
            .setColor(0xED2553)
            .setImage(imageUrl)
            .setFooter({ text: `Page ${pageNum}/${num_pages} • ID: ${id}` });

        return { embed, files: [] };
    }

    async createGalleryResponse(
        gallery: Gallery,
        options: { isRandom?: boolean; isPopular?: boolean; popularPeriod?: string; spoilerCover?: boolean } = {}
    ): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
        const embed = this.createGalleryEmbed(gallery, options);

        // The regular path can use the CDN thumbnail directly. Only spoiler covers
        // need a backend download so Discord can treat the attachment as spoilered.
        if (!options.spoilerCover) {
            return { embed, files: [] };
        }

        embed.setThumbnail(null);

        const { media_id, images } = gallery;
        const coverType = images?.cover?.t || 'j';
        const ext = getExt(coverType);
        const filename = `SPOILER_cover.${ext}`;

        const coverUrls = this.cdn.getAllThumbnailUrls(media_id, coverType);
        const imageBuffer = await this.cdn.fetchImageWithRetry(coverUrls);
        const files: AttachmentBuilder[] = [];

        if (imageBuffer) {
            const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
            files.push(attachment);
            embed.setThumbnail(`attachment://${filename}`);
        }

        return { embed, files };
    }

    createGalleryEmbed(gallery: Gallery, options: { isRandom?: boolean; isPopular?: boolean; popularPeriod?: string } = {}): EmbedBuilder {
        return createGalleryEmbed(this.cdn, gallery, options);
    }

    async createMainButtons(
        galleryId: number,
        userId: string,
        numPages: number,
        gallery: Gallery | null = null,
        sessionId: string = 'latest'
    ): Promise<ActionRowBuilder<ButtonBuilder>[]> {
        return createMainButtons(galleryId, userId, numPages, gallery, sessionId);
    }

    async getUserPreferences(userId: string): Promise<UserPreferences> {
        return getUserPreferences(userId);
    }

    async setUserPreferences(userId: string, prefs: Partial<UserPreferences>): Promise<UserPreferences> {
        return setUserPreferences(userId, prefs);
    }

    createSettingsEmbed(userId: string, prefs: UserPreferences): EmbedBuilder {
        return createSettingsEmbed(userId, prefs);
    }

    createSettingsComponents(
        userId: string,
        prefs: UserPreferences,
        _galleryId: number | null = null
    ): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
        const popularRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`nhentai_setting_popular_${userId}`)
                .setPlaceholder('Select popular timeframe')
                .addOptions(
                    { label: 'Popular Today', value: 'today', emoji: '🔥', default: prefs.popularPeriod === 'today' },
                    { label: 'Popular This Week', value: 'week', emoji: '📊', default: prefs.popularPeriod === 'week' },
                    { label: 'Popular This Month', value: 'month', emoji: '📅', default: prefs.popularPeriod === 'month' },
                    { label: 'All Time Popular', value: 'all', emoji: '🏆', default: prefs.popularPeriod === 'all' }
                )
        );

        const randomRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`nhentai_setting_random_${userId}`)
                .setPlaceholder('Select random pool')
                .addOptions(
                    { label: 'Random from uploads today', value: 'today', emoji: '🔥', default: prefs.randomPeriod === 'today' },
                    { label: 'Random from uploads this week', value: 'week', emoji: '📊', default: prefs.randomPeriod === 'week' },
                    { label: 'Random from uploads this month', value: 'month', emoji: '📅', default: prefs.randomPeriod === 'month' },
                    { label: 'Random from all uploads', value: 'all', emoji: '🏆', default: prefs.randomPeriod === 'all' }
                )
        );

            const resetRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                .setCustomId(`nhentai_settingsreset_${userId}`)
                .setLabel('Reset')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
            );

            return [popularRow, randomRow, resetRow];
    }

    async createFavouritesEmbed(userId: string, page: number = 1, perPage: number = 10, sessionId: string = 'latest'): Promise<FavouritesData> {
        return createFavouritesEmbed(userId, page, perPage, sessionId);
    }

    createFavouritesButtons(
        userId: string,
        currentPage: number,
        totalPages: number,
        favourites: NHentaiFavourite[],
        sessionId: string = 'latest'
    ): ActionRowBuilder<ButtonBuilder>[] {
        return createFavouritesButtons(userId, currentPage, totalPages, favourites, sessionId);
    }

    createPageButtons(
        galleryId: number,
        userId: string,
        currentPage: number,
        totalPages: number,
        sessionId: string = 'latest'
    ): ActionRowBuilder<ButtonBuilder>[] {
        return createPageButtons(galleryId, userId, currentPage, totalPages, sessionId);
    }

    createErrorEmbed(message: string): EmbedBuilder {
        return createErrorEmbed(message);
    }

    createCooldownEmbed(remaining: number): EmbedBuilder {
        return createCooldownEmbed(remaining);
    }

    async setPageSession(userId: string, gallery: Gallery, currentPage: number = 1, sessionId: string = 'latest'): Promise<void> {
        return setPageSession(userId, gallery, currentPage, this.SESSION_TTL, sessionId);
    }

    async getPageSession(userId: string, sessionId: string = 'latest'): Promise<PageSession | null> {
        return getPageSession(userId, sessionId);
    }

    async updatePageSession(userId: string, currentPage: number, sessionId: string = 'latest'): Promise<void> {
        return updatePageSession(userId, currentPage, this.SESSION_TTL, sessionId);
    }

    async clearPageSession(userId: string, sessionId: string = 'latest'): Promise<void> {
        return clearPageSession(userId, sessionId);
    }

    async setSearchSession(userId: string, data: Partial<SearchSession>, sessionId: string = 'latest'): Promise<void> {
        return setSearchSession(userId, data, this.SESSION_TTL, sessionId);
    }

    async getSearchSession(userId: string, sessionId: string = 'latest'): Promise<SearchSession | null> {
        return getSearchSession(userId, sessionId);
    }

    createSearchResultsEmbed(query: string, data: SearchData, page: number, sort: string): EmbedBuilder {
        return createSearchResultsEmbed(query, data, page, sort);
    }

    createSearchButtons(query: string, data: SearchData, page: number, userId: string, sessionId: string = 'latest'): ActionRowBuilder<ButtonBuilder>[] {
        return createSearchButtons(query, data, page, userId, sessionId);
    }

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        if (interaction.customId.startsWith('nhentai_settingsreset_')) {
            const userId = interaction.customId.split('_').pop() || '';
            if (interaction.user.id !== userId) {
                await interaction.reply({ content: '❌ This button is not for you!', ephemeral: true });
                return;
            }

            await interaction.deferUpdate();
            const prefs = await this.setUserPreferences(userId, {
                popularPeriod: 'all',
                randomPeriod: 'all'
            });
            const embed = this.createSettingsEmbed(userId, prefs);
            const components = this.createSettingsComponents(userId, prefs, null);
            await interaction.editReply({ embeds: [embed], components });
            return;
        }

        await handleNhentaiButtonInteraction(interaction, {
            sessionTtl: this.SESSION_TTL,
            createErrorEmbed: (message) => this.createErrorEmbed(message),
            getPageSession: (userId, sessionId) => this.getPageSession(userId, sessionId),
            setPageSession: (userId, gallery, currentPage, sessionId) => this.setPageSession(userId, gallery, currentPage, sessionId),
            updatePageSession: (userId, currentPage, sessionId) => this.updatePageSession(userId, currentPage, sessionId),
            createPageResponse: (gallery, pageNum) => this.createPageResponse(gallery, pageNum),
            createPageButtons: (galleryId, userId, currentPage, totalPages, sessionId) => this.createPageButtons(galleryId, userId, currentPage, totalPages, sessionId),
            createGalleryResponse: (gallery, options) => this.createGalleryResponse(gallery, options),
            createMainButtons: (galleryId, userId, numPages, gallery, sessionId) => this.createMainButtons(galleryId, userId, numPages, gallery, sessionId),
            getUserPreferences: (targetUserId) => this.getUserPreferences(targetUserId),
            getSearchSession: (userId, sessionId) => this.getSearchSession(userId, sessionId),
            setSearchSession: (userId, data, sessionId) => this.setSearchSession(userId, data, sessionId),
            createSearchResultsEmbed: (searchQuery, searchData, searchPage, sortBy) => this.createSearchResultsEmbed(searchQuery, searchData, searchPage, sortBy),
            createSearchButtons: (searchQuery, searchData, searchPage, targetUserId, sessionId) => this.createSearchButtons(searchQuery, searchData, searchPage, targetUserId, sessionId),
            createFavouritesEmbed: (targetUserId, favPage, sessionId) => this.createFavouritesEmbed(targetUserId, favPage, 10, sessionId),
            createFavouritesButtons: (targetUserId, currentPage, totalPages, favourites, sessionId) => this.createFavouritesButtons(targetUserId, currentPage, totalPages, favourites, sessionId)
        });
    }

    async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        const parts = interaction.customId.split('_');
        const userId = parts[parts.length - 1];

        if (interaction.user.id !== userId) {
            await interaction.reply({ content: '❌ This menu is not for you!', ephemeral: true });
            return;
        }

        if (parts[1] !== 'setting') return;

        const setting = parts[2];
        const selected = interaction.values[0];
        if (!selected) {
            await interaction.deferUpdate();
            return;
        }

        if (setting === 'popular' && ['today', 'week', 'month', 'all'].includes(selected)) {
            await this.setUserPreferences(userId, { popularPeriod: selected as UserPreferences['popularPeriod'] });
        }

        if (setting === 'random' && ['today', 'week', 'month', 'all'].includes(selected)) {
            await this.setUserPreferences(userId, { randomPeriod: selected as UserPreferences['randomPeriod'] });
        }

        const prefs = await this.getUserPreferences(userId);
        const embed = this.createSettingsEmbed(userId, prefs);
        const components = this.createSettingsComponents(userId, prefs, null);
        await interaction.update({ embeds: [embed], components });
    }

    async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
        await handleNhentaiModalInteraction(interaction, {
            createPageResponse: (gallery, pageNum) => this.createPageResponse(gallery, pageNum),
            createPageButtons: (galleryId, userId, currentPage, totalPages, sessionId) => this.createPageButtons(galleryId, userId, currentPage, totalPages, sessionId),
            setPageSession: (userId, gallery, currentPage, sessionId) => this.setPageSession(userId, gallery, currentPage, sessionId)
        });
    }

    destroy(): void {
        // Sessions are managed by CacheService
    }
}

const nhentaiHandler = new NHentaiHandler();

export default nhentaiHandler;
export type { Gallery, GalleryTitle, GalleryTag, GalleryImages, ParsedTags, PageSession, SearchSession, SearchData, Favourite, UserPreferences };

/**
 * NHentai Handler
 * Creates embeds and buttons for nhentai command
 * @module handlers/api/nhentaiHandler
 */

import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ButtonInteraction,
    ModalSubmitInteraction,
    AttachmentBuilder
} from 'discord.js';
import nhentaiRepository, { NHentaiFavourite } from '../../repositories/api/nhentaiRepository.js';
import logger from '../../core/Logger.js';
import type { ParsedTags, SearchData } from '../../types/api/nhentai.js';
import { NhentaiCdnClient } from './nhentai/cdn.js';
import {
    COLORS,
    formatDate,
    formatTagList,
    getExt,
    getSortLabel,
    getTitle,
    parseTags,
    truncate
} from './nhentai/utils.js';
import {
    clearPageSession,
    getPageSession,
    getSearchSession,
    setPageSession,
    setSearchSession,
    updatePageSession
} from './nhentai/sessionStore.js';
import {
    handleNhentaiButtonInteraction,
    handleNhentaiModalInteraction
} from './nhentai/interactions.js';
import type {
    Gallery,
    GalleryTitle,
    GalleryTag,
    GalleryImages,
    PageSession,
    SearchSession,
    FavouritesData,
    Favourite
} from '../../types/api/handlers/nhentai-handler.js';
// NHENTAI HANDLER CLASS
class NHentaiHandler {
    private readonly SESSION_TTL = 1800; // 30 minutes in seconds for longer reading sessions
    private readonly cdn = new NhentaiCdnClient();
    private _cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Sessions are now managed by CacheService with Redis TTL — no local cleanup needed
    }

    /**
     * Download image from nhentai CDN with proper headers to bypass hotlink protection.
     * Discord's image proxy gets blocked by nhentai CDN, so we download and re-attach.
     */
    private async _fetchImage(url: string): Promise<Buffer | null> {
        return this.cdn.fetchImage(url);
    }

    /**
     * Fetch image with automatic mirror retry.
     * Tries multiple CDN mirrors when 404/network errors occur.
     */
    private async _fetchImageWithRetry(urls: string[]): Promise<Buffer | null> {
        return this.cdn.fetchImageWithRetry(urls);
    }

    /**
     * Get all mirror URLs for a thumbnail (cover image)
     */
    private _getAllThumbnailUrls(mediaId: string, coverType: string): string[] {
        return this.cdn.getAllThumbnailUrls(mediaId, coverType);
    }

    /**
     * Get all mirror URLs for a page image
     */
    private _getAllPageImageUrls(mediaId: string, pageNum: number, pageType: string): string[] {
        return this.cdn.getAllPageImageUrls(mediaId, pageNum, pageType);
    }

    /**
     * Get file extension from nhentai image type code
     */
    private _getExt(typeCode: string): string {
        return getExt(typeCode);
    }

    /**
     * Build a page response (embed + attached image) for the page reader.
     * Downloads the image from nhentai CDN and attaches it to bypass Discord hotlink blocking.
     */
    async createPageResponse(gallery: Gallery, pageNum: number): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
        const { id, media_id, title, num_pages, images } = gallery;
        const pages = images?.pages || [];

        if (pageNum < 1 || pageNum > pages.length) {
            return { embed: this.createErrorEmbed('Invalid page number.'), files: [] };
        }

        const page = pages[pageNum - 1];
        const ext = this._getExt(page.t);
        const filename = `page_${pageNum}.${ext}`;

        const embed = new EmbedBuilder()
            .setColor(COLORS.NHENTAI)
            .setAuthor({
                name: this._truncate(this._getTitle(title), 100),
                url: `https://nhentai.net/g/${id}/`
            })
            .setFooter({ text: `Page ${pageNum}/${num_pages} • ID: ${id}` });

        // Try all CDN mirrors until one works
        const pageUrls = this._getAllPageImageUrls(media_id, pageNum, page.t);
        const imageBuffer = await this._fetchImageWithRetry(pageUrls);
        const files: AttachmentBuilder[] = [];

        if (imageBuffer) {
            const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
            files.push(attachment);
            embed.setImage(`attachment://${filename}`);
        } else {
            // Fallback: try direct URL (may not load, but better than nothing)
            embed.setImage(pageUrls[0]);
        }

        return { embed, files };
    }

    /**
     * Build a gallery info response (embed + attached thumbnail).
     * Downloads the cover image from nhentai CDN and attaches it.
     */
    async createGalleryResponse(gallery: Gallery, options: { isRandom?: boolean; isPopular?: boolean; popularPeriod?: string } = {}): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
        const embed = this.createGalleryEmbed(gallery, options);
        const { media_id, images } = gallery;
        const coverType = images?.cover?.t || 'j';
        const ext = this._getExt(coverType);
        const filename = `cover.${ext}`;

        // Try all thumbnail mirrors until one works
        const coverUrls = this._getAllThumbnailUrls(media_id, coverType);
        const imageBuffer = await this._fetchImageWithRetry(coverUrls);
        const files: AttachmentBuilder[] = [];

        if (imageBuffer) {
            const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
            files.push(attachment);
            // Override the thumbnail set by createGalleryEmbed with our attachment
            embed.setThumbnail(`attachment://${filename}`);
        }

        return { embed, files };
    }


    /**
     * Create gallery info embed
     */
    createGalleryEmbed(gallery: Gallery, options: { isRandom?: boolean; isPopular?: boolean; popularPeriod?: string } = {}): EmbedBuilder {
        const { isRandom = false, isPopular = false, popularPeriod } = options;
        const { id, media_id, title, tags, num_pages, upload_date, images } = gallery;
        
        const embed = new EmbedBuilder()
            .setColor(COLORS.NHENTAI)
            .setTitle(this._getTitle(title))
            .setURL(`https://nhentai.net/g/${id}/`)
            .setFooter({ text: `ID: ${id} • ${num_pages} pages • Uploaded: ${this._formatDate(upload_date)}` });

        // Set thumbnail (cover image)
        const coverType = images?.cover?.t || 'j';
        embed.setThumbnail(this._getThumbnailUrl(media_id, coverType));

        // Add author badge
        if (isRandom) {
            embed.setAuthor({ name: '🎲 Random Gallery' });
        } else if (isPopular) {
            const periodText = popularPeriod ? ` • ${popularPeriod}` : '';
            embed.setAuthor({ name: `🔥 Popular Gallery${periodText}` });
        }

        // Parse and add tags
        const parsedTags = this._parseTags(tags);
        const fields: { name: string; value: string; inline: boolean }[] = [];

        if (parsedTags.artists.length > 0) {
            fields.push({ name: '🎨 Artist', value: this._formatTagList(parsedTags.artists), inline: true });
        }
        if (parsedTags.parodies.length > 0) {
            fields.push({ name: '📚 Parody', value: this._formatTagList(parsedTags.parodies), inline: true });
        }
        if (parsedTags.characters.length > 0) {
            fields.push({ name: '👤 Characters', value: this._formatTagList(parsedTags.characters), inline: true });
        }
        if (parsedTags.groups.length > 0) {
            fields.push({ name: '👥 Group', value: this._formatTagList(parsedTags.groups), inline: true });
        }
        if (parsedTags.languages.length > 0) {
            fields.push({ name: '🌐 Language', value: this._formatTagList(parsedTags.languages), inline: true });
        }
        if (parsedTags.categories.length > 0) {
            fields.push({ name: '📂 Category', value: this._formatTagList(parsedTags.categories), inline: true });
        }
        if (parsedTags.tags.length > 0) {
            fields.push({ name: '🏷️ Tags', value: this._formatTagList(parsedTags.tags, 500), inline: false });
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // Add Japanese title if different
        if (title.japanese && title.japanese !== title.english) {
            embed.setDescription(`*${title.japanese}*`);
        }

        return embed;
    }

    /**
     * Create page reader embed
     */
    createPageEmbed(gallery: Gallery, pageNum: number): EmbedBuilder {
        const { id, media_id, title, num_pages, images } = gallery;
        const pages = images?.pages || [];
        
        if (pageNum < 1 || pageNum > pages.length) {
            return this.createErrorEmbed('Invalid page number.');
        }

        const page = pages[pageNum - 1];
        const imageUrl = this._getPageImageUrl(media_id, pageNum, page.t);
        const thumbUrl = this._getPageThumbUrl(media_id, pageNum, page.t);

        const embed = new EmbedBuilder()
            .setColor(COLORS.NHENTAI)
            .setAuthor({ 
                name: this._truncate(this._getTitle(title), 100),
                url: `https://nhentai.net/g/${id}/`
            })
            .setImage(imageUrl)
            .setThumbnail(thumbUrl) // Small thumbnail loads faster as visual hint while full image loads
            .setFooter({ text: `Page ${pageNum}/${num_pages} • ID: ${id}` });

        return embed;
    }

    /**
     * Create main action buttons
     */
    async createMainButtons(
        galleryId: number, 
        userId: string, 
        numPages: number, 
        _gallery: Gallery | null = null
    ): Promise<ActionRowBuilder<ButtonBuilder>[]> {
        // Check if user has favourited this gallery
        let isFavourited = false;
        try {
            isFavourited = await nhentaiRepository.isFavourited(userId, galleryId);
        } catch {
            // ignore
        }

        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('View on nhentai')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://nhentai.net/g/${galleryId}/`)
                .setEmoji('🔗'),
            new ButtonBuilder()
                .setCustomId(`nhentai_read_${galleryId}_${userId}`)
                .setLabel(`Read (${numPages} pages)`)
                .setStyle(ButtonStyle.Success)
                .setEmoji('📖'),
            new ButtonBuilder()
                .setCustomId(`nhentai_fav_${galleryId}_${userId}`)
                .setLabel(isFavourited ? 'Unfavourite' : 'Favourite')
                .setStyle(isFavourited ? ButtonStyle.Danger : ButtonStyle.Secondary)
                .setEmoji(isFavourited ? '💔' : '❤️'),
            new ButtonBuilder()
                .setCustomId(`nhentai_random_${userId}`)
                .setLabel('Random')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎲')
        );

        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`nhentai_popular_${userId}`)
                .setLabel('Popular')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔥'),
            new ButtonBuilder()
                .setCustomId(`nhentai_myfavs_${userId}`)
                .setLabel('My Favourites')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📚')
        );

        return [row1, row2];
    }

    /**
     * Handle favourite toggle
     */
    async handleFavouriteToggle(
        userId: string, 
        _galleryId: string, 
        gallery: Gallery
    ): Promise<{ added: boolean; removed: boolean; error?: string }> {
        try {
            const result = await nhentaiRepository.toggleFavourite(userId, gallery);
            return result;
        } catch (error) {
            logger.error('NHentai', `Error toggling favourite: ${(error as Error).message}`);
            return { added: false, removed: false, error: (error as Error).message };
        }
    }

    /**
     * Create favourites list embed
     */
    async createFavouritesEmbed(userId: string, page: number = 1, perPage: number = 10): Promise<FavouritesData> {
        const offset = (page - 1) * perPage;
        const favourites = await nhentaiRepository.getUserFavourites(userId, perPage, offset);
        const totalCount = await nhentaiRepository.getFavouritesCount(userId);
        const totalPages = Math.ceil(totalCount / perPage) || 1;

        const embed = new EmbedBuilder()
            .setColor(COLORS.FAVOURITE)
            .setTitle('❤️ Your NHentai Favourites')
            .setFooter({ text: `Page ${page}/${totalPages} • Total: ${totalCount} favourites` });

        if (favourites.length === 0) {
            embed.setDescription('You have no favourites yet!\nClick the ❤️ button on any gallery to add it.');
        } else {
            let description = '';
            favourites.forEach((fav: NHentaiFavourite, index: number) => {
                const num = offset + index + 1;
                const favTitle = this._truncate(fav.gallery_title, 40);
                description += `**${num}.** \`${fav.gallery_id}\` - ${favTitle} (${fav.num_pages}p)\n`;
            });
            embed.setDescription(description);
        }

        return { embed, totalPages, totalCount };
    }

    /**
     * Create favourites navigation buttons
     */
    createFavouritesButtons(
        userId: string, 
        currentPage: number, 
        totalPages: number, 
        favourites: NHentaiFavourite[]
    ): ActionRowBuilder<ButtonBuilder>[] {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];

        // Row 1: Quick view buttons (up to 5)
        if (favourites.length > 0) {
            const row1 = new ActionRowBuilder<ButtonBuilder>();
            const firstFive = favourites.slice(0, 5);
            firstFive.forEach((fav, index) => {
                row1.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`nhentai_view_${fav.gallery_id}_${userId}`)
                        .setLabel(`${index + 1}`)
                        .setStyle(ButtonStyle.Secondary)
                );
            });
            rows.push(row1);
        }

        // Row 2: Navigation
        const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`nhentai_favpage_prev_${userId}`)
                .setLabel('Prev')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('◀️')
                .setDisabled(currentPage <= 1),
            new ButtonBuilder()
                .setCustomId(`nhentai_favpage_num_${userId}`)
                .setLabel(`${currentPage}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`nhentai_favpage_next_${userId}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('▶️')
                .setDisabled(currentPage >= totalPages),
            new ButtonBuilder()
                .setCustomId(`nhentai_random_${userId}`)
                .setLabel('Random')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎲')
        );
        rows.push(navRow);

        return rows;
    }

    /**
     * Create page navigation buttons
     */
    createPageButtons(
        galleryId: number, 
        userId: string, 
        currentPage: number, 
        totalPages: number
    ): ActionRowBuilder<ButtonBuilder>[] {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`nhentai_first_${galleryId}_${userId}`)
                .setLabel('First')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏮️')
                .setDisabled(currentPage <= 1),
            new ButtonBuilder()
                .setCustomId(`nhentai_prev_${galleryId}_${userId}`)
                .setLabel('Prev')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('◀️')
                .setDisabled(currentPage <= 1),
            new ButtonBuilder()
                .setCustomId(`nhentai_page_${galleryId}_${userId}`)
                .setLabel(`${currentPage}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`nhentai_next_${galleryId}_${userId}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('▶️')
                .setDisabled(currentPage >= totalPages),
            new ButtonBuilder()
                .setCustomId(`nhentai_last_${galleryId}_${userId}`)
                .setLabel('Last')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏭️')
                .setDisabled(currentPage >= totalPages)
        );

        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`nhentai_jump_${galleryId}_${userId}`)
                .setLabel('Jump to Page')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔢'),
            new ButtonBuilder()
                .setCustomId(`nhentai_info_${galleryId}_${userId}`)
                .setLabel('Gallery Info')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('ℹ️'),
            new ButtonBuilder()
                .setLabel('Open Page')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://nhentai.net/g/${galleryId}/${currentPage}/`)
                .setEmoji('🔗')
        );

        return [row, row2];
    }

    /**
     * Create error embed
     */
    createErrorEmbed(message: string): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle('❌ Error')
            .setDescription(message)
            .setTimestamp();
    }

    /**
     * Create cooldown embed
     */
    createCooldownEmbed(remaining: number): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle('⏳ Cooldown')
            .setDescription(`Please wait **${remaining}s** before using this command again.`)
            .setTimestamp();
    }

    /**
     * Cache management for page reading sessions (shard-safe via CacheService)
     */
    async setPageSession(userId: string, gallery: Gallery, currentPage: number = 1): Promise<void> {
        return setPageSession(userId, gallery, currentPage, this.SESSION_TTL);
    }

    async getPageSession(userId: string): Promise<PageSession | null> {
        return getPageSession(userId);
    }

    async updatePageSession(userId: string, currentPage: number): Promise<void> {
        return updatePageSession(userId, currentPage, this.SESSION_TTL);
    }

    async clearPageSession(userId: string): Promise<void> {
        return clearPageSession(userId);
    }

    // Search session management (shard-safe via CacheService)
    async setSearchSession(userId: string, data: Partial<SearchSession>): Promise<void> {
        return setSearchSession(userId, data, this.SESSION_TTL);
    }

    async getSearchSession(userId: string): Promise<SearchSession | null> {
        return getSearchSession(userId);
    }

    /**
     * Create search results embed
     */
    createSearchResultsEmbed(query: string, data: SearchData, page: number, sort: string): EmbedBuilder {
        const { results, numPages, totalResults } = data;
        
        const embed = new EmbedBuilder()
            .setColor(COLORS.NHENTAI)
            .setTitle(`🔍 Search Results: "${query}"`)
            .setDescription(`Found **${totalResults}+** results • Page **${page}** of **${numPages}** • Sorted by **${this._getSortLabel(sort)}**`)
            .setFooter({ text: 'Select a gallery to view more details' });

        // Show first 10 results
        const displayResults = results.slice(0, 10);
        let resultsList = '';
        
        displayResults.forEach((gallery, index) => {
            const galleryTitle = this._truncate(this._getTitle(gallery.title), 50);
            const pages = gallery.num_pages || '?';
            const galleryId = gallery.id;
            resultsList += `**${index + 1}.** \`${galleryId}\` - ${galleryTitle} (${pages}p)\n`;
        });

        if (resultsList) {
            embed.addFields({ name: '📚 Results', value: resultsList, inline: false });
        }

        return embed;
    }

    /**
     * Create search navigation buttons
     */
    createSearchButtons(_query: string, data: SearchData, page: number, userId: string): ActionRowBuilder<ButtonBuilder>[] {
        const { results, numPages, totalResults } = data;
        
        const row1 = new ActionRowBuilder<ButtonBuilder>();
        
        // Add buttons for first 5 results
        const firstFive = results.slice(0, 5);
        firstFive.forEach((gallery, index) => {
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`nhentai_view_${gallery.id}_${userId}`)
                    .setLabel(`${index + 1}`)
                    .setStyle(ButtonStyle.Secondary)
            );
        });

        const row2 = new ActionRowBuilder<ButtonBuilder>();
        
        // Add buttons for results 6-10
        const secondFive = results.slice(5, 10);
        if (secondFive.length > 0) {
            secondFive.forEach((gallery, index) => {
                row2.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`nhentai_view_${gallery.id}_${userId}`)
                        .setLabel(`${index + 6}`)
                        .setStyle(ButtonStyle.Secondary)
                );
            });
        }

        const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`nhentai_sprev_${userId}`)
                .setLabel('Prev Page')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('◀️')
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId(`nhentai_spage_${userId}`)
                .setLabel(`${page}/${numPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`nhentai_snext_${userId}`)
                .setLabel('Next Page')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('▶️')
                .setDisabled(page >= numPages),
            new ButtonBuilder()
                .setCustomId(`nhentai_scount_${userId}`)
                .setLabel(`${totalResults}+ results`)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📊')
                .setDisabled(true)
        );

        const rows = [row1];
        if (secondFive.length > 0) rows.push(row2);
        rows.push(row3);
        
        return rows;
    }

    // Private helper methods
    private _getTitle(title: GalleryTitle): string {
        return getTitle(title);
    }

    private _getSortLabel(sort: string): string {
        return getSortLabel(sort);
    }

    private _formatDate(timestamp: number): string {
        return formatDate(timestamp);
    }

    /**
     * Get thumbnail URL using rotating CDN mirrors
     */
    private _getThumbnailUrl(mediaId: string, coverType: string): string {
        return this.cdn.getThumbnailUrl(mediaId, coverType);
    }

    /**
     * Get page image URL using rotating CDN mirrors for better load distribution
     */
    private _getPageImageUrl(mediaId: string, pageNum: number, pageType: string): string {
        return this.cdn.getPageImageUrl(mediaId, pageNum, pageType);
    }

    /**
     * Get page thumbnail URL (smaller, loads faster) as fallback
     */
    private _getPageThumbUrl(mediaId: string, pageNum: number, pageType: string): string {
        return this.cdn.getPageThumbUrl(mediaId, pageNum, pageType);
    }

    private _parseTags(tags: GalleryTag[]): ParsedTags {
        return parseTags(tags);
    }

    private _formatTagList(tags: string[], maxLength: number = 300): string {
        return formatTagList(tags, maxLength);
    }

    private _truncate(text: string, maxLength: number): string {
        return truncate(text, maxLength);
    }

    /**
     * Handle button interactions for nhentai
     */
    async handleButton(interaction: ButtonInteraction): Promise<void> {
        await handleNhentaiButtonInteraction(interaction, {
            sessionTtl: this.SESSION_TTL,
            createErrorEmbed: (message) => this.createErrorEmbed(message),
            getPageSession: (userId) => this.getPageSession(userId),
            setPageSession: (userId, gallery, currentPage) => this.setPageSession(userId, gallery, currentPage),
            updatePageSession: (userId, currentPage) => this.updatePageSession(userId, currentPage),
            createPageResponse: (gallery, pageNum) => this.createPageResponse(gallery, pageNum),
            createPageButtons: (galleryId, userId, currentPage, totalPages) => this.createPageButtons(galleryId, userId, currentPage, totalPages),
            createGalleryResponse: (gallery, options) => this.createGalleryResponse(gallery, options),
            createMainButtons: (galleryId, userId, numPages, gallery) => this.createMainButtons(galleryId, userId, numPages, gallery),
            getSearchSession: (userId) => this.getSearchSession(userId),
            setSearchSession: (userId, data) => this.setSearchSession(userId, data),
            createSearchResultsEmbed: (query, data, page, sort) => this.createSearchResultsEmbed(query, data, page, sort),
            createSearchButtons: (query, data, page, userId) => this.createSearchButtons(query, data, page, userId),
            createFavouritesEmbed: (userId, page) => this.createFavouritesEmbed(userId, page),
            createFavouritesButtons: (userId, currentPage, totalPages, favourites) => this.createFavouritesButtons(userId, currentPage, totalPages, favourites)
        });
    }

    /**
     * Handle modal submissions (jump to page)
     */
    async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
        await handleNhentaiModalInteraction(interaction, {
            createPageResponse: (gallery, pageNum) => this.createPageResponse(gallery, pageNum),
            createPageButtons: (galleryId, userId, currentPage, totalPages) => this.createPageButtons(galleryId, userId, currentPage, totalPages)
        });
    }

    /**
     * Destroy handler - clear intervals for clean shutdown
     */
    destroy(): void {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
        // Sessions are managed by CacheService — no local state to clear
    }
}
// EXPORTS
const nhentaiHandler = new NHentaiHandler();
export default nhentaiHandler;

export { NHentaiHandler };

export { type Gallery, type GalleryTitle, type GalleryTag, type GalleryImages, type ParsedTags, type PageSession, type SearchSession, type SearchData, type Favourite };

export { type FavouritesData } from '../../types/api/handlers/nhentai-handler.js';





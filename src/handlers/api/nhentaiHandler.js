/**
 * NHentai Handler
 * Creates embeds and buttons for nhentai command
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const nhentaiRepository = require('../../repositories/api/nhentaiRepository');
const nhentaiService = require('../../services/api/nhentaiService');

// Colors
const COLORS = {
    NHENTAI: 0xED2553,
    ERROR: 0xFF0000,
    SUCCESS: 0x00FF00,
    FAVOURITE: 0xFFD700
};

class NHentaiHandler {
    constructor() {
        this.pageCache = new Map(); // userId -> { galleryId, currentPage, totalPages, gallery }
        this.searchCache = new Map(); // userId -> { query, sort, results, currentPage, totalPages }
        this.cacheExpiry = 600000; // 10 minutes
        
        // Auto-cleanup every 5 minutes to prevent memory leaks
        this._cleanupInterval = setInterval(() => this._cleanupExpiredSessions(), 300000);
    }
    
    _cleanupExpiredSessions() {
        const now = Date.now();
        let cleaned = 0;
        for (const [userId, session] of this.pageCache) {
            if (now > session.expiresAt) {
                this.pageCache.delete(userId);
                cleaned++;
            }
        }
        for (const [userId, session] of this.searchCache) {
            if (now > session.expiresAt) {
                this.searchCache.delete(userId);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`[NHentai] Cleaned ${cleaned} expired sessions`);
        }
    }

    /**
     * Create gallery info embed
     */
    createGalleryEmbed(gallery, options = {}) {
        const { isRandom = false, isPopular = false } = options;
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
            embed.setAuthor({ name: '🔥 Popular Gallery' });
        }

        // Parse and add tags
        const parsedTags = this._parseTags(tags);
        const fields = [];

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
    createPageEmbed(gallery, pageNum) {
        const { id, media_id, title, num_pages, images } = gallery;
        const pages = images?.pages || [];
        
        if (pageNum < 1 || pageNum > pages.length) {
            return this.createErrorEmbed('Invalid page number.');
        }

        const page = pages[pageNum - 1];
        const imageUrl = this._getPageImageUrl(media_id, pageNum, page.t);

        const embed = new EmbedBuilder()
            .setColor(COLORS.NHENTAI)
            .setAuthor({ 
                name: this._truncate(this._getTitle(title), 100),
                url: `https://nhentai.net/g/${id}/`
            })
            .setImage(imageUrl)
            .setFooter({ text: `Page ${pageNum}/${num_pages} • ID: ${id}` });

        return embed;
    }

    /**
     * Create main action buttons
     */
    async createMainButtons(galleryId, userId, numPages, gallery = null) {
        // Check if user has favourited this gallery
        let isFavourited = false;
        try {
            isFavourited = await nhentaiRepository.isFavourited(userId, galleryId);
        } catch (e) { /* ignore */ }

        const row1 = new ActionRowBuilder().addComponents(
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

        const row2 = new ActionRowBuilder().addComponents(
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
    async handleFavouriteToggle(userId, galleryId, gallery) {
        try {
            const result = await nhentaiRepository.toggleFavourite(userId, gallery);
            return result;
        } catch (error) {
            console.error('[NHentai] Error toggling favourite:', error);
            return { added: false, removed: false, error: error.message };
        }
    }

    /**
     * Create favourites list embed
     */
    async createFavouritesEmbed(userId, page = 1, perPage = 10) {
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
            favourites.forEach((fav, index) => {
                const num = offset + index + 1;
                const title = this._truncate(fav.gallery_title, 40);
                description += `**${num}.** \`${fav.gallery_id}\` - ${title} (${fav.num_pages}p)\n`;
            });
            embed.setDescription(description);
        }

        return { embed, totalPages, totalCount };
    }

    /**
     * Create favourites navigation buttons
     */
    createFavouritesButtons(userId, currentPage, totalPages, favourites) {
        const rows = [];

        // Row 1: Quick view buttons (up to 5)
        if (favourites.length > 0) {
            const row1 = new ActionRowBuilder();
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
        const navRow = new ActionRowBuilder().addComponents(
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
    createPageButtons(galleryId, userId, currentPage, totalPages) {
        const row = new ActionRowBuilder().addComponents(
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

        const row2 = new ActionRowBuilder().addComponents(
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
    createErrorEmbed(message) {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle('❌ Error')
            .setDescription(message)
            .setTimestamp();
    }

    /**
     * Create cooldown embed
     */
    createCooldownEmbed(remaining) {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle('⏳ Cooldown')
            .setDescription(`Please wait **${remaining}s** before using this command again.`)
            .setTimestamp();
    }

    /**
     * Cache management for page reading sessions
     */
    setPageSession(userId, gallery, currentPage = 1) {
        this.pageCache.set(userId, {
            galleryId: gallery.id,
            gallery,
            currentPage,
            totalPages: gallery.num_pages,
            expiresAt: Date.now() + this.cacheExpiry
        });
    }

    getPageSession(userId) {
        const session = this.pageCache.get(userId);
        if (!session || Date.now() > session.expiresAt) {
            this.pageCache.delete(userId);
            return null;
        }
        return session;
    }

    updatePageSession(userId, currentPage) {
        const session = this.pageCache.get(userId);
        if (session) {
            session.currentPage = currentPage;
            session.expiresAt = Date.now() + this.cacheExpiry;
        }
    }

    clearPageSession(userId) {
        this.pageCache.delete(userId);
    }

    // Search session management
    setSearchSession(userId, data) {
        this.searchCache.set(userId, {
            ...data,
            expiresAt: Date.now() + this.cacheExpiry
        });
    }

    getSearchSession(userId) {
        const session = this.searchCache.get(userId);
        if (!session || Date.now() > session.expiresAt) {
            this.searchCache.delete(userId);
            return null;
        }
        return session;
    }

    /**
     * Create search results embed
     */
    createSearchResultsEmbed(query, data, page, sort) {
        const { results, numPages, totalResults } = data;
        
        const embed = new EmbedBuilder()
            .setColor(COLORS.NHENTAI)
            .setTitle(`🔍 Search Results: "${query}"`)
            .setDescription(`Found **${totalResults}+** results • Page **${page}** of **${numPages}** • Sorted by **${sort === 'recent' ? 'Recent' : 'Popular'}**`)
            .setFooter({ text: 'Select a gallery to view more details' });

        // Show first 10 results
        const displayResults = results.slice(0, 10);
        let resultsList = '';
        
        displayResults.forEach((gallery, index) => {
            const title = this._truncate(this._getTitle(gallery.title), 50);
            const pages = gallery.num_pages || '?';
            const id = gallery.id;
            resultsList += `**${index + 1}.** \`${id}\` - ${title} (${pages}p)\n`;
        });

        if (resultsList) {
            embed.addFields({ name: '📚 Results', value: resultsList, inline: false });
        }

        return embed;
    }

    /**
     * Create search navigation buttons
     */
    createSearchButtons(query, data, page, userId) {
        const { results, numPages } = data;
        
        const row1 = new ActionRowBuilder();
        
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

        const row2 = new ActionRowBuilder();
        
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

        const row3 = new ActionRowBuilder().addComponents(
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
                .setDisabled(page >= numPages)
        );

        const rows = [row1];
        if (secondFive.length > 0) rows.push(row2);
        rows.push(row3);
        
        return rows;
    }

    // Private helper methods
    _getTitle(title) {
        return title.english || title.japanese || title.pretty || 'Unknown Title';
    }

    _formatDate(timestamp) {
        return new Date(timestamp * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    /**
     * Get thumbnail URL using multiple CDN mirrors
     * nhentai uses different CDN servers, try alternatives if main fails
     */
    _getThumbnailUrl(mediaId, coverType) {
        const ext = { 'j': 'jpg', 'p': 'png', 'g': 'gif' }[coverType] || 'jpg';
        // Use t2/t3/t5 CDN which tends to work better with Discord embeds
        // Main CDN: t.nhentai.net often gets blocked
        // Alternative CDNs: t2, t3, t5.nhentai.net
        return `https://t3.nhentai.net/galleries/${mediaId}/cover.${ext}`;
    }

    /**
     * Get page image URL using multiple CDN mirrors
     */
    _getPageImageUrl(mediaId, pageNum, pageType) {
        const ext = { 'j': 'jpg', 'p': 'png', 'g': 'gif' }[pageType] || 'jpg';
        // Use i2/i3/i5/i7 CDN which tends to work better with Discord embeds
        return `https://i3.nhentai.net/galleries/${mediaId}/${pageNum}.${ext}`;
    }

    _parseTags(tags) {
        const result = {
            artists: [], characters: [], parodies: [], 
            groups: [], tags: [], languages: [], categories: []
        };
        
        if (!tags || !Array.isArray(tags)) return result;
        
        for (const tag of tags) {
            const type = tag.type;
            if (result[type + 's']) {
                result[type + 's'].push(tag.name);
            } else if (type === 'tag') {
                result.tags.push(tag.name);
            }
        }
        
        // Limit each category
        for (const key in result) {
            result[key] = result[key].slice(0, 15);
        }
        
        return result;
    }

    _formatTagList(tags, maxLength = 300) {
        if (!tags || tags.length === 0) return 'None';
        let result = tags.join(', ');
        if (result.length > maxLength) {
            result = result.substring(0, maxLength - 3) + '...';
        }
        return result;
    }

    _truncate(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    }

    /**
     * Handle button interactions for nhentai
     */
    async handleButton(interaction) {
        const parts = interaction.customId.split('_');
        const action = parts[1];
        const userId = parts[parts.length - 1];

        // Verify button owner
        if (userId !== interaction.user.id) {
            return interaction.reply({
                content: '❌ This button is not for you!',
                ephemeral: true
            });
        }

        try {
            await interaction.deferUpdate();

            switch (action) {
                case 'view': {
                    // View gallery by ID: nhentai_view_{galleryId}_{userId}
                    const galleryId = parts[2];
                    const result = await nhentaiService.fetchGallery(galleryId);
                    if (!result.success || !result.data) {
                        return interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Gallery not found')], 
                            components: [] 
                        });
                    }
                    const gallery = result.data;
                    const embed = this.createGalleryEmbed(gallery);
                    const rows = await this.createMainButtons(galleryId, userId, gallery.num_pages, gallery);
                    return interaction.editReply({ embeds: [embed], components: rows });
                }

                case 'read': {
                    // Read gallery: nhentai_read_{galleryId}_{userId}
                    const galleryId = parts[2];
                    const session = this.getPageSession(userId);
                    let gallery = session?.gallery;
                    
                    if (!gallery || gallery.id !== parseInt(galleryId)) {
                        const result = await nhentaiService.fetchGallery(galleryId);
                        if (!result.success || !result.data) {
                            return interaction.editReply({ 
                                embeds: [this.createErrorEmbed('Gallery not found')], 
                                components: [] 
                            });
                        }
                        gallery = result.data;
                        this.setPageSession(userId, gallery, 1);
                    }
                    
                    const pageEmbed = this.createPageEmbed(gallery, 1);
                    const pageRows = this.createPageButtons(galleryId, userId, 1, gallery.num_pages);
                    return interaction.editReply({ embeds: [pageEmbed], components: pageRows });
                }

                case 'prev':
                case 'next':
                case 'first':
                case 'last': {
                    const session = this.getPageSession(userId);
                    if (!session) {
                        return interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Session expired. Please start again.')], 
                            components: [] 
                        });
                    }
                    
                    let newPage = session.currentPage;
                    if (action === 'prev') newPage = Math.max(1, newPage - 1);
                    else if (action === 'next') newPage = Math.min(session.totalPages, newPage + 1);
                    else if (action === 'first') newPage = 1;
                    else if (action === 'last') newPage = session.totalPages;
                    
                    this.updatePageSession(userId, newPage);
                    const pageEmbed = this.createPageEmbed(session.gallery, newPage);
                    const pageRows = this.createPageButtons(session.galleryId, userId, newPage, session.totalPages);
                    return interaction.editReply({ embeds: [pageEmbed], components: pageRows });
                }

                case 'info': {
                    const galleryId = parts[2];
                    const result = await nhentaiService.fetchGallery(galleryId);
                    if (!result.success || !result.data) {
                        return interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Gallery not found')], 
                            components: [] 
                        });
                    }
                    const gallery = result.data;
                    const embed = this.createGalleryEmbed(gallery);
                    const rows = await this.createMainButtons(galleryId, userId, gallery.num_pages, gallery);
                    return interaction.editReply({ embeds: [embed], components: rows });
                }

                case 'fav': {
                    // Toggle favourite: nhentai_fav_{galleryId}_{userId}
                    const galleryId = parts[2];
                    // First check session cache for gallery data
                    const session = this.getPageSession(userId);
                    let gallery = session?.gallery;
                    
                    if (!gallery || gallery.id !== parseInt(galleryId)) {
                        const result = await nhentaiService.fetchGallery(galleryId);
                        if (!result.success || !result.data) {
                            return interaction.followUp({ content: '❌ Gallery not found', ephemeral: true });
                        }
                        gallery = result.data;
                    }
                    
                    const isFav = await nhentaiRepository.isFavourited(userId, galleryId);
                    if (isFav) {
                        await nhentaiRepository.removeFavourite(userId, galleryId);
                        return interaction.followUp({ content: '💔 Removed from favourites', ephemeral: true });
                    } else {
                        await nhentaiRepository.addFavourite(userId, gallery);
                        return interaction.followUp({ content: '❤️ Added to favourites!', ephemeral: true });
                    }
                }

                case 'sprev':
                case 'snext': {
                    // Search pagination
                    const session = this.getSearchSession(userId);
                    if (!session) {
                        return interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Search session expired. Please search again.')], 
                            components: [] 
                        });
                    }
                    
                    const newPage = action === 'sprev' 
                        ? Math.max(1, session.currentPage - 1)
                        : Math.min(session.numPages, session.currentPage + 1);
                    
                    const results = await nhentaiRepository.searchGalleries(session.query, newPage, session.sort);
                    if (!results || results.results.length === 0) {
                        return interaction.editReply({ 
                            embeds: [this.createErrorEmbed('No results found')], 
                            components: [] 
                        });
                    }
                    
                    this.setSearchSession(userId, { ...session, currentPage: newPage, results: results.results });
                    const embed = this.createSearchResultsEmbed(session.query, results, newPage, session.sort);
                    const rows = this.createSearchButtons(session.query, results, newPage, userId);
                    return interaction.editReply({ embeds: [embed], components: rows });
                }

                case 'favpage': {
                    // Favourites pagination: nhentai_favpage_{prev|next}_{userId}
                    const direction = parts[2];
                    const session = this.getSearchSession(userId);
                    const currentPage = session?.favPage || 1;
                    const newPage = direction === 'prev' 
                        ? Math.max(1, currentPage - 1) 
                        : currentPage + 1;
                    
                    const { embed, totalPages, totalCount } = await this.createFavouritesEmbed(userId, newPage);
                    if (newPage > totalPages) {
                        return interaction.followUp({ content: '❌ No more pages', ephemeral: true });
                    }
                    
                    const favourites = await nhentaiRepository.getUserFavourites(userId, 10, (newPage - 1) * 10);
                    const rows = this.createFavouritesButtons(userId, newPage, totalPages, favourites);
                    this.setSearchSession(userId, { ...session, favPage: newPage });
                    return interaction.editReply({ embeds: [embed], components: rows });
                }

                case 'random': {
                    // Random gallery from API (not from favourites)
                    const result = await nhentaiService.fetchRandomGallery();
                    if (!result.success || !result.data) {
                        return interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Could not fetch random gallery')], 
                            components: [] 
                        });
                    }
                    const gallery = result.data;
                    const embed = this.createGalleryEmbed(gallery, { isRandom: true });
                    const rows = await this.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                    return interaction.editReply({ embeds: [embed], components: rows });
                }

                case 'popular': {
                    // Popular gallery from API
                    const result = await nhentaiService.fetchPopularGallery();
                    if (!result.success || !result.data) {
                        return interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Could not fetch popular gallery')], 
                            components: [] 
                        });
                    }
                    const gallery = result.data;
                    const embed = this.createGalleryEmbed(gallery, { isPopular: true });
                    const rows = await this.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                    return interaction.editReply({ embeds: [embed], components: rows });
                }

                case 'myfavs': {
                    // Show user's favourites list
                    const { embed, totalPages, totalCount } = await this.createFavouritesEmbed(userId, 1);
                    if (totalCount === 0) {
                        return interaction.editReply({ embeds: [embed], components: [] });
                    }
                    const favourites = await nhentaiRepository.getUserFavourites(userId, 10, 0);
                    const rows = this.createFavouritesButtons(userId, 1, totalPages, favourites);
                    this.setSearchSession(userId, { favPage: 1 });
                    return interaction.editReply({ embeds: [embed], components: rows });
                }

                case 'jump': {
                    // Jump to page - show modal for input
                    const galleryId = parts[2];
                    const session = this.getPageSession(userId);
                    const totalPages = session?.totalPages || 1;
                    
                    // Create a modal for page input
                    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
                    
                    const modal = new ModalBuilder()
                        .setCustomId(`nhentai_jumpmodal_${galleryId}_${userId}`)
                        .setTitle('Jump to Page');
                    
                    const pageInput = new TextInputBuilder()
                        .setCustomId('page_number')
                        .setLabel(`Enter page number (1-${totalPages})`)
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g., 10')
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(5);
                    
                    const actionRow = new ActionRowBuilder().addComponents(pageInput);
                    modal.addComponents(actionRow);
                    
                    // Need to show modal BEFORE deferUpdate, so we need to use the original interaction
                    // Since we already called deferUpdate(), we'll use followUp with a select menu instead
                    return interaction.followUp({
                        content: `📖 Enter the page number (1-${totalPages}) in a message:`,
                        ephemeral: true
                    });
                }

                case 'randfav': {
                    // Random from favourites only
                    const favourites = await nhentaiRepository.getUserFavourites(userId, 100, 0);
                    if (favourites.length === 0) {
                        return interaction.followUp({ content: '❌ You have no favourites yet!', ephemeral: true });
                    }
                    const randomFav = favourites[Math.floor(Math.random() * favourites.length)];
                    const result = await nhentaiService.fetchGallery(randomFav.gallery_id);
                    if (!result.success || !result.data) {
                        return interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Gallery not found')], 
                            components: [] 
                        });
                    }
                    const gallery = result.data;
                    const embed = this.createGalleryEmbed(gallery);
                    const rows = await this.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                    return interaction.editReply({ embeds: [embed], components: rows });
                }

                default:
                    return interaction.followUp({ content: '❌ Unknown action', ephemeral: true });
            }
        } catch (error) {
            console.error('[NHentai Button Error]', error);
            return interaction.followUp?.({ 
                content: '❌ An error occurred. Please try again.', 
                ephemeral: true 
            }).catch(() => {});
        }
    }
}

module.exports = new NHentaiHandler();

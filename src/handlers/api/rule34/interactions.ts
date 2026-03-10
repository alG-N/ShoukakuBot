import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    ModalBuilder,
    ModalSubmitInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import logger from '../../../core/Logger.js';
import type {
    Post,
    Rule34CacheContract,
    Rule34PostHandlerContract,
    Rule34ServiceContract
} from '../../../types/commands/external/rule34-command.js';

export interface Rule34InteractionDeps {
    rule34Service: Rule34ServiceContract;
    rule34Cache: Rule34CacheContract;
    postHandler: Rule34PostHandlerContract;
    normalizeMinScore: (value: unknown, fallback?: number) => number;
    errorEmbed: (message: string) => EmbedBuilder;
    infoEmbed: (title: string, description: string) => EmbedBuilder;
}

class Rule34InteractionController {
    constructor(private readonly deps: Rule34InteractionDeps) {}

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        const parts = interaction.customId.split('_');
        const action = parts[1];
        const userId = parts[parts.length - 1];

        if (userId !== interaction.user.id) {
            await interaction.reply({
                content: '❌ This button is not for you!',
                ephemeral: true
            });
            return;
        }

        try {
            switch (action) {
                case 'prev':
                case 'next':
                    await this._handleNavigation(interaction, action, userId);
                    break;
                case 'selectpost':
                    await this._handleSelectPost(interaction, userId);
                    break;
                case 'watch':
                    await this._handleWatchVideo(interaction, parts[2], userId);
                    break;
                case 'watchback':
                    await this._handleWatchBack(interaction, userId);
                    break;
                case 'prevpage':
                case 'nextpage':
                    await this._handlePageNavigation(interaction, action, userId);
                    break;
                case 'fav':
                    await this._handleFavoriteToggle(interaction, parts[2], userId);
                    break;
                case 'settings':
                    if (parts[2] === 'reset') {
                        this.deps.rule34Cache?.resetPreferences?.(userId);
                        this.deps.rule34Cache?.clearBlacklist?.(userId);
                        await this._refreshSettingsEmbed(interaction, userId);
                    } else if (parts[2] === 'back') {
                        await this._refreshSettingsEmbed(interaction, userId);
                    }
                    break;
                case 'bl':
                    await this._handleBlacklistAction(interaction, parts[2], userId);
                    break;
                case 'counter':
                case 'pageinfo':
                    await interaction.deferUpdate();
                    break;
                default:
                    await interaction.deferUpdate();
            }
        } catch (error) {
            logger.error('Rule34', `Button error: ${(error as Error).message}`);
            await interaction.reply({
                content: '❌ An error occurred. Please try again.',
                ephemeral: true
            }).catch(() => {});
        }
    }

    async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        const parts = interaction.customId.split('_');
        const userId = parts[parts.length - 1];

        if (userId !== interaction.user.id) {
            await interaction.reply({
                content: '❌ This menu is not for you!',
                ephemeral: true
            }).catch(() => {});
            return;
        }

        const value = interaction.values[0];

        try {
            if (interaction.customId.startsWith('rule34_settingmenu_')) {
                await this._handleSettingMenuSelect(interaction, value, userId);
                return;
            }

            if (interaction.customId.startsWith('rule34_sort_select_')) {
                this.deps.rule34Cache?.setPreferences?.(userId, { sortMode: value });
                await this._refreshSettingsEmbed(interaction, userId);
                return;
            }
        } catch (error) {
            const err = error as Error & { code?: number };
            if (err.code !== 10062 && err.code !== 40060) {
                logger.error('Rule34', `SelectMenu error: ${(error as Error).message}`);
            }
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Failed to update setting.',
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }

    private async _handleNavigation(interaction: ButtonInteraction, action: string, userId: string): Promise<void> {
        const session = this.deps.rule34Cache?.getSession?.(userId);

        if (!session) {
            await interaction.reply({
                content: '⏱️ Session expired. Please run the command again.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        let newIndex = session.currentIndex;

        if (action === 'prev') {
            newIndex = Math.max(0, newIndex - 1);
        } else if (action === 'next') {
            newIndex = Math.min(session.posts.length - 1, newIndex + 1);
        }

        this.deps.rule34Cache?.updateSession?.(userId, { currentIndex: newIndex });

        const post = session.posts[newIndex];
        const sessionHasMore = session.hasMore ?? true;
        this.deps.rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

        if (post.hasVideo && this.deps.postHandler?.createVideoEmbed) {
            const { rows, embed: videoEmbed } = this.deps.postHandler.createVideoEmbed(post, {
                resultIndex: newIndex,
                totalResults: session.posts.length,
                userId,
                searchPage: session.currentPage || 1,
                hasMore: sessionHasMore,
                sessionType: (session.type as any) || 'search',
                maxPage: session.type === 'trending' ? 1 : 200
            });
            await interaction.editReply({ content: '', embeds: [videoEmbed], components: rows });
            return;
        }

        const { embed, rows } = await this.deps.postHandler.createPostEmbed(post, {
            resultIndex: newIndex,
            totalResults: session.posts.length,
            query: session.query,
            userId,
            searchPage: session.currentPage || 1,
            hasMore: sessionHasMore,
            sessionType: (session.type as any) || 'search',
            maxPage: session.type === 'trending' ? 1 : 200
        });

        await interaction.editReply({ content: '', embeds: [embed], components: rows });
    }

    private async _handleSelectPost(interaction: ButtonInteraction, userId: string): Promise<void> {
        const session = this.deps.rule34Cache?.getSession?.(userId);
        if (!session || !Array.isArray(session.posts) || session.posts.length === 0) {
            await interaction.reply({
                content: '⏱️ Session expired. Please run the command again.',
                ephemeral: true
            });
            return;
        }

        const maxPost = session.posts.length;
        if (maxPost <= 1) {
            await interaction.reply({
                content: 'ℹ️ This result set only has one post.',
                ephemeral: true
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`rule34_selectpost_modal_${userId}`)
            .setTitle('Select Post');

        const input = new TextInputBuilder()
            .setCustomId('post_value')
            .setLabel(`Post number (1-${maxPost})`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`${session.currentIndex + 1}`)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(3);

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        await interaction.showModal(modal);

        try {
            const modalResponse = await interaction.awaitModalSubmit({
                filter: i => i.customId === `rule34_selectpost_modal_${userId}` && i.user.id === userId,
                time: 60000
            });

            const raw = modalResponse.fields.getTextInputValue('post_value').trim();
            const postNumber = Number.parseInt(raw, 10);
            if (Number.isNaN(postNumber) || postNumber < 1 || postNumber > maxPost) {
                await modalResponse.reply({
                    content: `❌ Invalid post number. Please enter a number from 1 to ${maxPost}.`,
                    ephemeral: true
                });
                return;
            }

            await modalResponse.deferReply({ ephemeral: true });

            const targetIndex = postNumber - 1;
            if (targetIndex === session.currentIndex) {
                await modalResponse.editReply({ content: `ℹ️ You are already on post ${postNumber}.` });
                return;
            }

            this.deps.rule34Cache?.updateSession?.(userId, { currentIndex: targetIndex });
            const activeSession = this.deps.rule34Cache?.getSession?.(userId);
            if (!activeSession || !activeSession.posts[targetIndex]) {
                await modalResponse.editReply({ content: '❌ Session expired. Please run the command again.' });
                return;
            }

            const post = activeSession.posts[targetIndex];
            const sessionHasMore = activeSession.hasMore ?? true;
            this.deps.rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

            if (post.hasVideo && this.deps.postHandler?.createVideoEmbed) {
                const { rows, embed: videoEmbed } = this.deps.postHandler.createVideoEmbed(post, {
                    resultIndex: targetIndex,
                    totalResults: activeSession.posts.length,
                    userId,
                    searchPage: activeSession.currentPage || 1,
                    hasMore: sessionHasMore,
                    sessionType: (activeSession.type as any) || 'search',
                    maxPage: activeSession.type === 'trending' ? 1 : 200
                });
                await interaction.message.edit({ content: '', embeds: [videoEmbed], components: rows });
                await modalResponse.editReply({ content: `✅ Jumped to post ${postNumber}.` });
                return;
            }

            const { embed, rows } = await this.deps.postHandler.createPostEmbed(post, {
                resultIndex: targetIndex,
                totalResults: activeSession.posts.length,
                query: activeSession.query,
                userId,
                searchPage: activeSession.currentPage || 1,
                hasMore: sessionHasMore,
                sessionType: (activeSession.type as any) || 'search',
                maxPage: activeSession.type === 'trending' ? 1 : 200
            });

            await interaction.message.edit({ content: '', embeds: [embed], components: rows });
            await modalResponse.editReply({ content: `✅ Jumped to post ${postNumber}.` });
        } catch {
            // Modal timed out
        }
    }

    private async _handlePageNavigation(interaction: ButtonInteraction, action: string, userId: string): Promise<void> {
        const session = this.deps.rule34Cache?.getSession?.(userId);

        if (!session || !['search', 'random', 'trending'].includes(session.type)) {
            await interaction.reply({
                content: '⏱️ Session expired. Please run the command again.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        const currentPage = session.currentPage || 1;
        const newPage = action === 'nextpage' ? currentPage + 1 : Math.max(1, currentPage - 1);
        await this._navigateToPage(interaction, userId, newPage, action === 'nextpage');
    }

    private async _navigateToPage(interaction: ButtonInteraction, userId: string, newPage: number, isForward: boolean = true): Promise<void> {
        const session = this.deps.rule34Cache?.getSession?.(userId);
        if (!session || !['search', 'random', 'trending'].includes(session.type)) {
            await interaction.followUp({
                content: '⏱️ Session expired. Please run the command again.',
                ephemeral: true
            }).catch(() => {});
            return;
        }

        logger.info('Rule34', `Page navigation: type=${session.type} currentPage=${session.currentPage || 1} newPage=${newPage}`);
        const prefs = this.deps.rule34Cache?.getPreferences?.(userId) || {};
        const blacklist = this.deps.rule34Cache?.getBlacklist?.(userId) || [];
        const effectiveExcludeAi = session.options?.excludeAi ?? prefs.aiFilter;
        const effectiveMinScore = this.deps.normalizeMinScore(session.options?.minScore ?? prefs.minScore, 1);
        const effectiveHighQualityOnly = session.options?.highQualityOnly ?? prefs.highQualityOnly ?? false;
        const effectiveExcludeLowQuality = session.options?.excludeLowQuality ?? prefs.excludeLowQuality ?? false;
        const followSettings = session.type === 'random' ? (((session.options as any)?.followSettings) ?? true) : true;
        const hasAiOverride = session.type === 'random' ? (((session.options as any)?.hasAiOverride) ?? false) : false;

        let posts: Post[] = [];
        let hasMore = false;
        const randomRating = session.options?.rating === 'all' ? null : session.options?.rating;
        const canEditReply = interaction.deferred || interaction.replied;

        const fetchTask = async () => {
            if (session.type === 'search' && session.options) {
                const result = await this.deps.rule34Service.search(session.query || '', {
                    ...session.options,
                    excludeAi: effectiveExcludeAi,
                    minScore: effectiveMinScore,
                    page: newPage - 1
                });
                posts = result?.posts || [];
                hasMore = result?.hasMore || false;
                logger.info('Rule34', `Search page ${newPage}: fetched=${posts.length} hasMore=${hasMore}`);
            } else if (session.type === 'random') {
                const hasTags = (session.query || '').trim().length > 0;
                const pageRange = hasTags ? 25 : 100;
                const maxAttempts = 5;
                const configuredRandomCount = Number((session.options as any)?.randomCount ?? session.posts?.length ?? 1);
                const randomCount = Math.max(1, Math.min(50, configuredRandomCount));
                const overflowLimit = Math.max(50, randomCount * 2);
                const fetchLimit = randomCount;
                // Accumulate ALL previously seen post IDs across pages
                const seenIds = new Set<number>(session.seenPostIds || session.posts?.map(p => p.id) || []);
                logger.info('Rule34', `Random pagination: randomCount=${randomCount} seenIds=${seenIds.size} hasTags=${hasTags}`);

                // Use cached overflow posts first before hitting the API
                const overflow: Post[] = (session.overflowPosts || [])
                    .filter((p: Post) => !seenIds.has(p.id))
                    .slice(0, overflowLimit);
                const collected: Post[] = [];
                const excludedIds = new Set<number>(seenIds);
                for (const p of overflow) {
                    excludedIds.add(p.id);
                }
                for (const p of overflow) {
                    if (collected.length >= randomCount) break;
                    collected.push(p);
                    seenIds.add(p.id);
                }
                logger.info('Rule34', `Random pagination: used ${collected.length} overflow posts`);
                const remainingOverflow = overflow.slice(collected.length);

                // Fetch from API only if overflow wasn't enough
                const newOverflow: Post[] = [];
                for (let attempt = 0; attempt < maxAttempts && collected.length < randomCount; attempt++) {
                    const page = attempt === 0 ? 0 : Math.floor(Math.random() * pageRange);
                    const result = await this.deps.rule34Service.search(session.query || '', {
                        limit: fetchLimit,
                        page,
                        rating: (followSettings ? randomRating : null) as any,
                        excludeAi: (followSettings || hasAiOverride) ? effectiveExcludeAi : false,
                        minScore: followSettings ? effectiveMinScore : 0,
                        excludeTags: followSettings ? blacklist : [],
                        highQualityOnly: followSettings ? effectiveHighQualityOnly : false,
                        excludeLowQuality: followSettings ? effectiveExcludeLowQuality : false,
                        sort: 'random'
                    });
                    const fetched = result?.posts || [];
                    const unseen = fetched.filter(p => !excludedIds.has(p.id));
                    logger.info('Rule34', `Random attempt ${attempt + 1}/${maxAttempts}: page=${page} fetched=${fetched.length} unseen=${unseen.length} collected=${collected.length}`);
                    for (const p of unseen) {
                        excludedIds.add(p.id);
                        if (collected.length < randomCount) {
                            collected.push(p);
                            seenIds.add(p.id);
                        } else {
                            if (remainingOverflow.length + newOverflow.length < overflowLimit) {
                                newOverflow.push(p);
                            }
                        }
                    }
                    // Empty pages can happen on sparse queries; keep trying other pages.
                    if (fetched.length === 0) continue;
                }
                posts = collected;
                hasMore = posts.length > 0;
                // Store new overflow for next page
                session.overflowPosts = [...remainingOverflow, ...newOverflow].slice(0, overflowLimit);
                logger.info('Rule34', `Random page collected: ${posts.length}/${randomCount} posts (total seen: ${seenIds.size}, overflow: ${session.overflowPosts.length})`);
            } else if (session.type === 'trending') {
                const result = await this.deps.rule34Service.getTrending?.({
                    ...session.options,
                    excludeAi: effectiveExcludeAi,
                    page: newPage - 1
                });
                posts = result?.posts || [];
                hasMore = result?.hasMore || false;
            }
        };

        if (canEditReply) {
            await this._withFetchingState(interaction, 'other posts', fetchTask);
        } else {
            await fetchTask();
        }

        const preFilterCount = posts.length;
        // For random, all filters are already applied at the API/service level
        // during collection. Only apply local filter for search/trending.
        if (session.type !== 'random') {
            posts = posts.filter(post => {
                const postTags = (post.tags || '').split(' ');
                const isBlacklisted = postTags.some(t => blacklist.includes(t));
                if (isBlacklisted) return false;
                if (effectiveExcludeAi && post.isAiGenerated) return false;
                if (post.score < effectiveMinScore) return false;
                if (effectiveHighQualityOnly && !post.isHighQuality) return false;
                if (effectiveExcludeLowQuality && post.isLowQuality) return false;
                return true;
            });

            const removedCount = preFilterCount - posts.length;
            if (removedCount > 0) {
                logger.info('Rule34', `Page filter: ${preFilterCount} → ${posts.length} (removed ${removedCount} by local blacklist/AI/score/quality)`);
            }
        }

        if (posts.length === 0) {
            if (canEditReply) {
                await interaction.followUp({
                    content: '❌ No more results found.',
                    ephemeral: true
                });
            }
            return;
        }

        // Detect duplicate page: if the API wraps around and returns the same posts,
        // treat it as "no more results"
        const currentPostIds = new Set(session.posts?.map(p => p.id) || []);
        const newPostIds = posts.map(p => p.id);
        const allDuplicates = newPostIds.length > 0 && newPostIds.every(id => currentPostIds.has(id));
        if (session.type !== 'random' && allDuplicates && isForward) {
            hasMore = false;
            if (canEditReply) {
                await interaction.followUp({
                    content: '❌ No more results found.',
                    ephemeral: true
                });
            }
            // Update session to disable the next page button
            this.deps.rule34Cache?.updateSession?.(userId, { hasMore: false });
            return;
        }

        // For random sessions, accumulate seen IDs to avoid duplicates across pages
        const updateData: Record<string, any> = {
            posts: posts,
            currentIndex: 0,
            currentPage: newPage,
            hasMore: hasMore
        };
        if (session.type === 'random') {
            const prevSeen: number[] = session.seenPostIds || session.posts?.map(p => p.id) || [];
            const newSeen = new Set(prevSeen);
            for (const p of posts) newSeen.add(p.id);
            updateData.seenPostIds = [...newSeen];
            updateData.overflowPosts = session.overflowPosts || [];
        }
        this.deps.rule34Cache?.updateSession?.(userId, updateData);

        const post = posts[0];
        this.deps.rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

        if (post.hasVideo && this.deps.postHandler?.createVideoEmbed) {
            const { rows, embed: videoEmbed } = this.deps.postHandler.createVideoEmbed(post, {
                resultIndex: 0,
                totalResults: posts.length,
                userId,
                searchPage: newPage,
                hasMore,
                sessionType: (session.type as any) || 'search',
                maxPage: session.type === 'trending' ? 1 : 200
            });
            if (canEditReply) {
                await interaction.editReply({ content: '', embeds: [videoEmbed], components: rows });
            } else {
                await interaction.message.edit({ content: '', embeds: [videoEmbed], components: rows });
            }
            return;
        }

        const { embed, rows } = await this.deps.postHandler.createPostEmbed(post, {
            resultIndex: 0,
            totalResults: posts.length,
            query: session.query,
            userId,
            searchPage: newPage,
            hasMore,
            sessionType: (session.type as any) || 'search',
            maxPage: session.type === 'trending' ? 1 : 200
        });

        if (canEditReply) {
            await interaction.editReply({ content: '', embeds: [embed], components: rows });
        } else {
            await interaction.message.edit({ content: '', embeds: [embed], components: rows });
        }
    }

    private async _handleRelatedFromSession(interaction: ButtonInteraction, userId: string): Promise<void> {
        const session = this.deps.rule34Cache?.getSession?.(userId);

        if (!session) {
            await interaction.reply({
                content: '⏱️ Session expired. Please run the command again.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        const currentPost = session.posts[session.currentIndex];
        const queryFallback = (session.query || '').split(/\s+/).find(Boolean) || '';
        const baseTag = currentPost?.tagList?.[0] || queryFallback;

        if (!baseTag) {
            await interaction.followUp({
                content: '❌ Cannot determine a tag for related search.',
                ephemeral: true
            });
            return;
        }

        let relatedTags: Array<{ name?: string; tag?: string; count?: number }> = [];
        await this._withFetchingState(interaction, 'related tags', async () => {
            relatedTags = await this.deps.rule34Service?.getRelatedTags?.(baseTag, 20) || [];
        });

        const embed = this.deps.postHandler?.createRelatedTagsEmbed?.(baseTag, relatedTags as any)
            || this.deps.infoEmbed('Related Tags', relatedTags.map(t => `• ${t.name || t.tag || 'unknown'}`).join('\n') || 'No related tags found');

        await interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    private async _handleWatchVideo(interaction: ButtonInteraction, postIdStr: string, userId: string): Promise<void> {
        const session = this.deps.rule34Cache?.getSession?.(userId);
        if (!session || !Array.isArray(session.posts) || session.posts.length === 0) {
            await interaction.reply({
                content: '⏱️ Session expired. Please run the command again.',
                ephemeral: true
            });
            return;
        }

        const postId = Number.parseInt(postIdStr, 10);
        const postIndex = session.posts.findIndex(p => p.id === postId);
        const safeIndex = postIndex >= 0 ? postIndex : session.currentIndex;
        const post = session.posts[safeIndex];

        if (!post || !post.hasVideo || !this.deps.postHandler?.createVideoEmbed) {
            await interaction.reply({
                content: '❌ Video post not found in the current session.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();
        this.deps.rule34Cache?.updateSession?.(userId, { currentIndex: safeIndex });

        // Hide the embed entirely so Discord's native video player can render
        const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`rule34_watchback_${userId}`)
                .setLabel('◀ Back to Browse')
                .setStyle(ButtonStyle.Secondary)
        );
        await interaction.editReply({ content: `[Video](${post.fileUrl})`, embeds: [], components: [backRow] });
    }

    private async _handleWatchBack(interaction: ButtonInteraction, userId: string): Promise<void> {
        const session = this.deps.rule34Cache?.getSession?.(userId);
        if (!session || !session.posts?.length) {
            await interaction.reply({ content: '⏱️ Session expired. Please run the command again.', ephemeral: true });
            return;
        }

        await interaction.deferUpdate();

        const post = session.posts[session.currentIndex];
        const sessionHasMore = session.hasMore ?? true;

        if (post.hasVideo && this.deps.postHandler?.createVideoEmbed) {
            const { rows, embed: videoEmbed } = this.deps.postHandler.createVideoEmbed(post, {
                resultIndex: session.currentIndex,
                totalResults: session.posts.length,
                userId,
                searchPage: session.currentPage || 1,
                showTags: session.showTags,
                hasMore: sessionHasMore,
                sessionType: (session.type as any) || 'search',
                maxPage: session.type === 'trending' ? 1 : 200
            });
            await interaction.editReply({ content: '', embeds: [videoEmbed], components: rows });
            return;
        }

        const { embed, rows } = await this.deps.postHandler.createPostEmbed(post, {
            resultIndex: session.currentIndex,
            totalResults: session.posts.length,
            query: session.query,
            userId,
            searchPage: session.currentPage || 1,
            showTags: session.showTags,
            hasMore: sessionHasMore,
            sessionType: (session.type as any) || 'search',
            maxPage: session.type === 'trending' ? 1 : 200
        });
        await interaction.editReply({ content: '', embeds: [embed], components: rows });
    }

    private _buildDisabledButtonRows(interaction: ButtonInteraction): ActionRowBuilder<ButtonBuilder>[] {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];

        for (const row of interaction.message.components) {
            if (row.type !== ComponentType.ActionRow) continue;
            const rowComponents: any[] = (row as unknown as { components?: any[] }).components || [];
            const buttonRow = new ActionRowBuilder<ButtonBuilder>();
            for (const component of rowComponents) {
                if (component.type !== ComponentType.Button) continue;
                buttonRow.addComponents(ButtonBuilder.from(component as any).setDisabled(true));
            }
            if (buttonRow.components.length > 0) rows.push(buttonRow);
        }

        return rows;
    }

    private _buildFetchingEmbed(currentEmbed: EmbedBuilder, context: string, elapsedSec: number, totalSec: number = 60): EmbedBuilder {
        const embed = EmbedBuilder.from(currentEmbed);
        const statusLine = `⏳ Shoukaku is fetching ${context}... (${Math.min(elapsedSec, totalSec)}s / ${totalSec}s)`;
        const currentDescription = embed.data.description || '';
        const cleaned = currentDescription.replace(/^⏳ Shoukaku is fetching[^\n]*\n\n?/i, '');
        embed.setDescription(cleaned ? `${statusLine}\n\n${cleaned}` : statusLine);
        return embed;
    }

    private async _withFetchingState(
        interaction: ButtonInteraction,
        context: string,
        task: () => Promise<void>
    ): Promise<void> {
        if (!interaction.message.embeds.length) {
            await task();
            return;
        }

        const baseEmbed = EmbedBuilder.from(interaction.message.embeds[0]!);
        const disabledRows = this._buildDisabledButtonRows(interaction);
        let elapsed = 0;
        let stopped = false;

        const pushStatus = async (): Promise<void> => {
            if (stopped) return;
            const loadingEmbed = this._buildFetchingEmbed(baseEmbed, context, elapsed, 60);
            await interaction.editReply({ embeds: [loadingEmbed], components: disabledRows }).catch(() => {});
        };

        await pushStatus();

        const timer = setInterval(() => {
            elapsed += 1;
            if (elapsed <= 60) {
                void pushStatus();
            } else {
                clearInterval(timer);
            }
        }, 1000);

        try {
            await task();
        } finally {
            stopped = true;
            clearInterval(timer);
        }
    }

    private async _handleFavoriteToggle(interaction: ButtonInteraction, postIdStr: string, userId: string): Promise<void> {
        const postId = parseInt(postIdStr);
        const isFavorited = this.deps.rule34Cache?.isFavorited?.(userId, postId);

        if (isFavorited) {
            this.deps.rule34Cache?.removeFavorite?.(userId, postId);
            await interaction.reply({
                content: '💔 Removed from favorites.',
                ephemeral: true
            });
        } else {
            const session = this.deps.rule34Cache?.getSession?.(userId);
            const post = session?.posts.find(p => p.id === postId);

            this.deps.rule34Cache?.addFavorite?.(userId, postId, {
                score: post?.score,
                rating: post?.rating
            });

            await interaction.reply({
                content: '💖 Added to favorites!',
                ephemeral: true
            });
        }
    }

    private async _handleBlacklistAction(interaction: ButtonInteraction, action: string, userId: string): Promise<void> {
        switch (action) {
            case 'add': {
                const modal = new ModalBuilder()
                    .setCustomId(`rule34_bl_add_modal_${userId}`)
                    .setTitle('➕ Add Tags to Blacklist');

                const input = new TextInputBuilder()
                    .setCustomId('tags_input')
                    .setLabel('Tags to blacklist (space-separated)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Enter tags, e.g., ai_generated ugly bad_anatomy')
                    .setRequired(true)
                    .setMinLength(2)
                    .setMaxLength(500);

                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
                await interaction.showModal(modal);

                try {
                    const modalResponse = await interaction.awaitModalSubmit({
                        filter: i => i.customId === `rule34_bl_add_modal_${userId}`,
                        time: 60000
                    });

                    const tagsInput = modalResponse.fields.getTextInputValue('tags_input');
                    const tags = tagsInput.toLowerCase().split(/\s+/).filter(t => t.length > 0);

                    let addedCount = 0;
                    for (const tag of tags) {
                        if (this.deps.rule34Cache?.addToBlacklist?.(userId, tag)) {
                            addedCount++;
                        }
                    }

                    await this._showBlacklistView(modalResponse, userId, `✅ Added ${addedCount} tag(s) to blacklist`);
                } catch {
                    // Modal timed out
                }
                break;
            }
            case 'remove': {
                const modal = new ModalBuilder()
                    .setCustomId(`rule34_bl_remove_modal_${userId}`)
                    .setTitle('➖ Remove Tags from Blacklist');

                const input = new TextInputBuilder()
                    .setCustomId('tags_input')
                    .setLabel('Tags to remove (space-separated)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Enter tags to remove from blacklist')
                    .setRequired(true)
                    .setMinLength(2)
                    .setMaxLength(500);

                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
                await interaction.showModal(modal);

                try {
                    const modalResponse = await interaction.awaitModalSubmit({
                        filter: i => i.customId === `rule34_bl_remove_modal_${userId}`,
                        time: 60000
                    });

                    const tagsInput = modalResponse.fields.getTextInputValue('tags_input');
                    const tags = tagsInput.toLowerCase().split(/\s+/).filter(t => t.length > 0);

                    let removedCount = 0;
                    for (const tag of tags) {
                        if (this.deps.rule34Cache?.removeFromBlacklist?.(userId, tag)) {
                            removedCount++;
                        }
                    }

                    await this._showBlacklistView(modalResponse, userId, `✅ Removed ${removedCount} tag(s) from blacklist`);
                } catch {
                    // Modal timed out
                }
                break;
            }
            case 'clear': {
                this.deps.rule34Cache?.clearBlacklist?.(userId);
                await this._showBlacklistView(interaction, userId, '🗑️ Blacklist cleared!');
                break;
            }
        }
    }

    private async _showBlacklistView(interaction: ButtonInteraction | ModalSubmitInteraction, userId: string, message: string | null = null): Promise<void> {
        const blacklist = this.deps.rule34Cache?.getBlacklist?.(userId) || [];

        const embed = new EmbedBuilder()
            .setColor(0x2F3136)
            .setTitle('🚫 Manage Blacklist')
            .setDescription(
                (message ? `${message}\n\n` : '') +
                (blacklist.length > 0
                    ? `**Current blacklist (${blacklist.length}):**\n${blacklist.map(t => `\`${t}\``).join(' ')}`
                    : '*No tags blacklisted yet*')
            )
            .setFooter({ text: '💡 Click Add to blacklist tags, or Clear to remove all' });

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`rule34_bl_add_${userId}`)
                .setLabel('Add Tags')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId(`rule34_bl_remove_${userId}`)
                .setLabel('Remove Tags')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('➖')
                .setDisabled(blacklist.length === 0),
            new ButtonBuilder()
                .setCustomId(`rule34_bl_clear_${userId}`)
                .setLabel('Clear All')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
                .setDisabled(blacklist.length === 0),
            new ButtonBuilder()
                .setCustomId(`rule34_settings_back_${userId}`)
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('◀️')
        );

        if ('update' in interaction) {
            await interaction.update({ embeds: [embed], components: [buttons] });
        }
    }

    private async _refreshSettingsEmbed(interaction: ButtonInteraction | StringSelectMenuInteraction, userId: string): Promise<void> {
        const prefs = this.deps.rule34Cache?.getPreferences?.(userId) || {};
        const blacklist = this.deps.rule34Cache?.getBlacklist?.(userId) || [];

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('⚙️ Rule34 Settings & Blacklist')
            .setDescription('Configure your search preferences and manage blacklisted tags.');

        const aiStatus = prefs.aiFilter ? '✅ Hidden' : '❌ Shown';
        const qualityStatus = prefs.highQualityOnly ? '🔷 High Only' : (prefs.excludeLowQuality ? '🔶 No Low' : '⚪ All');
        const settingSearchStatus = prefs.settingSearch !== false ? '✅ Enabled' : '❌ Disabled';
        const sortDisplay: Record<string, string> = {
            'score:desc': '⬆️ Score (High)',
            'score:asc': '⬇️ Score (Low)',
            'id:desc': '🆕 Newest',
            'id:asc': '📅 Oldest',
            'random': '🎲 Random'
        };

        const settingsText = [
            `🔍 **Setting Search:** ${settingSearchStatus}`,
            `🤖 **AI Content:** ${aiStatus}`,
            `⭐ **Min Score:** ${this.deps.normalizeMinScore(prefs.minScore, 1)}`,
            `📊 **Quality:** ${qualityStatus}`,
            `📑 **Sort:** ${sortDisplay[prefs.sortMode || 'score:desc'] || '⬆️ Score (High)'}`
        ].join('\n');

        const blacklistText = blacklist.length > 0
            ? blacklist.slice(0, 20).map(t => `\`${t}\``).join(' ') + (blacklist.length > 20 ? `\n...and ${blacklist.length - 20} more` : '')
            : '*No tags blacklisted*';

        embed.addFields(
            { name: '📋 Current Settings', value: settingsText, inline: true },
            { name: `🚫 Blacklist (${blacklist.length})`, value: blacklistText, inline: true }
        );

        embed.setFooter({ text: '💡 Use the menus below to configure • Settings auto-save' });

        const settingSelect = new StringSelectMenuBuilder()
            .setCustomId(`rule34_settingmenu_${userId}`)
            .setPlaceholder('⚙️ Select a setting to change...')
            .addOptions([
                { label: 'Setting Search', value: 'setting_search', emoji: '🔍', description: 'Apply settings to /random and /search commands' },
                { label: 'AI Content Filter', value: 'ai', emoji: '🤖', description: 'Hide or show AI-generated content' },
                { label: 'Minimum Score', value: 'score', emoji: '⭐', description: 'Set minimum post score' },
                { label: 'Quality Filter', value: 'quality', emoji: '📊', description: 'Filter by image quality' },
                { label: 'Default Sort', value: 'sort', emoji: '📑', description: 'Change default sort order' },
                { label: 'Manage Blacklist', value: 'blacklist', emoji: '🚫', description: 'Add or remove blacklisted tags' }
            ]);

        const quickRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`rule34_settings_reset_${userId}`)
                .setLabel('Reset All')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

        await interaction.update({
            embeds: [embed],
            components: [
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(settingSelect),
                quickRow
            ]
        });
    }

    private async _handleSettingMenuSelect(interaction: StringSelectMenuInteraction, setting: string, userId: string): Promise<void> {
        try {
            switch (setting) {
                case 'setting_search': {
                    const prefs = this.deps.rule34Cache?.getPreferences?.(userId) || {};
                    const newValue = prefs.settingSearch === false ? true : false;
                    this.deps.rule34Cache?.setPreferences?.(userId, { settingSearch: newValue });
                    await this._refreshSettingsEmbed(interaction, userId);
                    break;
                }
                case 'ai': {
                    const prefs = this.deps.rule34Cache?.getPreferences?.(userId) || {};
                    const newValue = !prefs.aiFilter;
                    this.deps.rule34Cache?.setPreferences?.(userId, { aiFilter: newValue });
                    await this._refreshSettingsEmbed(interaction, userId);
                    break;
                }
                case 'quality': {
                    const prefs = this.deps.rule34Cache?.getPreferences?.(userId) || {};
                    if (!prefs.excludeLowQuality && !prefs.highQualityOnly) {
                        this.deps.rule34Cache?.setPreferences?.(userId, { excludeLowQuality: true, highQualityOnly: false });
                    } else if (prefs.excludeLowQuality) {
                        this.deps.rule34Cache?.setPreferences?.(userId, { excludeLowQuality: false, highQualityOnly: true });
                    } else {
                        this.deps.rule34Cache?.setPreferences?.(userId, { excludeLowQuality: false, highQualityOnly: false });
                    }
                    await this._refreshSettingsEmbed(interaction, userId);
                    break;
                }
                case 'sort': {
                    const sortSelect = new StringSelectMenuBuilder()
                        .setCustomId(`rule34_sort_select_${userId}`)
                        .setPlaceholder('Select sort order...')
                        .addOptions([
                            { label: 'Score (High to Low)', value: 'score:desc', emoji: '⬆️' },
                            { label: 'Score (Low to High)', value: 'score:asc', emoji: '⬇️' },
                            { label: 'Newest First', value: 'id:desc', emoji: '🆕' },
                            { label: 'Oldest First', value: 'id:asc', emoji: '📅' },
                            { label: 'Random', value: 'random', emoji: '🎲' }
                        ]);

                    const backBtn = new ButtonBuilder()
                        .setCustomId(`rule34_settings_back_${userId}`)
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('◀️');

                    await interaction.update({
                        components: [
                            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sortSelect),
                            new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn)
                        ]
                    });
                    break;
                }
                case 'blacklist': {
                    const blacklist = this.deps.rule34Cache?.getBlacklist?.(userId) || [];

                    const embed = new EmbedBuilder()
                        .setColor(0x2F3136)
                        .setTitle('🚫 Manage Blacklist')
                        .setDescription(
                            blacklist.length > 0
                                ? `**Current blacklist (${blacklist.length}):**\n${blacklist.map(t => `\`${t}\``).join(' ')}`
                                : '*No tags blacklisted yet*'
                        )
                        .setFooter({ text: '💡 Click Add to blacklist tags, or Clear to remove all' });

                    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`rule34_bl_add_${userId}`)
                            .setLabel('Add Tags')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('➕'),
                        new ButtonBuilder()
                            .setCustomId(`rule34_bl_remove_${userId}`)
                            .setLabel('Remove Tags')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('➖')
                            .setDisabled(blacklist.length === 0),
                        new ButtonBuilder()
                            .setCustomId(`rule34_bl_clear_${userId}`)
                            .setLabel('Clear All')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('🗑️')
                            .setDisabled(blacklist.length === 0),
                        new ButtonBuilder()
                            .setCustomId(`rule34_settings_back_${userId}`)
                            .setLabel('Back')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('◀️')
                    );

                    await interaction.update({ embeds: [embed], components: [buttons] });
                    break;
                }
                case 'score': {
                    const modal = new ModalBuilder()
                        .setCustomId(`rule34_score_modal_${userId}`)
                        .setTitle('⭐ Set Minimum Score');

                    const input = new TextInputBuilder()
                        .setCustomId('score_value')
                        .setLabel('Minimum score (1-100000)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Enter a number, e.g., 100')
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(6);

                    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
                    await interaction.showModal(modal);

                    try {
                        const modalResponse = await interaction.awaitModalSubmit({
                            filter: i => i.customId === `rule34_score_modal_${userId}`,
                            time: 60000
                        });

                        const value = parseInt(modalResponse.fields.getTextInputValue('score_value'));
                        if (!isNaN(value) && value >= 1 && value <= 100000) {
                            this.deps.rule34Cache?.setPreferences?.(userId, { minScore: value });
                        }
                        await this._refreshSettingsEmbed(modalResponse as unknown as StringSelectMenuInteraction, userId);
                    } catch {
                        // Modal timed out
                    }
                    break;
                }
            }
        } catch (error) {
            const err = error as Error & { code?: number };
            if (err.code !== 10062 && err.code !== 40060) {
                logger.error('Rule34', `SettingMenuSelect error: ${(error as Error).message}`);
            }
        }
    }
}

export async function handleRule34ButtonInteraction(
    interaction: ButtonInteraction,
    deps: Rule34InteractionDeps
): Promise<void> {
    const controller = new Rule34InteractionController(deps);
    await controller.handleButton(interaction);
}

export async function handleRule34SelectMenuInteraction(
    interaction: StringSelectMenuInteraction,
    deps: Rule34InteractionDeps
): Promise<void> {
    const controller = new Rule34InteractionController(deps);
    await controller.handleSelectMenu(interaction);
}



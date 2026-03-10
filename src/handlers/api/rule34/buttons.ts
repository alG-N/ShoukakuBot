import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { rule34Cache } from '../../../cache/api/rule34Cache.js';
import type { PostEmbedOptions, Rule34HandlerPreferences, Rule34Post } from './types.js';

export function createPostButtons(
    post: Rule34Post,
    options: PostEmbedOptions = {}
): ActionRowBuilder<ButtonBuilder>[] {
    const {
        resultIndex = 0,
        totalResults = 1,
        userId = '',
        searchPage = 1,
        hasMore = true,
        sessionType = 'search',
        maxPage = 200
    } = options;
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const showPageControls = sessionType !== 'single' && sessionType !== 'trending';

    const navRow = new ActionRowBuilder<ButtonBuilder>();
    navRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`rule34_prev_${userId}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(resultIndex === 0 && searchPage === 1),
        new ButtonBuilder()
            .setCustomId(`rule34_counter_${userId}`)
            .setLabel(`${resultIndex + 1}/${totalResults}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`rule34_next_${userId}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(resultIndex >= totalResults - 1),
        new ButtonBuilder()
            .setCustomId(`rule34_selectpost_${userId}`)
            .setLabel('🔢 Select Post')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(totalResults <= 1)
    );
    rows.push(navRow);

    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    if (post.hasVideo) {
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`rule34_watch_${post.id}_${userId}`)
                .setLabel('▶️ Watch Video')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder().setLabel('View on Site').setStyle(ButtonStyle.Link).setURL(post.pageUrl)
        );
    } else {
        actionRow.addComponents(
            new ButtonBuilder().setLabel('Full Image').setStyle(ButtonStyle.Link).setURL(post.fileUrl),
            new ButtonBuilder().setLabel('View on Site').setStyle(ButtonStyle.Link).setURL(post.pageUrl)
        );
    }

    const isFavorited = rule34Cache.isFavorited(userId, post.id);
    actionRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`rule34_fav_${post.id}_${userId}`)
            .setLabel(isFavorited ? '💔' : '❤️')
            .setStyle(isFavorited ? ButtonStyle.Danger : ButtonStyle.Secondary)
    );
    rows.push(actionRow);

    if (showPageControls) {
        // Disable next page if we already know this is the last page.
        const disableNextPage = !hasMore && resultIndex >= totalResults - 1;

        const pageRow = new ActionRowBuilder<ButtonBuilder>();
        pageRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`rule34_prevpage_${userId}`)
                .setLabel('⏮ Prev Page')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(searchPage <= 1),
            new ButtonBuilder()
                .setCustomId(`rule34_pageinfo_${userId}`)
                .setLabel(`Page ${searchPage}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`rule34_nextpage_${userId}`)
                .setLabel('Next Page ⏭')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableNextPage)
        );
        rows.push(pageRow);
    }

    return rows;
}

export function createSettingsComponents(
    userId: string
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
    const prefs: Rule34HandlerPreferences = rule34Cache.getPreferences(userId) || {};
    const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`rule34_setting_aifilter_${userId}`)
            .setPlaceholder('🤖 AI Content Filter')
            .addOptions([
                {
                    label: 'Hide AI Content',
                    description: 'Filter out AI-generated posts',
                    value: 'true',
                    emoji: '🚫',
                    default: !!prefs.aiFilter
                },
                {
                    label: 'Show AI Content',
                    description: 'Include AI-generated posts',
                    value: 'false',
                    emoji: '✅',
                    default: !prefs.aiFilter
                }
            ])
    );
    rows.push(row1);

    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`rule34_setting_sort_${userId}`)
            .setPlaceholder('📑 Default Sort Order')
            .addOptions([
                { label: 'Score (High to Low)', description: 'Best rated posts first', value: 'score:desc', emoji: '⬆️', default: prefs.sortMode === 'score:desc' },
                { label: 'Score (Low to High)', description: 'Lowest rated posts first', value: 'score:asc', emoji: '⬇️', default: prefs.sortMode === 'score:asc' },
                { label: 'Newest First', description: 'Most recent posts first', value: 'id:desc', emoji: '🆕', default: prefs.sortMode === 'id:desc' },
                { label: 'Oldest First', description: 'Oldest posts first', value: 'id:asc', emoji: '📅', default: prefs.sortMode === 'id:asc' },
                { label: 'Random', description: 'Randomize results', value: 'random', emoji: '🎲', default: prefs.sortMode === 'random' }
            ])
    );
    rows.push(row2);

    const row3 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`rule34_setting_quality_${userId}`)
            .setPlaceholder('📊 Quality Filter')
            .addOptions([
                { label: 'Show All Quality', description: 'No quality filtering', value: 'all', emoji: '⚪', default: !prefs.excludeLowQuality && !prefs.highQualityOnly },
                { label: 'Exclude Low Quality', description: 'Hide low resolution posts', value: 'exclude_low', emoji: '🔶', default: !!prefs.excludeLowQuality },
                { label: 'High Quality Only', description: 'Only show HD posts', value: 'high_only', emoji: '🔷', default: !!prefs.highQualityOnly }
            ])
    );
    rows.push(row3);

    const row4 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`rule34_setting_minscore_${userId}`)
            .setPlaceholder('⭐ Minimum Score')
            .addOptions([
                { label: 'No Minimum', description: 'Show all posts regardless of score', value: '0', emoji: '0️⃣', default: prefs.minScore === 0 || !prefs.minScore },
                { label: 'Score ≥ 10', description: 'Filter very low scored posts', value: '10', emoji: '🔟', default: prefs.minScore === 10 },
                { label: 'Score ≥ 50', description: 'Only decent posts', value: '50', default: prefs.minScore === 50 },
                { label: 'Score ≥ 100', description: 'Only good posts', value: '100', emoji: '💯', default: prefs.minScore === 100 },
                { label: 'Score ≥ 500', description: 'Only popular posts', value: '500', emoji: '🔥', default: prefs.minScore === 500 },
                { label: 'Score ≥ 1000', description: 'Only top posts', value: '1000', emoji: '⭐', default: prefs.minScore === 1000 }
            ])
    );
    rows.push(row4);

    const row5 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`rule34_settings_reset_${userId}`)
            .setLabel('Reset All')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔄'),
        new ButtonBuilder()
            .setCustomId(`rule34_settings_close_${userId}`)
            .setLabel('Done')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
    );
    rows.push(row5);

    return rows;
}


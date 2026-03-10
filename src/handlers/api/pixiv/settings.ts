/**
 * Pixiv Settings — UI Components
 * Builds embeds and select menus for /pixiv settings
 */

import {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import type { PixivUserPreferences } from '../../../types/api/models/content-session.js';

const CONTENT_TYPE_LABELS: Record<string, string> = {
    illust: '🎨 Illustration',
    manga: '📚 Manga',
    novel: '📖 Light Novel'
};

const SORT_LABELS: Record<string, string> = {
    popular_desc: '🔥 Popular',
    date_desc: '🆕 Newest First',
    date_asc: '📅 Oldest First',
    day: '📊 Daily Ranking',
    week: '📈 Weekly Ranking',
    month: '🏆 Monthly Ranking'
};

export function createSettingsEmbed(prefs: PixivUserPreferences): EmbedBuilder {
    const contentDisplay = prefs.contentTypes
        .map(t => CONTENT_TYPE_LABELS[t] || t)
        .join(', ') || 'None';

    let nsfwDisplay: string;
    if (prefs.r18Enabled) {
        nsfwDisplay = '🔥 R18 Only';
    } else if (prefs.nsfwMode === 'all') {
        nsfwDisplay = '🔞 R18 + SFW (All)';
    } else {
        nsfwDisplay = '✅ SFW Only';
    }

    return new EmbedBuilder()
        .setColor(0x0096FA)
        .setTitle('⚙️ Pixiv Settings')
        .setDescription(
            'These settings will be used as defaults when you use `/pixiv [character_name]`.\n' +
            'Command-level options will override these settings.'
        )
        .addFields(
            { name: '📂 Content Types', value: contentDisplay, inline: true },
            { name: '🔞 NSFW Mode', value: nsfwDisplay, inline: true },
            { name: '📊 Sort', value: SORT_LABELS[prefs.sortMode] || prefs.sortMode, inline: true },
            { name: '🤖 AI Filter', value: prefs.aiFilter ? '✅ Hide AI Art' : '❌ Show AI Art', inline: true },
            { name: '⭐ Quality Filter', value: prefs.qualityFilter ? '✅ Hide Low Quality' : '❌ Show All', inline: true },
            { name: '📖 Min Bookmarks', value: prefs.minBookmarks > 0 ? `≥ ${prefs.minBookmarks}` : 'None', inline: true },
            { name: '🌐 Auto Translate', value: prefs.translate ? '✅ On' : '❌ Off', inline: true }
        )
        .setFooter({ text: 'R18 mode and NSFW/SFW are mutually exclusive' })
        .setTimestamp();
}

export function createSettingsComponents(userId: string, prefs: PixivUserPreferences): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
    // Row 1: Content type (multiple choice)
    const contentTypeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`pixiv_setting_contenttype_${userId}`)
            .setPlaceholder('Select content types')
            .setMinValues(1)
            .setMaxValues(3)
            .addOptions(
                { label: 'Illustration', value: 'illust', emoji: '🎨', default: prefs.contentTypes.includes('illust') },
                { label: 'Manga', value: 'manga', emoji: '📚', default: prefs.contentTypes.includes('manga') },
                { label: 'Light Novel', value: 'novel', emoji: '📖', default: prefs.contentTypes.includes('novel') }
            )
    );

    // Row 2: NSFW mode — R18 vs SFW/All (mutually exclusive behavior)
    const nsfwRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`pixiv_setting_nsfw_${userId}`)
            .setPlaceholder('Select NSFW mode')
            .addOptions(
                { label: 'SFW Only', value: 'sfw', emoji: '✅', default: !prefs.r18Enabled && prefs.nsfwMode === 'sfw' },
                { label: 'R18 + SFW (All)', value: 'all', emoji: '🔞', default: !prefs.r18Enabled && prefs.nsfwMode === 'all' },
                { label: 'R18 Only', value: 'r18', emoji: '🔥', default: prefs.r18Enabled }
            )
    );

    // Row 3: Sort mode
    const sortRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`pixiv_setting_sort_${userId}`)
            .setPlaceholder('Select sort mode')
            .addOptions(
                { label: 'Popular', value: 'popular_desc', emoji: '🔥', default: prefs.sortMode === 'popular_desc' },
                { label: 'Newest First', value: 'date_desc', emoji: '🆕', default: prefs.sortMode === 'date_desc' },
                { label: 'Oldest First', value: 'date_asc', emoji: '📅', default: prefs.sortMode === 'date_asc' },
                { label: 'Daily Ranking', value: 'day', emoji: '📊', default: prefs.sortMode === 'day' },
                { label: 'Weekly Ranking', value: 'week', emoji: '📈', default: prefs.sortMode === 'week' },
                { label: 'Monthly Ranking', value: 'month', emoji: '🏆', default: prefs.sortMode === 'month' }
            )
    );

    // Row 4: Toggle buttons for filters
    const filterRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`pixiv_setting_ai_${userId}`)
            .setLabel(prefs.aiFilter ? '🤖 AI Filter: ON' : '🤖 AI Filter: OFF')
            .setStyle(prefs.aiFilter ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`pixiv_setting_quality_${userId}`)
            .setLabel(prefs.qualityFilter ? '⭐ Quality: ON' : '⭐ Quality: OFF')
            .setStyle(prefs.qualityFilter ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`pixiv_setting_translate_${userId}`)
            .setLabel(prefs.translate ? '🌐 Translate: ON' : '🌐 Translate: OFF')
            .setStyle(prefs.translate ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    return [contentTypeRow, nsfwRow, sortRow, filterRow];
}

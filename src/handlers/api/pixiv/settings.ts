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
        nsfwDisplay = '🔞 NSFW + SFW (All)';
    } else {
        nsfwDisplay = '✅ SFW Only';
    }

    return new EmbedBuilder()
        .setColor(0x0096FA)
        .setTitle('⚙️ Pixiv Settings')
        .setDescription(
            'These settings will be used as defaults when you use `/pixiv [character_name]`.\n' +
            'Command-level options will take priority over these settings.'
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
    // Single row: 3 toggles + reset.
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
            .setStyle(prefs.translate ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`pixiv_setting_reset_${userId}`)
            .setLabel('Reset')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
    );

    return [filterRow];
}

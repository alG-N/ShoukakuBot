/**
 * Media Command — Embed Fix + Image/GIF Viewer
 * Convert social media URLs to embed-fix URLs for better Discord embedding
 * Also supports direct image/GIF URLs from any source
 * Usage: /media [link]
 * Supports: Twitter/X, TikTok, Instagram, Reddit, Bluesky, Threads, Direct Images/GIFs
 * @module commands/api/media
 */

import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { COLORS } from '../../constants.js';
import logger from '../../core/Logger.js';
import embedService from '../../services/api/embedService.js';

// IMAGE/GIF DETECTION

/** Known image hosting domains */
const IMAGE_HOSTS = [
    'imgur.com', 'i.imgur.com',
    'giphy.com', 'media.giphy.com', 'i.giphy.com',
    'tenor.com', 'media.tenor.com', 'c.tenor.com',
    'pbs.twimg.com', 'media.discordapp.net', 'cdn.discordapp.com',
    'i.redd.it', 'preview.redd.it',
    'media.tumblr.com',
    'i.pinimg.com',
    'upload.wikimedia.org',
    'raw.githubusercontent.com',
    'catbox.moe', 'files.catbox.moe',
    'pixiv.net', 'i.pximg.net',
    'gelbooru.com', 'img3.gelbooru.com',
    'danbooru.donmai.us',
    'konachan.com',
    'yande.re',
    'safebooru.org',
    'rule34.xxx',
    'e621.net', 'static1.e621.net',
    'waifu.im',
    'nekos.best',
    'picsum.photos',
    'unsplash.com', 'images.unsplash.com',
];

/** File extensions for images/GIFs */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.apng', '.avif'];

/**
 * Check if a URL is a direct image/GIF link
 */
function isDirectImageUrl(url: string): { isImage: boolean; isGif: boolean; isAnimated: boolean } {
    try {
        const parsed = new URL(url);
        const pathname = parsed.pathname.toLowerCase();
        const hostname = parsed.hostname.toLowerCase();

        // Check file extension
        const hasImageExt = IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext));
        const isGif = pathname.endsWith('.gif');
        const isApng = pathname.endsWith('.apng');
        const isWebp = pathname.endsWith('.webp'); // could be animated

        if (hasImageExt) {
            return { isImage: true, isGif, isAnimated: isGif || isApng };
        }

        // Check known image hosts (some serve images without extensions)
        const isKnownHost = IMAGE_HOSTS.some(host =>
            hostname === host || hostname.endsWith('.' + host)
        );

        // Imgur direct links (without extension but with /a/ or image ID)
        if (hostname.includes('imgur.com') && /\/[a-zA-Z0-9]{5,}/.test(pathname)) {
            return { isImage: true, isGif: false, isAnimated: false };
        }

        // Giphy/Tenor always serve animated content
        if (hostname.includes('giphy.com') || hostname.includes('tenor.com')) {
            return { isImage: true, isGif: true, isAnimated: true };
        }

        // Generic image hosts - only if path looks like an image
        if (isKnownHost && /\/(images?|gallery|photo|pic|media|upload|file)\/?/i.test(pathname)) {
            return { isImage: true, isGif: false, isAnimated: false };
        }

        return { isImage: false, isGif: false, isAnimated: false };
    } catch {
        return { isImage: false, isGif: false, isAnimated: false };
    }
}

/**
 * Get a display-friendly source name from URL
 */
function getSourceName(url: string): { name: string; emoji: string } {
    try {
        const hostname = new URL(url).hostname.toLowerCase();

        if (hostname.includes('imgur')) return { name: 'Imgur', emoji: '📦' };
        if (hostname.includes('giphy')) return { name: 'Giphy', emoji: '🎞️' };
        if (hostname.includes('tenor')) return { name: 'Tenor', emoji: '🎞️' };
        if (hostname.includes('reddit') || hostname.includes('redd.it')) return { name: 'Reddit', emoji: '🤖' };
        if (hostname.includes('discord')) return { name: 'Discord', emoji: '💬' };
        if (hostname.includes('twitter') || hostname.includes('twimg')) return { name: 'Twitter', emoji: '𝕏' };
        if (hostname.includes('tumblr')) return { name: 'Tumblr', emoji: '📝' };
        if (hostname.includes('pinterest') || hostname.includes('pinimg')) return { name: 'Pinterest', emoji: '📌' };
        if (hostname.includes('pixiv') || hostname.includes('pximg')) return { name: 'Pixiv', emoji: '🎨' };
        if (hostname.includes('gelbooru')) return { name: 'Gelbooru', emoji: '🖼️' };
        if (hostname.includes('danbooru')) return { name: 'Danbooru', emoji: '🖼️' };
        if (hostname.includes('konachan')) return { name: 'Konachan', emoji: '🖼️' };
        if (hostname.includes('yande.re')) return { name: 'Yande.re', emoji: '🖼️' };
        if (hostname.includes('safebooru')) return { name: 'Safebooru', emoji: '🖼️' };
        if (hostname.includes('rule34')) return { name: 'Rule34', emoji: '🖼️' };
        if (hostname.includes('e621')) return { name: 'e621', emoji: '🐾' };
        if (hostname.includes('catbox')) return { name: 'Catbox', emoji: '📦' };
        if (hostname.includes('wikimedia') || hostname.includes('wikipedia')) return { name: 'Wikimedia', emoji: '📚' };
        if (hostname.includes('unsplash')) return { name: 'Unsplash', emoji: '📷' };
        if (hostname.includes('github')) return { name: 'GitHub', emoji: '🐙' };

        // Extract domain name
        const parts = hostname.replace('www.', '').split('.');
        const domain = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        return { name: domain, emoji: '🌐' };
    } catch {
        return { name: 'Unknown', emoji: '🌐' };
    }
}

// URL CLEANING

/** Tracking parameters to strip from URLs */
const TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_name', 'utm_term', 'utm_content', 'utm_campaign',
    'si', 'igsh', 'igshid', 'feature', 'ref_src', 'ref_url', 'ref',
    's', 't', 'fbclid', 'gclid', 'mc_cid', 'mc_eid',
];

/**
 * Clean a URL by stripping tracking/analytics parameters and normalizing
 */
function cleanUrl(url: string): string {
    try {
        const parsed = new URL(url);

        // Strip tracking params
        for (const param of TRACKING_PARAMS) {
            parsed.searchParams.delete(param);
        }

        // Remove www. prefix
        if (parsed.hostname.startsWith('www.')) {
            parsed.hostname = parsed.hostname.slice(4);
        }

        // Remove empty query string
        let result = parsed.toString();
        if (result.endsWith('?')) result = result.slice(0, -1);

        return result;
    } catch {
        return url;
    }
}

// COMMAND

class MediaCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: false,
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('media')
            .setDescription('Fix social media embeds or view images/GIFs in Discord')
            .addStringOption(option =>
                option.setName('link')
                    .setDescription('Social media URL or direct image/GIF link')
                    .setRequired(true)
                    .setMaxLength(500)
            ) as unknown as CommandData;
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        const rawUrl = interaction.options.getString('link', true).trim();

        // Basic URL validation
        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
            await interaction.reply({ content: '❌ Invalid URL.', ephemeral: true });
            return;
        }

        // Clean tracking params from input URL
        const url = cleanUrl(rawUrl);

        // 1. Check if it's a direct image/GIF URL
        const imageCheck = isDirectImageUrl(url);
        if (imageCheck.isImage) {
            await this._handleImageUrl(interaction, url, imageCheck);
            return;
        }

        // 2. Try social media embed fix
        const result = embedService.convert(url);

        if (!result.success) {
            const platforms = embedService.getSupportedPlatforms()
                .map(p => `${p.emoji} ${p.name}`)
                .join(', ');
            await interaction.reply({
                content: `❌ Unsupported URL.\n\n**Supported platforms:** ${platforms}\n**Also supports:** direct image/GIF URLs`,
                ephemeral: true,
            });
            return;
        }

        // Clean the fx URL too (strip leftover tracking params)
        const cleanFxUrl = cleanUrl(result.fixedUrl!);

        // "Original link" button (points to original, clean URL)
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('Original link')
                .setStyle(ButtonStyle.Link)
                .setURL(url)
                .setEmoji('🔗')
        );

        // Format as masked link: [🤖 Reddit](fxUrl)
        // Discord auto-embeds the URL from masked links in bot messages
        const content = `[${result.platform!.emoji} ${result.platform!.name}](${cleanFxUrl})`;

        await interaction.reply({ content, components: [row] });

        logger.debug('MediaCommand', `Fixed ${result.platform!.name} URL for ${interaction.user.tag}`);
    }

    /**
     * Handle direct image/GIF URLs — show in embed with Original button
     */
    private async _handleImageUrl(
        interaction: ChatInputCommandInteraction,
        url: string,
        imageInfo: { isImage: boolean; isGif: boolean; isAnimated: boolean }
    ): Promise<void> {
        const source = getSourceName(url);
        const mediaType = imageInfo.isGif || imageInfo.isAnimated ? 'GIF' : 'Image';

        const embed = new EmbedBuilder()
            .setColor(COLORS.API)
            .setImage(url)
            .setFooter({ text: `${source.emoji} ${source.name} • ${mediaType}` })
            .setTimestamp();

        // "Original" button to open the source URL
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('Original')
                .setStyle(ButtonStyle.Link)
                .setURL(url)
                .setEmoji('🔗')
        );

        await interaction.reply({ embeds: [embed], components: [row] });

        logger.debug('MediaCommand', `Displayed ${mediaType} from ${source.name} for ${interaction.user.tag}`);
    }
}

export default new MediaCommand();

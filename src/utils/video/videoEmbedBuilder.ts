/**
 * Enhanced VideoEmbedBuilder with animated progress and modern UI
 * @module utils/video/videoEmbedBuilder
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ColorResolvable } from 'discord.js';
import progressAnimator from './progressAnimator.js';
import type { ProgressOptions, SuccessOptions } from '../../types/video/embed-builder.js';

// VIDEO EMBED BUILDER CLASS
class VideoEmbedBuilder {
    private colors: Record<string, ColorResolvable>;

    constructor() {
        // Color palette
        this.colors = {
            primary: '#5865F2',      // Discord Blurple
            success: '#57F287',      // Green
            warning: '#FEE75C',      // Yellow
            error: '#ED4245',        // Red
            info: '#5865F2',         // Blue
            loading: '#3498DB',      // Light blue
            tiktok: '#000000',
            twitter: '#1DA1F2',
            instagram: '#E4405F',
            youtube: '#FF0000',
            reddit: '#FF4500',
            facebook: '#1877F2',
            twitch: '#9146FF',
            vimeo: '#1AB7EA',
            web: '#7289DA',
        };
    }

    /**
     * Get platform-specific color
     */
    getPlatformColor(platformId: string): ColorResolvable {
        return this.colors[platformId] || this.colors.primary!;
    }

    /**
     * Build an enhanced loading embed with animated progress
     */
    buildLoadingEmbed(platformName: string, platformId: string = 'web', stage: string = 'initializing'): EmbedBuilder {
        const color = this.getPlatformColor(platformId);
        
        const stages: Record<string, { icon: string; text: string; progress: number }> = {
            initializing: { icon: '🎬', text: 'Initializing download...', progress: 0 },
            connecting: { icon: '📡', text: 'Connecting to server...', progress: 15 },
            analyzing: { icon: '🔍', text: 'Analyzing video...', progress: 30 },
            downloading: { icon: '📥', text: 'Downloading video...', progress: 50 },
            processing: { icon: '⚙️', text: 'Processing video...', progress: 75 },
            compressing: { icon: '📦', text: 'Compressing video...', progress: 85 },
            uploading: { icon: '☁️', text: 'Uploading to Discord...', progress: 95 },
        };

        const currentStage = stages[stage] || stages.initializing!;
        const progressBar = progressAnimator.createProgressBar(currentStage.progress, 'default');

        return new EmbedBuilder()
            .setTitle(`${currentStage.icon} Processing Video`)
            .setDescription([
                `**Platform:** ${platformName}`,
                '',
                `\`${progressBar}\``,
                '',
                `${currentStage.text}`,
            ].join('\n'))
            .setColor(color)
            .setFooter({ text: '🎬 Video Downloader • Processing your request' })
            .setTimestamp();
    }

    /**
     * Build progress update embed with detailed information
     */
    buildProgressEmbed(platformName: string, platformId: string, options: ProgressOptions = {}): EmbedBuilder {
        const {
            stage = 'downloading',
            percent = 0,
            downloaded = 0,
            total = 0,
            speed = 0,
            eta = 0,
            method = 'Cobalt',
        } = options;

        const color = this.getPlatformColor(platformId);
        const progressBar = progressAnimator.createProgressBar(percent, 'default');

        const stageEmojis: Record<string, string> = {
            connecting: '📡',
            downloading: '📥',
            processing: '⚙️',
            compressing: '📦',
            uploading: '☁️',
            fallback: '🔄',
        };

        const stageTexts: Record<string, string> = {
            connecting: 'Connecting...',
            downloading: 'Downloading...',
            processing: 'Optimizing for mobile...',
            compressing: 'Compressing...',
            uploading: 'Uploading...',
            fallback: 'Trying alternate method...',
        };

        const description = [
            `**Platform:** ${platformName}`,
            `**Method:** ${method}`,
            '',
            `\`${progressBar}\``,
            '',
            `${stageEmojis[stage] || '📥'} **${stageTexts[stage] || 'Processing...'}**`,
        ];

        // Add stats if available
        const stats: string[] = [];
        if (total > 0) {
            stats.push(`📊 ${progressAnimator.formatBytes(downloaded)} / ${progressAnimator.formatBytes(total)}`);
        } else if (downloaded > 0) {
            stats.push(`📊 ${progressAnimator.formatBytes(downloaded)}`);
        }
        if (speed > 0) {
            stats.push(`⚡ ${progressAnimator.formatBytes(speed)}/s`);
        }
        if (eta > 0) {
            stats.push(`⏱️ ~${progressAnimator.formatTime(eta)}`);
        }

        if (stats.length > 0) {
            description.push('', stats.join(' • '));
        }

        return new EmbedBuilder()
            .setTitle('📥 Downloading Video')
            .setDescription(description.join('\n'))
            .setColor(color)
            .setFooter({ text: '🎬 Video Downloader' })
            .setTimestamp();
    }

    /**
     * Build enhanced error embed with helpful suggestions
     */
    buildErrorEmbed(title: string, description: string, footer: string | null = null, suggestions: string[] = []): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(this.colors.error!)
            .setTimestamp();

        let fullDescription = description;

        if (suggestions.length > 0) {
            fullDescription += '\n\n**💡 Suggestions:**\n' + suggestions.map(s => `• ${s}`).join('\n');
        }

        embed.setDescription(fullDescription);

        if (footer) {
            embed.setFooter({ text: footer });
        }

        return embed;
    }

    /**
     * Build invalid URL embed
     */
    buildInvalidUrlEmbed(customMessage: string | null = null): EmbedBuilder {
        return this.buildErrorEmbed(
            '❌ Invalid URL',
            customMessage || 'Please provide a valid URL starting with `http://` or `https://`',
            null,
            [
                'Make sure to copy the full URL',
                'The URL should start with http:// or https://',
                'Check for any extra spaces or characters'
            ]
        );
    }

    /**
     * Build download failed embed with detailed error info
     */
    buildDownloadFailedEmbed(error: string): EmbedBuilder {
        const errorMessages: Record<string, string> = {
            'private': 'The video appears to be private or restricted',
            'unavailable': 'The video is no longer available',
            'geo-restricted': 'This video may be geo-restricted',
            'geo-blocked': 'This video may be geo-restricted',
            'age_gate': 'This video requires age verification',
            'age-restricted': 'This video requires age verification',
            'age restricted': 'This video requires age verification',
            'sign in': 'This video requires age verification',
            'timeout': 'The download timed out - server may be slow',
            'timed out': 'The download timed out - server may be slow',
            'no compatible': 'No compatible video format found',
            'format not': 'No compatible video format found',
            'empty': 'Downloaded file was empty - video may be unavailable',
            'not found': 'Video not found or has been removed',
            'blocked': 'This video is blocked or restricted',
        };

        let friendlyError = error;
        const suggestions = [
            'Make sure the video is public',
            'Try a different video URL',
            'Use `/video method:link` for direct link'
        ];

        // Check for common error patterns using word boundaries
        const lowerError = error.toLowerCase();
        for (const [key, message] of Object.entries(errorMessages)) {
            const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(lowerError)) {
                friendlyError = message;
                break;
            }
        }

        return this.buildErrorEmbed(
            '❌ Download Failed',
            friendlyError,
            'Check that the video is public and accessible',
            suggestions
        );
    }

    /**
     * Build upload failed embed
     */
    buildUploadFailedEmbed(): EmbedBuilder {
        return this.buildErrorEmbed(
            '❌ Upload Failed',
            'Failed to upload the video to Discord.',
            null,
            [
                'The file might be corrupted',
                'Discord may be experiencing issues',
                'Try again in a moment'
            ]
        );
    }

    /**
     * Build file too large embed with size information
     */
    buildFileTooLargeEmbed(sizeMB: number, maxMB: number = 25): EmbedBuilder {
        const overBy = (sizeMB - maxMB).toFixed(2);
        
        return new EmbedBuilder()
            .setTitle('📦 File Too Large')
            .setDescription([
                `The video is **${sizeMB.toFixed(2)} MB** which exceeds the limit.`,
                '',
                '```',
                `📊 Video Size:  ${sizeMB.toFixed(2)} MB`,
                `📏 Max Limit:   ${maxMB} MB`,
                `📈 Over by:     ${overBy} MB`,
                '```',
                '',
                '**💡 Suggestions:**',
                '• Try downloading a shorter clip',
                '• Use `/video method:link` for direct link',
                '• Use a server with Nitro boost (50-100 MB limit)',
            ].join('\n'))
            .setColor(this.colors.warning!)
            .setFooter({ text: '🎬 Video Downloader • File size limit exceeded' })
            .setTimestamp();
    }

    /**
     * Build success embed with video information
     */
    buildSuccessEmbed(options: SuccessOptions = {}): EmbedBuilder {
        const {
            platformName = 'Unknown',
            platformId = 'web',
            sizeMB = 0,
            format = 'MP4',
            duration = null,
            quality = null,
            method = 'Auto',
        } = options;

        const color = this.getPlatformColor(platformId);
        
        const stats = [
            `📦 **Size:** ${sizeMB.toFixed(2)} MB`,
            `🎬 **Format:** ${format}`,
        ];

        if (quality) {
            stats.push(`📺 **Quality:** ${progressAnimator.createQualityBadge(quality)}`);
        }
        if (duration) {
            stats.push(`⏱️ **Duration:** ${duration}`);
        }
        stats.push(`🔧 **Method:** ${method}`);

        return new EmbedBuilder()
            .setTitle('✅ Video Ready!')
            .setDescription([
                `**Platform:** ${platformName}`,
                '',
                stats.join('\n'),
                '',
                '> *Video will be attached below* ⬇️'
            ].join('\n'))
            .setColor(color)
            .setFooter({ text: '🎬 Video Downloader • Download complete!' })
            .setTimestamp();
    }

    /**
     * Build direct link embed
     */
    buildDirectLinkEmbed(title: string | null, url: string, size: string | null, thumbnail: string | null): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle('🔗 Direct Link Ready!')
            .setDescription([
                `**${title || 'Video'}**`,
                '',
                `📦 **Size:** ${size || 'Unknown'} MB`,
                '',
                `[📥 Click here to download](${url})`,
                '',
                '> ⚠️ *Direct links may expire quickly. Download soon!*'
            ].join('\n'))
            .setColor(this.colors.success!)
            .setFooter({ text: '🎬 Video Downloader • Link generated' })
            .setTimestamp();

        if (thumbnail) {
            embed.setThumbnail(thumbnail);
        }

        return embed;
    }

    /**
     * Build direct link not available embed
     */
    buildDirectLinkNotAvailableEmbed(): EmbedBuilder {
        return this.buildErrorEmbed(
            '❌ Direct Link Not Available',
            'Could not generate a direct link for this video.',
            null,
            [
                'Try using the **Download File** method instead',
                'Some platforms don\'t support direct links',
                'The video might be protected or private'
            ]
        );
    }

    /**
     * Build compression progress embed
     */
    buildCompressionEmbed(originalSize: number, targetSize: number, progress: number = 0): EmbedBuilder {
        const progressBar = progressAnimator.createProgressBar(progress, 'default');
        
        return new EmbedBuilder()
            .setTitle('📦 Compressing Video')
            .setDescription([
                `\`${progressBar}\``,
                '',
                '```',
                `📊 Original: ${originalSize.toFixed(2)} MB`,
                `🎯 Target:   ${targetSize.toFixed(2)} MB`,
                '```',
                '',
                '> *Compressing to fit Discord\'s file limit...*'
            ].join('\n'))
            .setColor(this.colors.warning!)
            .setFooter({ text: '🎬 Video Downloader • Compression in progress' })
            .setTimestamp();
    }

    /**
     * Build method selection buttons
     */
    buildMethodButtons(disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('video_auto')
                    .setLabel('Auto Download')
                    .setEmoji('📥')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('video_link')
                    .setLabel('Direct Link')
                    .setEmoji('🔗')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
            );
    }

    /**
     * Build help/info embed for the video command
     */
    buildHelpEmbed(): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle('🎬 Video Downloader Help')
            .setDescription([
                '**Supported Platforms:**',
                '```',
                '🎵 TikTok      📷 Instagram',
                '𝕏  Twitter/X   ▶️ YouTube',
                '🤖 Reddit      📘 Facebook',
                '🎮 Twitch      🎬 Vimeo',
                '🌐 Other sites (via yt-dlp)',
                '```',
                '',
                '**Download Methods:**',
                '• **Auto** - Downloads and uploads to Discord',
                '• **Direct Link** - Gets a direct URL (may expire)',
                '• **Download File** - Forces file download',
                '',
                '**Usage:**',
                '`/video url:<video_url> [method:auto|link|download]`',
            ].join('\n'))
            .setColor(this.colors.info!)
            .setFooter({ text: '🎬 Video Downloader • Help' })
            .setTimestamp();
    }
}

// Export singleton instance
const videoEmbedBuilder = new VideoEmbedBuilder();
export default videoEmbedBuilder;
export { VideoEmbedBuilder };
export { type ProgressOptions, type SuccessOptions };





/**
 * Video Command
 * Download videos from social media platforms
 * @module commands/video/VideoCommand
 */

const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');
const { checkAccess, AccessType } = require('../../services');
const fs = require('fs');
const path = require('path');

// Import services
let videoDownloadService, platformDetector, videoEmbedBuilder, progressAnimator, validateUrl, videoConfig;
try {
    videoDownloadService = require('../../services/video/VideoDownloadService');
    platformDetector = require('../../utils/video/platformDetector');
    videoEmbedBuilder = require('../../utils/video/videoEmbedBuilder');
    progressAnimator = require('../../utils/video/progressAnimator');
    const urlValidator = require('../../middleware/urlValidator');
    validateUrl = urlValidator.validateUrl;
    videoConfig = require('../../config/features/video');
} catch (e) {
    console.warn('[Video] Could not load services:', e.message);
}

// Rate Limiting
const userCooldowns = new Map();
const activeDownloads = new Set();

function checkCooldown(userId) {
    const cooldown = userCooldowns.get(userId);
    if (cooldown && Date.now() < cooldown) {
        return Math.ceil((cooldown - Date.now()) / 1000);
    }
    return 0;
}

function setCooldown(userId) {
    const cooldownSeconds = videoConfig?.USER_COOLDOWN_SECONDS || 30;
    userCooldowns.set(userId, Date.now() + (cooldownSeconds * 1000));
}

function checkConcurrentLimit() {
    const maxConcurrent = videoConfig?.MAX_CONCURRENT_DOWNLOADS || 5;
    return activeDownloads.size >= maxConcurrent;
}

// Cleanup old cooldowns periodically
setInterval(() => {
    const now = Date.now();
    for (const [userId, expiry] of userCooldowns.entries()) {
        if (now > expiry) userCooldowns.delete(userId);
    }
}, 60000);

class VideoCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.VIDEO,
            cooldown: 5,
            deferReply: true // Auto defer to prevent interaction timeout
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('video')
            .setDescription('Download videos from social media platforms')
            .addStringOption(option =>
                option.setName('url')
                    .setDescription('Video URL (TikTok, Reddit, Twitter, Instagram, YouTube, etc.)')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('quality')
                    .setDescription('Video quality preference')
                    .addChoices(
                        { name: '📺 SD (480p) - Faster, smaller', value: '480' },
                        { name: '🎥 HD (720p) - Balanced', value: '720' },
                        { name: '🎬 Full HD (1080p) - Best quality', value: '1080' }
                    )
                    .setRequired(false)
            );
    }

    async run(interaction) {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.editReply({ embeds: [access.embed] });
        }

        const userId = interaction.user.id;

        // Check user cooldown
        const remainingCooldown = checkCooldown(userId);
        if (remainingCooldown > 0) {
            const cooldownEmbed = new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('⏳ Cooldown Active')
                .setDescription(`Please wait **${remainingCooldown} seconds** before downloading another video.`)
                .setFooter({ text: 'This helps prevent server overload' });
            return interaction.editReply({ embeds: [cooldownEmbed] });
        }

        // Check concurrent download limit
        if (checkConcurrentLimit()) {
            const maxConcurrent = videoConfig?.MAX_CONCURRENT_DOWNLOADS || 5;
            const busyEmbed = new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('🚦 Server Busy')
                .setDescription(`Too many downloads in progress. Please wait a moment and try again.\n\n*Max concurrent downloads: ${maxConcurrent}*`)
                .setFooter({ text: 'This helps keep the bot responsive' });
            return interaction.editReply({ embeds: [busyEmbed] });
        }

        const url = interaction.options.getString('url');
        const quality = interaction.options.getString('quality') || videoConfig?.COBALT_VIDEO_QUALITY || '720';
        const platform = platformDetector?.detect(url) || { name: '🌐 Web', id: 'web' };
        const platformName = typeof platform === 'string' ? platform : (platform?.name || 'Unknown');
        const platformId = typeof platform === 'string' ? 'web' : (platform?.id || 'web');

        // Show loading embed immediately (replace "thinking")
        try {
            const loadingEmbed = videoEmbedBuilder?.buildLoadingEmbed?.(platformName, platformId, 'initializing') ||
                new EmbedBuilder()
                    .setColor(COLORS.PRIMARY)
                    .setTitle('🎬 Processing Video')
                    .setDescription(`**Platform:** ${platformName}\n\n\`░░░░░░░░░░░░ 0%\`\n\nInitializing download...`)
                    .setFooter({ text: '🎬 Video Downloader • Processing your request' });
            await interaction.editReply({ embeds: [loadingEmbed] });
        } catch (e) {
            console.error('[Video] Failed to show loading embed:', e.message);
        }

        // Validate URL
        if (validateUrl && !await validateUrl(interaction, url)) {
            return;
        }

        activeDownloads.add(userId);
        let downloadedFilePath = null;

        try {
            // Setup progress updates
            let lastUpdateTime = 0;
            const UPDATE_INTERVAL = 1500;

            const updateProgress = async (stage, progressData = {}) => {
                const now = Date.now();
                if (now - lastUpdateTime < UPDATE_INTERVAL) return;
                lastUpdateTime = now;

                try {
                    const embed = videoEmbedBuilder?.buildProgressEmbed?.(platformName, platformId, {
                        stage,
                        percent: progressData.percent || 0,
                        downloaded: progressData.downloaded || 0,
                        total: progressData.total || 0,
                        speed: progressData.speed || 0,
                        eta: progressData.eta || 0,
                        method: progressData.method || 'Auto',
                    }) || new EmbedBuilder()
                        .setColor(COLORS.PRIMARY)
                        .setTitle('📥 Downloading Video')
                        .setDescription(`**Platform:** ${platformName}\n\nDownloading...`);
                    await interaction.editReply({ embeds: [embed] });
                } catch (err) {}
            };

            // Subscribe to progress events
            const stageHandler = (data) => updateProgress(data.stage, data);
            const progressHandler = (data) => updateProgress('downloading', data);
            
            videoDownloadService?.on?.('stage', stageHandler);
            videoDownloadService?.on?.('progress', progressHandler);

            try {
                // Download the video
                const result = await videoDownloadService.downloadVideo(url, { quality });

                if (!result || !result.path) {
                    throw new Error(result?.error || 'Download failed - no file returned');
                }

                downloadedFilePath = result.path;

                // Show uploading stage
                try {
                    const uploadEmbed = videoEmbedBuilder?.buildLoadingEmbed?.(platformName, platformId, 'uploading') ||
                        new EmbedBuilder()
                            .setColor(COLORS.PRIMARY)
                            .setTitle('☁️ Uploading to Discord')
                            .setDescription('Almost done...');
                    await interaction.editReply({ embeds: [uploadEmbed] });
                } catch (e) {}

                // Build success message with Original button
                const successMessage = `✅ **${platformName}** • ${result.size.toFixed(2)} MB • ${result.format}`;
                
                const originalButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Original')
                        .setStyle(ButtonStyle.Link)
                        .setURL(url)
                        .setEmoji('🔗')
                );

                // Upload video
                const attachment = new AttachmentBuilder(result.path, { 
                    name: `${platformId}_video.${result.format.toLowerCase()}` 
                });
                
                await interaction.editReply({ 
                    content: successMessage,
                    embeds: [],
                    files: [attachment],
                    components: [originalButton]
                });

                // Delete file after successful upload
                if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                    try {
                        fs.unlinkSync(downloadedFilePath);
                        console.log(`🗑️ Deleted uploaded file: ${downloadedFilePath}`);
                        downloadedFilePath = null;
                    } catch (e) {
                        console.warn(`⚠️ Failed to delete file: ${e.message}`);
                    }
                }

                setCooldown(userId);

            } finally {
                // Remove event listeners
                videoDownloadService?.off?.('stage', stageHandler);
                videoDownloadService?.off?.('progress', progressHandler);
            }

        } catch (error) {
            console.error('[Video] Error:', error.message);
            
            // Clean up file on error
            if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                try { fs.unlinkSync(downloadedFilePath); } catch (e) {}
            }
            
            // Check if it's a file size or timeout error
            const isFileTooLarge = error.message?.toLowerCase().includes('too large') || 
                                   error.message?.toLowerCase().includes('entity') ||
                                   error.message?.startsWith('FILE_TOO_LARGE') ||
                                   error.code === 40005;
            const isTimeout = error.message?.toLowerCase().includes('abort') ||
                              error.message === 'This operation was aborted' ||
                              error.name === 'AbortError';
            const isDurationTooLong = error.message?.includes('DURATION_TOO_LONG');
            
            let errorEmbed;
            if (isDurationTooLong) {
                // Extract duration info: DURATION_TOO_LONG:18m 7s (max: 10m 0s)
                // Could be in format: "Cobalt: ... | yt-dlp: DURATION_TOO_LONG:..."
                const durationMatch = error.message.match(/DURATION_TOO_LONG:([^|]+)/);
                let durationInfo = durationMatch ? durationMatch[1].trim() : 'too long';
                // Clean up any trailing quotes or brackets
                durationInfo = durationInfo.replace(/[')"\]]+$/, '').trim();
                
                errorEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('⏱️ Video Too Long')
                    .setDescription(
                        `⚠️ This video is **${durationInfo}**\n\n` +
                        `📏 **Maximum duration:** 10 minutes\n\n` +
                        `💡 **Suggestions:**\n` +
                        `• Use a shorter video or clip\n` +
                        `• Trim the video before downloading`
                    )
                    .setFooter({ text: 'Maximum video duration: 10 minutes' });
            } else if (isFileTooLarge) {
                // Extract file size from error message if available
                const sizeMatch = error.message.match(/FILE_TOO_LARGE:([\d.]+)MB/);
                const fileSize = sizeMatch ? sizeMatch[1] : 'over 50';
                errorEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('📦 Video Too Large')
                    .setDescription(
                        `⚠️ This video is **${fileSize} MB** - max allowed is **50 MB**.\n\n` +
                        `💡 **Why 50MB?** Large files timeout during upload, even with Nitro.\n\n` +
                        `💡 **Alternatives:**\n` +
                        `• Try lower quality (480p) for smaller file\n` +
                        `• Use a shorter video clip`
                    )
                    .setFooter({ text: 'Maximum file size: 50MB (to prevent upload timeout)' });
            } else if (isTimeout) {
                errorEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('⏰ Download Timeout')
                    .setDescription(
                        `⚠️ The download took too long and was cancelled.\n\n` +
                        `💡 **Suggestions:**\n` +
                        `• Try a shorter video\n` +
                        `• Try lower quality (480p)\n` +
                        `• Try again later if the server is busy`
                    )
                    .setFooter({ text: 'Download timeout: 2 minutes' });
            } else {
                errorEmbed = videoEmbedBuilder?.buildDownloadFailedEmbed?.(error.message) ||
                    new EmbedBuilder()
                        .setColor(COLORS.ERROR)
                        .setTitle('❌ Download Failed')
                        .setDescription(error.message || 'An unexpected error occurred.');
            }

            await interaction.editReply({ embeds: [errorEmbed], files: [], components: [] }).catch(() => {});
        } finally {
            activeDownloads.delete(userId);
        }
    }
}

module.exports = new VideoCommand();

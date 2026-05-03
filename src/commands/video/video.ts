/**
 * Download Command
 * Download videos from social media platforms
 * @module commands/video/DownloadCommand
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    AttachmentBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChatInputCommandInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, CommandData } from '../baseCommand.js';
import { COLORS } from '../../constants.js';
import { checkAccess, AccessType } from '../../services/index.js';
import fs from 'fs';
import _videoDownloadService from '../../services/video/videoDownloadService.js';
import _platformDetector from '../../utils/video/platformDetector.js';
import _videoEmbedBuilder from '../../utils/video/videoEmbedBuilder.js';
import urlValidatorModule from '../../middleware/urlValidator.js';
import _videoConfig from '../../config/features/video.js';
import logger from '../../core/observability/Logger.js';
import cacheService from '../../cache/cacheService.js';
import type { ProgressData } from '../../types/video/processing.js';
import type {
    VideoConfig,
    VideoDownloadService,
    PlatformDetector,
    VideoEmbedBuilder,
    UrlValidator,
} from '../../types/video/download.js';
// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const videoDownloadService: VideoDownloadService = _videoDownloadService as any;
const platformDetector: PlatformDetector = _platformDetector as any;
const videoEmbedBuilder: VideoEmbedBuilder = _videoEmbedBuilder as any;
const videoConfig: VideoConfig = _videoConfig as any;
const { validateUrl } = urlValidatorModule as UrlValidator;
// Distributed video state (Redis via CacheService, with memory fallback)
const VIDEO_CACHE_NAMESPACE = 'video';
const VIDEO_COMMAND_COOLDOWN = 'download';
const VIDEO_BURST_KEY_PREFIX = 'burst:';
const VIDEO_GLOBAL_ACTIVE_KEY = 'active:global';
const VIDEO_GUILD_ACTIVE_KEY_PREFIX = 'active:guild:';
const VIDEO_DOWNLOAD_TIMEOUT_MS = (videoConfig as VideoConfig & { DOWNLOAD_TIMEOUT?: number }).DOWNLOAD_TIMEOUT || 120000;
const VIDEO_DOWNLOAD_LEASE_MS = Math.max(
    VIDEO_DOWNLOAD_TIMEOUT_MS + 180000,
    300000
);

interface VideoSlotAcquisition {
    acquired: boolean;
    blockedBy?: 'guild' | 'global';
    limits: ReturnType<typeof getEffectiveLimits>;
}

type InteractionWithAttachmentLimit = ChatInputCommandInteraction & {
    attachmentSizeLimit?: number;
    attachment_size_limit?: number;
};

function getInteractionAttachmentLimitBytes(interaction: ChatInputCommandInteraction): number | null {
    const interactionWithLimit = interaction as InteractionWithAttachmentLimit;
    const attachmentSizeLimit = interactionWithLimit.attachmentSizeLimit ?? interactionWithLimit.attachment_size_limit;

    if (typeof attachmentSizeLimit !== 'number' || !Number.isFinite(attachmentSizeLimit) || attachmentSizeLimit <= 0) {
        return null;
    }

    return attachmentSizeLimit;
}

function isDiscordUploadLimitError(error: Error & { code?: number }): boolean {
    const message = error.message?.toLowerCase() || '';
    return error.code === 40005 ||
        error.message?.includes('Request entity too large') ||
        (message.includes('payload') && message.includes('large'));
}

function isPeakHours(): boolean {
    const smartConfig = videoConfig?.smartRateLimiting;
    if (!smartConfig?.enabled || !smartConfig.peakHours?.enabled) return false;
    
    const now = new Date();
    const currentHour = now.getUTCHours();
    return currentHour >= smartConfig.peakHours.start && currentHour < smartConfig.peakHours.end;
}

function getEffectiveLimits() {
    const smartConfig = videoConfig?.smartRateLimiting;
    const isPeak = isPeakHours();
    
    if (!smartConfig?.enabled) {
        return {
            maxConcurrent: videoConfig?.MAX_CONCURRENT_DOWNLOADS || 5,
            perGuildMax: 999,
            userCooldown: videoConfig?.USER_COOLDOWN_SECONDS || 30
        };
    }
    
    if (isPeak && smartConfig.peakHours?.enabled) {
        return {
            maxConcurrent: smartConfig.peakHours.peakMaxConcurrent,
            perGuildMax: smartConfig.peakHours.peakPerGuildMax,
            userCooldown: smartConfig.peakHours.peakUserCooldownSeconds
        };
    }
    
    return {
        maxConcurrent: smartConfig.globalMaxConcurrent,
        perGuildMax: smartConfig.perGuildMaxConcurrent,
        userCooldown: videoConfig?.USER_COOLDOWN_SECONDS || 30
    };
}

async function checkBurstLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
    const smartConfig = videoConfig?.smartRateLimiting;
    if (!smartConfig?.enabled || !smartConfig.burstProtection?.enabled) {
        return { allowed: true, remaining: 0 };
    }

    const windowMs = smartConfig.burstProtection.windowSeconds * 1000;
    const maxRequests = smartConfig.burstProtection.maxRequestsPerWindow;
    const result = await cacheService.checkSlidingWindowLimit(
        VIDEO_CACHE_NAMESPACE,
        `${VIDEO_BURST_KEY_PREFIX}${userId}`,
        windowMs,
        maxRequests
    );

    return {
        allowed: result.allowed,
        remaining: result.remaining
    };
}

async function checkCooldown(userId: string): Promise<number> {
    const remainingMs = await cacheService.getCooldown(VIDEO_COMMAND_COOLDOWN, userId);
    return remainingMs ? Math.ceil(remainingMs / 1000) : 0;
}

async function setCooldown(userId: string, seconds?: number): Promise<void> {
    const limits = getEffectiveLimits();
    const cooldownSeconds = seconds ?? limits.userCooldown;
    await cacheService.setCooldown(VIDEO_COMMAND_COOLDOWN, userId, cooldownSeconds * 1000);
}

function getGuildActiveKey(guildId: string): string {
    return `${VIDEO_GUILD_ACTIVE_KEY_PREFIX}${guildId}`;
}

async function acquireDownloadSlots(guildId: string, leaseToken: string): Promise<VideoSlotAcquisition> {
    const limits = getEffectiveLimits();

    const guildLease = await cacheService.tryAcquireExpiringSlot(
        VIDEO_CACHE_NAMESPACE,
        getGuildActiveKey(guildId),
        leaseToken,
        limits.perGuildMax,
        VIDEO_DOWNLOAD_LEASE_MS
    );

    if (!guildLease.acquired) {
        return { acquired: false, blockedBy: 'guild', limits };
    }

    const globalLease = await cacheService.tryAcquireExpiringSlot(
        VIDEO_CACHE_NAMESPACE,
        VIDEO_GLOBAL_ACTIVE_KEY,
        leaseToken,
        limits.maxConcurrent,
        VIDEO_DOWNLOAD_LEASE_MS
    );

    if (!globalLease.acquired) {
        await cacheService.releaseExpiringSlot(VIDEO_CACHE_NAMESPACE, getGuildActiveKey(guildId), leaseToken);
        return { acquired: false, blockedBy: 'global', limits };
    }

    return { acquired: true, limits };
}

async function releaseDownloadSlots(guildId: string, leaseToken: string): Promise<void> {
    await Promise.all([
        cacheService.releaseExpiringSlot(VIDEO_CACHE_NAMESPACE, VIDEO_GLOBAL_ACTIVE_KEY, leaseToken),
        cacheService.releaseExpiringSlot(VIDEO_CACHE_NAMESPACE, getGuildActiveKey(guildId), leaseToken)
    ]);
}
// COMMAND
class DownloadCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.VIDEO,
            cooldown: 5,
            deferReply: false // Manual defer inside run() so we can control ephemeral per response type
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('download')
            .setDescription('Download media from social media platforms')
            .addStringOption(option =>
                option.setName('url')
                    .setDescription('Media URL (TikTok, Reddit, Twitter, Instagram, YouTube, etc.)')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('mode')
                    .setDescription('Download mode')
                    .addChoices(
                        { name: '📥 Download - Bot downloads and sends video', value: 'download' },
                        { name: '🔗 Link - Get direct download link', value: 'link' }
                    )
                    .setRequired(false)
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

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Defer ephemerally so progress/error messages stay private.
        // The final file is sent as a public interaction follow-up.
        await interaction.deferReply({ ephemeral: true });

        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.editReply({ embeds: [access.embed!] });
            return;
        }

        const userId = interaction.user.id;
        const guildId = interaction.guildId || 'dm';
        const mode = interaction.options.getString('mode') || 'download';

        // Check user cooldown
        const remainingCooldown = await checkCooldown(userId);
        if (remainingCooldown > 0) {
            const cooldownEmbed = new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('⏳ Cooldown Active')
                .setDescription(`Please wait **${remainingCooldown} seconds** before downloading another video.`)
                .setFooter({ text: isPeakHours() ? '🔥 Peak hours - Longer cooldowns' : 'This helps prevent server overload' });
            await interaction.editReply({ embeds: [cooldownEmbed] });
            return;
        }

        // Burst protection check
        const burstStatus = await checkBurstLimit(userId);
        if (!burstStatus.allowed) {
            const smartConfig = videoConfig?.smartRateLimiting;
            const waitSeconds = Math.max(1, Math.ceil(burstStatus.remaining / 1000));
            const burstEmbed = new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('⚡ Too Many Requests')
                .setDescription(`You're requesting too quickly. Max **${smartConfig?.burstProtection?.maxRequestsPerWindow || 3}** requests per **${smartConfig?.burstProtection?.windowSeconds || 60}** seconds.\n\nPlease wait about **${waitSeconds} seconds** before trying again.`)
                .setFooter({ text: 'Burst protection active' });
            await interaction.editReply({ embeds: [burstEmbed] });
            return;
        }

        const url = interaction.options.getString('url', true);
        const quality = interaction.options.getString('quality') || videoConfig?.COBALT_VIDEO_QUALITY || '720';
        const platform = platformDetector?.detect(url) || { name: '🌐 Web', id: 'web' };
        const platformName = typeof platform === 'string' ? platform : (platform?.name || 'Unknown');
        const platformId = typeof platform === 'string' ? 'web' : (platform?.id || 'web');
        const interactionAttachmentLimitBytes = getInteractionAttachmentLimitBytes(interaction);
        const interactionAttachmentLimitMB = interactionAttachmentLimitBytes === null
            ? null
            : interactionAttachmentLimitBytes / (1024 * 1024);

        // === LINK MODE: Get direct URL without downloading ===
        if (mode === 'link') {
            try {
                const linkEmbed = new EmbedBuilder()
                    .setColor(COLORS.PRIMARY)
                    .setTitle('🔗 Getting Direct Link')
                    .setDescription(`**Platform:** ${platformName}\n\nFetching download link...`)
                    .setFooter({ text: '🔗 Link Mode • Faster, no file size limit' });
                await interaction.editReply({ embeds: [linkEmbed] });

                // Get video URL without downloading
                const videoInfo = await videoDownloadService?.getVideoUrl?.(url, { quality });
                
                if (!videoInfo?.url) {
                    throw new Error('Could not get direct download link');
                }

                let directUrl: string;
                try {
                    const parsedDirectUrl = new URL(videoInfo.url.trim());
                    if (parsedDirectUrl.protocol !== 'http:' && parsedDirectUrl.protocol !== 'https:') {
                        throw new Error(`Unsupported protocol: ${parsedDirectUrl.protocol}`);
                    }
                    directUrl = parsedDirectUrl.toString();
                } catch (error) {
                    throw new Error(`Provider returned an invalid direct link: ${(error as Error).message}`);
                }

                // Set cooldown (shorter for link mode)
                const linkCooldownSeconds = Math.floor((videoConfig?.USER_COOLDOWN_SECONDS || 30) / 2);
                await setCooldown(userId, linkCooldownSeconds);

                const successEmbed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setTitle('🔗 Direct Download Link')
                    .setDescription(
                        `**Platform:** ${platformName}\n` +
                        `**Quality:** ${quality}p\n\n` +
                        `**Download Link:**\n${directUrl}\n\n` +
                        `*Link will expire in a few minutes*`
                    )
                    .setFooter({ text: '💡 Right-click and "Save link as..." to download' });

                const downloadButton = new ButtonBuilder()
                    .setLabel('📥 Open Download Link')
                    .setStyle(ButtonStyle.Link)
                    .setURL(directUrl);

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(downloadButton);
                
                await interaction.editReply({ embeds: [successEmbed], components: [row] });
                return;
            } catch (error) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('❌ Link Failed')
                    .setDescription(`Could not get direct link.\n\n**Error:** ${(error as Error).message}\n\n*Try using Download mode instead.*`)
                    .setFooter({ text: 'Link mode error' });
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
        }

        // === DOWNLOAD MODE ===
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
            logger.error('Video', 'Failed to show loading embed: ' + (e as Error).message);
        }

        // Validate URL
        if (validateUrl && !await validateUrl(interaction, url)) {
            return;
        }

        const leaseToken = `${interaction.id}:${userId}`;
        let slotsAcquired = false;
        let downloadedFilePath: string | null = null;

        const slotAcquisition = await acquireDownloadSlots(guildId, leaseToken);
        if (!slotAcquisition.acquired) {
            if (slotAcquisition.blockedBy === 'guild') {
                const guildLimitEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('🏠 Server Limit Reached')
                    .setDescription(`This server has reached max concurrent downloads (**${slotAcquisition.limits.perGuildMax}**).\nPlease wait for other downloads to finish.`)
                    .setFooter({ text: isPeakHours() ? '🔥 Peak hours - Reduced limits' : 'Per-server rate limiting' });
                await interaction.editReply({ embeds: [guildLimitEmbed] });
                return;
            }

            const busyEmbed = new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('🚦 Server Busy')
                .setDescription(`Too many downloads in progress globally. Please wait a moment and try again.\n\n*Max concurrent: ${slotAcquisition.limits.maxConcurrent}*`)
                .setFooter({ text: isPeakHours() ? '🔥 Peak hours - Reduced capacity' : 'This helps keep the bot responsive' });
            await interaction.editReply({ embeds: [busyEmbed] });
            return;
        }

        slotsAcquired = true;

        try {
            // Setup progress updates
            let lastUpdateTime = 0;
            const UPDATE_INTERVAL = 1500;

            const updateProgress = async (stage: string, progressData: ProgressData = {}): Promise<void> => {
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
                } catch (err) {
                    // Ignore update errors
                }
            };

            // Subscribe to progress events
            const stageHandler = (data: ProgressData): void => { updateProgress(data.stage || 'processing', data); };
            const progressHandler = (data: ProgressData): void => { updateProgress('downloading', data); };
            
            videoDownloadService?.on?.('stage', stageHandler);
            videoDownloadService?.on?.('progress', progressHandler);

            try {
                // Download the video
                const result = await videoDownloadService!.downloadVideo(url, { quality });

                if (!result || !result.path) {
                    throw new Error(result?.error || 'Download failed - no file returned');
                }

                downloadedFilePath = result.path;
                
                // Verify ACTUAL file size on disk (don't trust API/header-reported sizes)
                let actualSizeMB = result.size;
                if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                    const actualStats = fs.statSync(downloadedFilePath);
                    actualSizeMB = actualStats.size / (1024 * 1024);
                    
                    // Log discrepancy if reported vs actual size differs significantly
                    if (Math.abs(actualSizeMB - result.size) > 0.5) {
                        logger.info('Video', `Size discrepancy: reported=${result.size.toFixed(2)}MB, actual=${actualSizeMB.toFixed(2)}MB`);
                    }
                }
                
                // Validate file size before upload (Discord limits) — use ACTUAL size
                const maxFileSizeMB = videoConfig?.MAX_FILE_SIZE_MB || videoConfig?.limits?.maxFileSizeMB || 100;
                if (actualSizeMB > maxFileSizeMB) {
                    // Clean up oversized file
                    if (fs.existsSync(downloadedFilePath)) {
                        try { fs.unlinkSync(downloadedFilePath); } catch (e) { /* ignore */ }
                    }
                    
                    const sizeErrorEmbed = new EmbedBuilder()
                        .setColor(COLORS.ERROR)
                        .setTitle('❌ Video Too Large')
                        .setDescription(
                            `This video couldn't be downloaded because it exceeds our max capacity (**${maxFileSizeMB} MB**).\n\n` +
                            `The video is **${actualSizeMB.toFixed(2)} MB**.\n\n` +
                            `💡 **Try instead:**\n` +
                            `• Use a lower quality (480p)\n` +
                            `• Use 🔗 **Link mode** for a direct download link`
                        )
                        .setFooter({ text: `Max capacity: ${maxFileSizeMB} MB` });

                    await interaction.editReply({ embeds: [sizeErrorEmbed], components: [] });
                    return;
                }

                // Show uploading stage
                try {
                    const uploadEmbed = videoEmbedBuilder?.buildLoadingEmbed?.(platformName, platformId, 'uploading') ||
                        new EmbedBuilder()
                            .setColor(COLORS.PRIMARY)
                            .setTitle('☁️ Uploading to Discord')
                            .setDescription('Almost done...');
                    await interaction.editReply({ embeds: [uploadEmbed] });
                } catch (e) {
                    // Ignore update errors
                }

                // Discord includes the effective attachment ceiling on the raw interaction payload.
                // Use it when available instead of guessing from the requester's account state.
                if (interactionAttachmentLimitMB !== null && actualSizeMB > interactionAttachmentLimitMB) {
                    // Clean up oversized file
                    if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                        try { fs.unlinkSync(downloadedFilePath); } catch (e) { /* ignore */ }
                    }
                    
                    const discordLimitEmbed = new EmbedBuilder()
                        .setColor(COLORS.ERROR)
                        .setTitle('❌ File Exceeds Discord Upload Limit')
                        .setDescription(
                            `Video **${actualSizeMB.toFixed(2)} MB** exceeds Discord's current upload limit for this bot response (**${interactionAttachmentLimitMB.toFixed(2)} MB**).\n\n` +
                            `💡 **Options:**\n` +
                            `• Use 🔗 **Link mode** for a direct download link\n` +
                            `• Use a lower quality (480p)\n` +
                            `• Try again in a server or channel with a higher upload limit`
                        )
                        .setFooter({ text: `Discord upload limit: ${interactionAttachmentLimitMB.toFixed(2)} MB` });

                    await interaction.editReply({ embeds: [discordLimitEmbed], components: [] });
                    return;
                }

                // Detect if file is GIF
                const isGif = result.format.toLowerCase() === 'gif' || 
                              result.path.toLowerCase().endsWith('.gif') ||
                              url.toLowerCase().includes('.gif') ||
                              url.toLowerCase().includes('/gif');

                // Build success message with Original button
                const fileType = isGif ? 'GIF' : result.format;
                const successMessage = `✅ **${platformName}** • ${actualSizeMB.toFixed(2)} MB • ${fileType}`;
                
                const originalButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setLabel('Original')
                        .setStyle(ButtonStyle.Link)
                        .setURL(url)
                        .setEmoji('🔗')
                );

                // Upload file with correct extension
                const fileExtension = isGif ? 'gif' : result.format.toLowerCase();
                const attachment = new AttachmentBuilder(result.path, { 
                    name: `${platformId}_${isGif ? 'gif' : 'video'}.${fileExtension}` 
                });
                
                // Log file details before upload
                const uploadFileSize = fs.statSync(result.path).size / (1024 * 1024);
                logger.info('Video', `Attempting upload: ${result.path} (${uploadFileSize.toFixed(2)} MB)`);
                logger.info('Video', `File details: ${fileExtension} format, name: ${platformId}_${isGif ? 'gif' : 'video'}.${fileExtension}`);
                
                // Upload with retry logic for transient failures only.
                let uploadSuccess = false;
                let retryCount = 0;
                const maxRetries = 2;
                
                while (!uploadSuccess && retryCount <= maxRetries) {
                    try {
                        if (retryCount > 0) {
                            logger.info('Video', `Retry attempt ${retryCount}/${maxRetries} for upload`);
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
                        }
                        
                        await interaction.followUp({ 
                            content: successMessage,
                            files: [attachment],
                            components: [originalButton]
                        });
                        // Update the ephemeral deferred reply to confirm completion
                        await interaction.editReply({ content: '✅ Video downloaded and sent!', embeds: [], files: [], components: [] });
                        
                        uploadSuccess = true;
                        logger.info('Video', `Upload successful (${uploadFileSize.toFixed(2)} MB)`);
                    } catch (uploadErr) {
                        const uploadError = uploadErr as Error & { code?: number };
                        logger.error('Video', `Upload attempt ${retryCount + 1} failed: ${uploadError.message} (code: ${uploadError.code}, size: ${uploadFileSize.toFixed(2)} MB, platform: ${platformName})`);
                        const isNonRetryableUploadError = isDiscordUploadLimitError(uploadError);
                        
                        if (isNonRetryableUploadError || retryCount === maxRetries) {
                            throw uploadErr; // Re-throw on final failure
                        }
                        retryCount++;
                    }
                }

                // Delete file after successful upload
                if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                    try {
                        fs.unlinkSync(downloadedFilePath);
                        logger.info('Video', `Deleted uploaded file: ${downloadedFilePath}`);
                        downloadedFilePath = null;
                    } catch (e) {
                        logger.warn('Video', `Failed to delete file: ${(e as Error).message}`);
                    }
                }

                await setCooldown(userId);

            } finally {
                // Remove event listeners
                videoDownloadService?.off?.('stage', stageHandler);
                videoDownloadService?.off?.('progress', progressHandler);
            }

        } catch (error) {
            const err = error as Error & { code?: number };

            const isIgnorableInteractionError =
                err.code === 10062 ||
                err.code === 40060 ||
                err.message === 'Unknown interaction';

            if (isIgnorableInteractionError) {
                logger.warn('Video', `Interaction lifecycle issue: ${err.message}`);
                return;
            }
            
            // DETAILED ERROR LOGGING
            let errorDetails = `Message: ${err.message}, Code: ${err.code || 'N/A'}, Name: ${err.name || 'N/A'}, URL: ${url}, Quality: ${quality}`;
            if (downloadedFilePath) {
                try {
                    const fileSize = fs.existsSync(downloadedFilePath) 
                        ? (fs.statSync(downloadedFilePath).size / (1024 * 1024)).toFixed(2) + ' MB'
                        : 'File not found';
                    errorDetails += `, File Size: ${fileSize}, File Path: ${downloadedFilePath}`;
                } catch { /* ignore */ }
            }
            logger.error('Video', errorDetails);
            
            // Clean up file on error
            if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                try { fs.unlinkSync(downloadedFilePath); } catch (e) { /* ignore */ }
            }
            
            // Check if it's a file size or timeout error
            const isFileTooLarge = err.message?.toLowerCase().includes('too large') || 
                                   err.message?.toLowerCase().includes('entity') ||
                                   err.message?.startsWith('FILE_TOO_LARGE') ||
                                   err.code === 40005;
            const isDiscordUploadLimit = isDiscordUploadLimitError(err);
            const isTimeout = err.message?.toLowerCase().includes('abort') ||
                              err.message === 'This operation was aborted' ||
                              err.name === 'AbortError';
            const isBackendUnavailable = err.message?.toLowerCase().includes('fetch failed') ||
                                        err.message?.toLowerCase().includes('api unreachable') ||
                                        err.message?.toLowerCase().includes('econnrefused') ||
                                        err.message?.toLowerCase().includes('enotfound') ||
                                        err.message?.toLowerCase().includes('could not reach the video backend service');
            const isDurationTooLong = err.message?.includes('DURATION_TOO_LONG');
            const isContentImages = err.message?.includes('CONTENT_IS_IMAGES');
            
            let errorEmbed: EmbedBuilder;
            if (isContentImages) {
                const detail = err.message.split('CONTENT_IS_IMAGES:')[1] || 'This content contains images/slideshow, not a downloadable video.';
                errorEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('🖼️ Slideshow / Photo Content')
                    .setDescription(
                        `⚠️ ${detail}\n\n` +
                        `📷 This link contains **photos or a slideshow**, not a video file.\n\n` +
                        `💡 **Only video content can be downloaded.** Photo slideshows are not supported.`
                    )
                    .setFooter({ text: 'Only video content is downloadable' });
            } else if (isDurationTooLong) {
                const durationMatch = err.message.match(/DURATION_TOO_LONG:([^|]+)/);
                let durationInfo = durationMatch ? durationMatch[1].trim() : 'too long';
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
            } else if (isDiscordUploadLimit && !err.message?.startsWith('FILE_TOO_LARGE')) {
                const attachmentLimitText = interactionAttachmentLimitMB === null
                    ? ''
                    : ` (**${interactionAttachmentLimitMB.toFixed(2)} MB**)`;
                errorEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('❌ Upload Failed')
                    .setDescription(
                        `Discord rejected the upload because the file is larger than the current attachment limit${attachmentLimitText} for this bot response.\n\n` +
                        `💡 **Options:**\n` +
                        `• Use 🔗 **Link mode** for a direct download link\n` +
                        `• Use a lower quality (480p)\n` +
                        `• Try again in a server or channel with a higher upload limit`
                    )
                    .setFooter({
                        text: interactionAttachmentLimitMB === null
                            ? 'Use /download mode:Link or a lower quality'
                            : `Discord upload limit: ${interactionAttachmentLimitMB.toFixed(2)} MB • Use /download mode:Link`
                    });
            } else if (isFileTooLarge) {
                const sizeMatch = err.message.match(/FILE_TOO_LARGE:([\d.]+)MB/);
                const fileSize = sizeMatch ? sizeMatch[1] : 'over 100';
                errorEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('❌ Video Too Large')
                    .setDescription(
                        `This video couldn't be downloaded because it exceeds our max capacity (**100 MB**).\n\n` +
                        `The video is approximately **${fileSize} MB**.\n\n` +
                        `💡 **Try instead:**\n` +
                        `• Use a lower quality (480p)\n` +
                        `• Use 🔗 **Link mode** for a direct download link`
                    )
                    .setFooter({ text: 'Max capacity: 100 MB' });
            } else if (isTimeout) {
                // Get file size if available for better error message
                let fileSizeInfo = '';
                if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                    try {
                        const size = (fs.statSync(downloadedFilePath).size / (1024 * 1024)).toFixed(2);
                        fileSizeInfo = `\n📦 **Downloaded file size:** ${size} MB`;
                    } catch { /* ignore */ }
                }
                
                errorEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('⏰ Upload Timeout/Aborted')
                    .setDescription(
                        `⚠️ The upload to Discord was aborted or timed out.${fileSizeInfo}\n\n` +
                        `🔍 **Possible causes:**\n` +
                        `• File too large for Discord to process\n` +
                        `• Network connection issues\n` +
                        `• Discord API experiencing delays\n\n` +
                        `💡 **Suggestions:**\n` +
                        `• Try a shorter video\n` +
                        `• Try lower quality (480p)\n` +
                        `• Use 🔗 **Link mode** instead\n` +
                        `• Try again in a moment`
                    )
                    .setFooter({ text: 'Error: ' + err.message });
            } else if (isBackendUnavailable) {
                errorEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('⚠️ Video Backend Temporarily Unavailable')
                    .setDescription(
                        `The downloader backend did not respond.\n\n` +
                        `💡 **Suggestions:**\n` +
                        `• Retry in 10-30 seconds\n` +
                        `• Use 🔗 **Link mode** for direct URL\n` +
                        `• Make sure the video is public`
                    )
                    .setFooter({ text: 'Backend connectivity issue' });
            } else {
                errorEmbed = videoEmbedBuilder?.buildDownloadFailedEmbed?.(err.message) ||
                    new EmbedBuilder()
                        .setColor(COLORS.ERROR)
                        .setTitle('❌ Download Failed')
                        .setDescription(err.message || 'An unexpected error occurred.');
            }

            await interaction.editReply({ embeds: [errorEmbed], files: [], components: [] }).catch(() => {});
        } finally {
            if (slotsAcquired) {
                await releaseDownloadSlots(guildId, leaseToken);
            }
            
            // Safety net: clean up any leftover downloaded file
            if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                try {
                    fs.unlinkSync(downloadedFilePath);
                    logger.info('Video', `Cleaned up leftover file: ${downloadedFilePath}`);
                } catch { /* ignore */ }
            }
        }
    }
}

export default new DownloadCommand();


/**
 * Video Command
 * Download videos from social media platforms
 * @module commands/video/VideoCommand
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
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { COLORS } from '../../constants.js';
import { checkAccess, AccessType } from '../../services/index.js';
import fs from 'fs';
import path from 'path';
import { getDefault } from '../../utils/common/moduleHelper.js';
// TYPES
interface VideoConfig {
    USER_COOLDOWN_SECONDS?: number;
    MAX_CONCURRENT_DOWNLOADS?: number;
    COBALT_VIDEO_QUALITY?: string;
    MAX_FILE_SIZE_MB?: number;
    limits?: {
        maxFileSizeMB?: number;
    };
    smartRateLimiting?: {
        enabled: boolean;
        globalMaxConcurrent: number;
        perGuildMaxConcurrent: number;
        perGuildCooldownSeconds: number;
        peakHours: {
            enabled: boolean;
            start: number;
            end: number;
            peakMaxConcurrent: number;
            peakPerGuildMax: number;
            peakUserCooldownSeconds: number;
        };
        burstProtection: {
            enabled: boolean;
            windowSeconds: number;
            maxRequestsPerWindow: number;
        };
    };
}

interface Platform {
    name: string;
    id: string;
}

interface DownloadResult {
    path: string;
    size: number;
    format: string;
    error?: string;
}

interface ProgressData {
    stage?: string;
    percent?: number;
    downloaded?: number;
    total?: number;
    speed?: number;
    eta?: number;
    method?: string;
}

interface VideoDownloadService {
    downloadVideo: (url: string, options: { quality: string }) => Promise<DownloadResult>;
    getVideoUrl?: (url: string, options: { quality: string }) => Promise<{ url: string; filename?: string; size?: number } | null>;
    on?: (event: string, handler: (data: ProgressData) => void) => void;
    off?: (event: string, handler: (data: ProgressData) => void) => void;
}

interface PlatformDetector {
    detect: (url: string) => Platform | string;
}

interface VideoEmbedBuilder {
    buildLoadingEmbed?: (platformName: string, platformId: string, stage: string) => EmbedBuilder;
    buildProgressEmbed?: (platformName: string, platformId: string, data: ProgressData) => EmbedBuilder;
    buildDownloadFailedEmbed?: (message: string) => EmbedBuilder;
}

interface UrlValidator {
    validateUrl: (interaction: ChatInputCommandInteraction, url: string) => Promise<boolean>;
}
// SERVICE IMPORTS
let videoDownloadService: VideoDownloadService | undefined;
let platformDetector: PlatformDetector | undefined;
let videoEmbedBuilder: VideoEmbedBuilder | undefined;
let validateUrl: ((interaction: ChatInputCommandInteraction, url: string) => Promise<boolean>) | undefined;
let videoConfig: VideoConfig | undefined;


try {
    videoDownloadService = getDefault(require('../../services/video/VideoDownloadService'));
    platformDetector = getDefault(require('../../utils/video/platformDetector'));
    videoEmbedBuilder = getDefault(require('../../utils/video/videoEmbedBuilder'));
    const urlValidator = getDefault(require('../../middleware/urlValidator')) as UrlValidator;
    validateUrl = urlValidator.validateUrl;
    videoConfig = getDefault(require('../../config/features/video'));
} catch (e) {
    console.warn('[Video] Could not load services:', (e as Error).message);
}
// RATE LIMITING
const userCooldowns = new Map<string, number>();
const activeDownloads = new Set<string>();

// Smart Rate Limiting
const guildActiveDownloads = new Map<string, Set<string>>(); // guildId -> Set<userId>
const guildCooldowns = new Map<string, number>();
const userBurstTracking = new Map<string, number[]>(); // userId -> timestamps

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

function checkBurstLimit(userId: string): boolean {
    const smartConfig = videoConfig?.smartRateLimiting;
    if (!smartConfig?.enabled || !smartConfig.burstProtection?.enabled) return true;
    
    const now = Date.now();
    const windowMs = smartConfig.burstProtection.windowSeconds * 1000;
    const maxRequests = smartConfig.burstProtection.maxRequestsPerWindow;
    
    // Get user's request timestamps
    const timestamps = userBurstTracking.get(userId) || [];
    
    // Filter to only requests within the window
    const recentTimestamps = timestamps.filter(t => now - t < windowMs);
    
    if (recentTimestamps.length >= maxRequests) {
        return false; // Burst limit exceeded
    }
    
    // Add current request
    recentTimestamps.push(now);
    userBurstTracking.set(userId, recentTimestamps);
    return true;
}

function checkGuildLimit(guildId: string): boolean {
    const limits = getEffectiveLimits();
    const guildDownloads = guildActiveDownloads.get(guildId);
    if (!guildDownloads) return true;
    return guildDownloads.size < limits.perGuildMax;
}

function addGuildDownload(guildId: string, userId: string): void {
    if (!guildActiveDownloads.has(guildId)) {
        guildActiveDownloads.set(guildId, new Set());
    }
    guildActiveDownloads.get(guildId)!.add(userId);
}

function removeGuildDownload(guildId: string, userId: string): void {
    const guildDownloads = guildActiveDownloads.get(guildId);
    if (guildDownloads) {
        guildDownloads.delete(userId);
        if (guildDownloads.size === 0) {
            guildActiveDownloads.delete(guildId);
        }
    }
}

function checkCooldown(userId: string): number {
    const cooldown = userCooldowns.get(userId);
    if (cooldown && Date.now() < cooldown) {
        return Math.ceil((cooldown - Date.now()) / 1000);
    }
    return 0;
}

function setCooldown(userId: string): void {
    const limits = getEffectiveLimits();
    userCooldowns.set(userId, Date.now() + (limits.userCooldown * 1000));
}

function checkConcurrentLimit(): boolean {
    const limits = getEffectiveLimits();
    return activeDownloads.size >= limits.maxConcurrent;
}

// Cleanup old cooldowns periodically
setInterval(() => {
    const now = Date.now();
    for (const [userId, expiry] of userCooldowns.entries()) {
        if (now > expiry) userCooldowns.delete(userId);
    }
}, 60000);
// COMMAND
class VideoCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.VIDEO,
            cooldown: 5,
            deferReply: true // Auto defer to prevent interaction timeout
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('video')
            .setDescription('Download videos from social media platforms')
            .addStringOption(option =>
                option.setName('url')
                    .setDescription('Video URL (TikTok, Reddit, Twitter, Instagram, YouTube, etc.)')
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
        const remainingCooldown = checkCooldown(userId);
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
        if (!checkBurstLimit(userId)) {
            const smartConfig = videoConfig?.smartRateLimiting;
            const burstEmbed = new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('⚡ Too Many Requests')
                .setDescription(`You're requesting too quickly. Max **${smartConfig?.burstProtection?.maxRequestsPerWindow || 3}** requests per **${smartConfig?.burstProtection?.windowSeconds || 60}** seconds.\n\nPlease wait a moment before trying again.`)
                .setFooter({ text: 'Burst protection active' });
            await interaction.editReply({ embeds: [burstEmbed] });
            return;
        }

        // Check per-guild limit
        if (!checkGuildLimit(guildId)) {
            const limits = getEffectiveLimits();
            const guildLimitEmbed = new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('🏠 Server Limit Reached')
                .setDescription(`This server has reached max concurrent downloads (**${limits.perGuildMax}**).\nPlease wait for other downloads to finish.`)
                .setFooter({ text: isPeakHours() ? '🔥 Peak hours - Reduced limits' : 'Per-server rate limiting' });
            await interaction.editReply({ embeds: [guildLimitEmbed] });
            return;
        }

        // Check global concurrent download limit
        if (checkConcurrentLimit()) {
            const limits = getEffectiveLimits();
            const busyEmbed = new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('🚦 Server Busy')
                .setDescription(`Too many downloads in progress globally. Please wait a moment and try again.\n\n*Max concurrent: ${limits.maxConcurrent}*`)
                .setFooter({ text: isPeakHours() ? '🔥 Peak hours - Reduced capacity' : 'This helps keep the bot responsive' });
            await interaction.editReply({ embeds: [busyEmbed] });
            return;
        }

        const url = interaction.options.getString('url', true);
        const quality = interaction.options.getString('quality') || videoConfig?.COBALT_VIDEO_QUALITY || '720';
        const platform = platformDetector?.detect(url) || { name: '🌐 Web', id: 'web' };
        const platformName = typeof platform === 'string' ? platform : (platform?.name || 'Unknown');
        const platformId = typeof platform === 'string' ? 'web' : (platform?.id || 'web');

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

                // Set cooldown (shorter for link mode)
                const linkCooldownSeconds = Math.floor((videoConfig?.USER_COOLDOWN_SECONDS || 30) / 2);
                userCooldowns.set(userId, Date.now() + (linkCooldownSeconds * 1000));

                const successEmbed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setTitle('🔗 Direct Download Link')
                    .setDescription(
                        `**Platform:** ${platformName}\n` +
                        `**Quality:** ${quality}p\n\n` +
                        `**Download Link:**\n${videoInfo.url}\n\n` +
                        `*Link will expire in a few minutes*`
                    )
                    .setFooter({ text: '💡 Right-click and "Save link as..." to download' });

                const downloadButton = new ButtonBuilder()
                    .setLabel('📥 Open Download Link')
                    .setStyle(ButtonStyle.Link)
                    .setURL(videoInfo.url);

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
            console.error('[Video] Failed to show loading embed:', (e as Error).message);
        }

        // Validate URL
        if (validateUrl && !await validateUrl(interaction, url)) {
            return;
        }

        activeDownloads.add(userId);
        addGuildDownload(guildId, userId);
        let downloadedFilePath: string | null = null;

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
                        console.log(`⚠️ Size discrepancy: reported=${result.size.toFixed(2)}MB, actual=${actualSizeMB.toFixed(2)}MB`);
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
                    
                    activeDownloads.delete(userId);
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

                // Check file size against Discord's upload limit (based on user's Nitro status)
                // Nitro users: up to 500MB (capped at our 100MB config limit)
                // Non-Nitro users: 10MB max
                const member = interaction.member as any;
                const hasNitro = member?.premiumSince != null;
                const userUploadLimitMB = hasNitro ? maxFileSizeMB : 10; // Nitro: config cap (100MB), Non-Nitro: 10MB

                if (actualSizeMB > userUploadLimitMB) {
                    // Clean up oversized file
                    if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                        try { fs.unlinkSync(downloadedFilePath); } catch (e) { /* ignore */ }
                    }
                    
                    const discordLimitEmbed = new EmbedBuilder()
                        .setColor(COLORS.ERROR)
                        .setTitle('❌ File Exceeds Discord Upload Limit')
                        .setDescription(
                            hasNitro
                                ? `Video **${actualSizeMB.toFixed(2)} MB** exceeds our max capacity (**${maxFileSizeMB} MB**).\n\n` +
                                  `💡 **Try instead:**\n` +
                                  `• Use a lower quality (480p)\n` +
                                  `• Use 🔗 **Link mode** for a direct download link`
                                : `Video **${actualSizeMB.toFixed(2)} MB** exceeds Discord's upload limit for non-Nitro users (**10 MB**).\n\n` +
                                  `💡 **Options:**\n` +
                                  `• Use 🔗 **Link mode** for a direct download link\n` +
                                  `• Use a lower quality (480p)\n` +
                                  `• Subscribe to **Discord Nitro** to upload files up to 500 MB`
                        )
                        .setFooter({ text: hasNitro ? `Max capacity: ${maxFileSizeMB} MB` : 'Non-Nitro limit: 10 MB • Get Nitro for up to 500 MB' });
                    
                    activeDownloads.delete(userId);
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
                console.log(`📤 Attempting upload: ${result.path} (${uploadFileSize.toFixed(2)} MB)`);
                console.log(`📋 File details: ${fileExtension} format, name: ${platformId}_${isGif ? 'gif' : 'video'}.${fileExtension}`);
                
                // Upload with retry logic for aborted operations
                let uploadSuccess = false;
                let retryCount = 0;
                const maxRetries = 2;
                
                while (!uploadSuccess && retryCount <= maxRetries) {
                    try {
                        if (retryCount > 0) {
                            console.log(`🔄 Retry attempt ${retryCount}/${maxRetries} for upload...`);
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
                        }
                        
                        await interaction.editReply({ 
                            content: successMessage,
                            embeds: [],
                            files: [attachment],
                            components: [originalButton]
                        });
                        
                        uploadSuccess = true;
                        console.log(`✅ Upload successful (${uploadFileSize.toFixed(2)} MB)`);
                    } catch (uploadErr) {
                        const uploadError = uploadErr as Error & { code?: number };
                        console.error(`❌ Upload attempt ${retryCount + 1} failed:`, {
                            message: uploadError.message,
                            code: uploadError.code,
                            name: uploadError.name,
                            fileSize: `${uploadFileSize.toFixed(2)} MB`,
                            platform: platformName
                        });
                        
                        if (retryCount === maxRetries) {
                            throw uploadErr; // Re-throw on final failure
                        }
                        retryCount++;
                    }
                }

                // Delete file after successful upload
                if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                    try {
                        fs.unlinkSync(downloadedFilePath);
                        console.log(`🗑️ Deleted uploaded file: ${downloadedFilePath}`);
                        downloadedFilePath = null;
                    } catch (e) {
                        console.warn(`⚠️ Failed to delete file: ${(e as Error).message}`);
                    }
                }

                setCooldown(userId);

            } finally {
                // Remove event listeners
                videoDownloadService?.off?.('stage', stageHandler);
                videoDownloadService?.off?.('progress', progressHandler);
            }

        } catch (error) {
            const err = error as Error & { code?: number };
            
            // DETAILED ERROR LOGGING
            console.error('═══════════════════════════════════════════');
            console.error('🚨 [Video] Error Details:');
            console.error('═══════════════════════════════════════════');
            console.error('Message:', err.message);
            console.error('Error Code:', err.code || 'N/A');
            console.error('Error Name:', err.name || 'N/A');
            console.error('URL:', url);
            console.error('Quality:', quality);
            if (downloadedFilePath) {
                try {
                    const fileSize = fs.existsSync(downloadedFilePath) 
                        ? (fs.statSync(downloadedFilePath).size / (1024 * 1024)).toFixed(2) + ' MB'
                        : 'File not found';
                    console.error('Downloaded File Size:', fileSize);
                    console.error('Downloaded File Path:', downloadedFilePath);
                } catch { /* ignore */ }
            }
            console.error('Stack Trace:', err.stack?.split('\n').slice(0, 5).join('\n'));
            console.error('═══════════════════════════════════════════');
            
            // Clean up file on error
            if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                try { fs.unlinkSync(downloadedFilePath); } catch (e) { /* ignore */ }
            }
            
            // Check if it's a file size or timeout error
            const isFileTooLarge = err.message?.toLowerCase().includes('too large') || 
                                   err.message?.toLowerCase().includes('entity') ||
                                   err.message?.startsWith('FILE_TOO_LARGE') ||
                                   err.code === 40005;
            const isDiscordUploadLimit = err.code === 40005 || 
                                        err.message?.includes('Request entity too large') ||
                                        (err.message?.toLowerCase().includes('payload') && err.message?.toLowerCase().includes('large'));
            const isTimeout = err.message?.toLowerCase().includes('abort') ||
                              err.message === 'This operation was aborted' ||
                              err.name === 'AbortError';
            const isDurationTooLong = err.message?.includes('DURATION_TOO_LONG');
            
            let errorEmbed: EmbedBuilder;
            if (isDurationTooLong) {
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
                // Discord rejected the upload - file too large for user's account
                errorEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('❌ Upload Failed')
                    .setDescription(
                        `This video couldn't be uploaded because it exceeds your Discord upload limit (**10 MB** for non-Nitro users).\n\n` +
                        `💡 **Options:**\n` +
                        `• Use 🔗 **Link mode** for a direct download link\n` +
                        `• Use a lower quality (480p)\n` +
                        `• Subscribe to **Discord Nitro** to upload files up to 500 MB`
                    )
                    .setFooter({ text: 'Non-Nitro limit: 10 MB • Use /video [url] mode:Link' });
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
            } else {
                errorEmbed = videoEmbedBuilder?.buildDownloadFailedEmbed?.(err.message) ||
                    new EmbedBuilder()
                        .setColor(COLORS.ERROR)
                        .setTitle('❌ Download Failed')
                        .setDescription(err.message || 'An unexpected error occurred.');
            }

            await interaction.editReply({ embeds: [errorEmbed], files: [], components: [] }).catch(() => {});
        } finally {
            activeDownloads.delete(userId);
            removeGuildDownload(guildId, userId);
            
            // Safety net: clean up any leftover downloaded file
            if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                try {
                    fs.unlinkSync(downloadedFilePath);
                    console.log(`🗑️ [Finally] Cleaned up leftover file: ${downloadedFilePath}`);
                } catch { /* ignore */ }
            }
        }
    }
}

export default new VideoCommand();

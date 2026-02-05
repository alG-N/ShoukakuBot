"use strict";
/**
 * Video Command
 * Download videos from social media platforms
 * @module commands/video/VideoCommand
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const BaseCommand_js_1 = require("../BaseCommand.js");
const constants_js_1 = require("../../constants.js");
const index_js_1 = require("../../services/index.js");
const fs_1 = __importDefault(require("fs"));
// SERVICE IMPORTS
let videoDownloadService;
let platformDetector;
let videoEmbedBuilder;
let validateUrl;
let videoConfig;
const getDefault = (mod) => mod.default || mod;
try {
    videoDownloadService = getDefault(require('../../services/video/VideoDownloadService'));
    platformDetector = getDefault(require('../../utils/video/platformDetector'));
    videoEmbedBuilder = getDefault(require('../../utils/video/videoEmbedBuilder'));
    const urlValidator = getDefault(require('../../middleware/urlValidator'));
    validateUrl = urlValidator.validateUrl;
    videoConfig = getDefault(require('../../config/features/video'));
}
catch (e) {
    console.warn('[Video] Could not load services:', e.message);
}
// RATE LIMITING
const userCooldowns = new Map();
const activeDownloads = new Set();
// Smart Rate Limiting
const guildActiveDownloads = new Map(); // guildId -> Set<userId>
const guildCooldowns = new Map();
const userBurstTracking = new Map(); // userId -> timestamps
function isPeakHours() {
    const smartConfig = videoConfig?.smartRateLimiting;
    if (!smartConfig?.enabled || !smartConfig.peakHours?.enabled)
        return false;
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
function checkBurstLimit(userId) {
    const smartConfig = videoConfig?.smartRateLimiting;
    if (!smartConfig?.enabled || !smartConfig.burstProtection?.enabled)
        return true;
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
function checkGuildLimit(guildId) {
    const limits = getEffectiveLimits();
    const guildDownloads = guildActiveDownloads.get(guildId);
    if (!guildDownloads)
        return true;
    return guildDownloads.size < limits.perGuildMax;
}
function addGuildDownload(guildId, userId) {
    if (!guildActiveDownloads.has(guildId)) {
        guildActiveDownloads.set(guildId, new Set());
    }
    guildActiveDownloads.get(guildId).add(userId);
}
function removeGuildDownload(guildId, userId) {
    const guildDownloads = guildActiveDownloads.get(guildId);
    if (guildDownloads) {
        guildDownloads.delete(userId);
        if (guildDownloads.size === 0) {
            guildActiveDownloads.delete(guildId);
        }
    }
}
function checkCooldown(userId) {
    const cooldown = userCooldowns.get(userId);
    if (cooldown && Date.now() < cooldown) {
        return Math.ceil((cooldown - Date.now()) / 1000);
    }
    return 0;
}
function setCooldown(userId) {
    const limits = getEffectiveLimits();
    userCooldowns.set(userId, Date.now() + (limits.userCooldown * 1000));
}
function checkConcurrentLimit() {
    const limits = getEffectiveLimits();
    return activeDownloads.size >= limits.maxConcurrent;
}
// Cleanup old cooldowns periodically
setInterval(() => {
    const now = Date.now();
    for (const [userId, expiry] of userCooldowns.entries()) {
        if (now > expiry)
            userCooldowns.delete(userId);
    }
}, 60000);
// COMMAND
class VideoCommand extends BaseCommand_js_1.BaseCommand {
    constructor() {
        super({
            category: BaseCommand_js_1.CommandCategory.VIDEO,
            cooldown: 5,
            deferReply: true // Auto defer to prevent interaction timeout
        });
    }
    get data() {
        return new discord_js_1.SlashCommandBuilder()
            .setName('video')
            .setDescription('Download videos from social media platforms')
            .addStringOption(option => option.setName('url')
            .setDescription('Video URL (TikTok, Reddit, Twitter, Instagram, YouTube, etc.)')
            .setRequired(true))
            .addStringOption(option => option.setName('mode')
            .setDescription('Download mode')
            .addChoices({ name: '📥 Download - Bot downloads and sends video', value: 'download' }, { name: '🔗 Link - Get direct download link', value: 'link' })
            .setRequired(false))
            .addStringOption(option => option.setName('quality')
            .setDescription('Video quality preference')
            .addChoices({ name: '📺 SD (480p) - Faster, smaller', value: '480' }, { name: '🎥 HD (720p) - Balanced', value: '720' }, { name: '🎬 Full HD (1080p) - Best quality', value: '1080' })
            .setRequired(false));
    }
    async run(interaction) {
        // Access control
        const access = await (0, index_js_1.checkAccess)(interaction, index_js_1.AccessType.SUB);
        if (access.blocked) {
            await interaction.editReply({ embeds: [access.embed] });
            return;
        }
        const userId = interaction.user.id;
        const guildId = interaction.guildId || 'dm';
        const mode = interaction.options.getString('mode') || 'download';
        // Check user cooldown
        const remainingCooldown = checkCooldown(userId);
        if (remainingCooldown > 0) {
            const cooldownEmbed = new discord_js_1.EmbedBuilder()
                .setColor(constants_js_1.COLORS.ERROR)
                .setTitle('⏳ Cooldown Active')
                .setDescription(`Please wait **${remainingCooldown} seconds** before downloading another video.`)
                .setFooter({ text: isPeakHours() ? '🔥 Peak hours - Longer cooldowns' : 'This helps prevent server overload' });
            await interaction.editReply({ embeds: [cooldownEmbed] });
            return;
        }
        // Burst protection check
        if (!checkBurstLimit(userId)) {
            const smartConfig = videoConfig?.smartRateLimiting;
            const burstEmbed = new discord_js_1.EmbedBuilder()
                .setColor(constants_js_1.COLORS.ERROR)
                .setTitle('⚡ Too Many Requests')
                .setDescription(`You're requesting too quickly. Max **${smartConfig?.burstProtection?.maxRequestsPerWindow || 3}** requests per **${smartConfig?.burstProtection?.windowSeconds || 60}** seconds.\n\nPlease wait a moment before trying again.`)
                .setFooter({ text: 'Burst protection active' });
            await interaction.editReply({ embeds: [burstEmbed] });
            return;
        }
        // Check per-guild limit
        if (!checkGuildLimit(guildId)) {
            const limits = getEffectiveLimits();
            const guildLimitEmbed = new discord_js_1.EmbedBuilder()
                .setColor(constants_js_1.COLORS.ERROR)
                .setTitle('🏠 Server Limit Reached')
                .setDescription(`This server has reached max concurrent downloads (**${limits.perGuildMax}**).\nPlease wait for other downloads to finish.`)
                .setFooter({ text: isPeakHours() ? '🔥 Peak hours - Reduced limits' : 'Per-server rate limiting' });
            await interaction.editReply({ embeds: [guildLimitEmbed] });
            return;
        }
        // Check global concurrent download limit
        if (checkConcurrentLimit()) {
            const limits = getEffectiveLimits();
            const busyEmbed = new discord_js_1.EmbedBuilder()
                .setColor(constants_js_1.COLORS.ERROR)
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
                const linkEmbed = new discord_js_1.EmbedBuilder()
                    .setColor(constants_js_1.COLORS.PRIMARY)
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
                const successEmbed = new discord_js_1.EmbedBuilder()
                    .setColor(constants_js_1.COLORS.SUCCESS)
                    .setTitle('🔗 Direct Download Link')
                    .setDescription(`**Platform:** ${platformName}\n` +
                    `**Quality:** ${quality}p\n\n` +
                    `**Download Link:**\n${videoInfo.url}\n\n` +
                    `*Link will expire in a few minutes*`)
                    .setFooter({ text: '💡 Right-click and "Save link as..." to download' });
                const downloadButton = new discord_js_1.ButtonBuilder()
                    .setLabel('📥 Open Download Link')
                    .setStyle(discord_js_1.ButtonStyle.Link)
                    .setURL(videoInfo.url);
                const row = new discord_js_1.ActionRowBuilder().addComponents(downloadButton);
                await interaction.editReply({ embeds: [successEmbed], components: [row] });
                return;
            }
            catch (error) {
                const errorEmbed = new discord_js_1.EmbedBuilder()
                    .setColor(constants_js_1.COLORS.ERROR)
                    .setTitle('❌ Link Failed')
                    .setDescription(`Could not get direct link.\n\n**Error:** ${error.message}\n\n*Try using Download mode instead.*`)
                    .setFooter({ text: 'Link mode error' });
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
        }
        // === DOWNLOAD MODE ===
        // Show loading embed immediately (replace "thinking")
        try {
            const loadingEmbed = videoEmbedBuilder?.buildLoadingEmbed?.(platformName, platformId, 'initializing') ||
                new discord_js_1.EmbedBuilder()
                    .setColor(constants_js_1.COLORS.PRIMARY)
                    .setTitle('🎬 Processing Video')
                    .setDescription(`**Platform:** ${platformName}\n\n\`░░░░░░░░░░░░ 0%\`\n\nInitializing download...`)
                    .setFooter({ text: '🎬 Video Downloader • Processing your request' });
            await interaction.editReply({ embeds: [loadingEmbed] });
        }
        catch (e) {
            console.error('[Video] Failed to show loading embed:', e.message);
        }
        // Validate URL
        if (validateUrl && !await validateUrl(interaction, url)) {
            return;
        }
        activeDownloads.add(userId);
        addGuildDownload(guildId, userId);
        let downloadedFilePath = null;
        try {
            // Setup progress updates
            let lastUpdateTime = 0;
            const UPDATE_INTERVAL = 1500;
            const updateProgress = async (stage, progressData = {}) => {
                const now = Date.now();
                if (now - lastUpdateTime < UPDATE_INTERVAL)
                    return;
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
                    }) || new discord_js_1.EmbedBuilder()
                        .setColor(constants_js_1.COLORS.PRIMARY)
                        .setTitle('📥 Downloading Video')
                        .setDescription(`**Platform:** ${platformName}\n\nDownloading...`);
                    await interaction.editReply({ embeds: [embed] });
                }
                catch (err) {
                    // Ignore update errors
                }
            };
            // Subscribe to progress events
            const stageHandler = (data) => { updateProgress(data.stage || 'processing', data); };
            const progressHandler = (data) => { updateProgress('downloading', data); };
            videoDownloadService?.on?.('stage', stageHandler);
            videoDownloadService?.on?.('progress', progressHandler);
            try {
                // Download the video
                const result = await videoDownloadService.downloadVideo(url, { quality });
                if (!result || !result.path) {
                    throw new Error(result?.error || 'Download failed - no file returned');
                }
                downloadedFilePath = result.path;
                // Validate file size before upload (Discord limits)
                const maxFileSizeMB = videoConfig?.MAX_FILE_SIZE_MB || videoConfig?.limits?.maxFileSizeMB || 100;
                if (result.size && result.size > maxFileSizeMB) {
                    // Clean up oversized file
                    if (fs_1.default.existsSync(downloadedFilePath)) {
                        try {
                            fs_1.default.unlinkSync(downloadedFilePath);
                        }
                        catch (e) { /* ignore */ }
                    }
                    const sizeErrorEmbed = new discord_js_1.EmbedBuilder()
                        .setColor(constants_js_1.COLORS.ERROR)
                        .setTitle('📁 File Too Large')
                        .setDescription(`The downloaded video is **${result.size.toFixed(2)} MB**, which exceeds the **${maxFileSizeMB} MB** limit.\n\n` +
                        `**Suggestions:**\n` +
                        `• Try a lower quality setting (480p)\n` +
                        `• Download a shorter clip\n` +
                        `• Use the original link directly`)
                        .setFooter({ text: 'Discord file size limit' });
                    activeDownloads.delete(userId);
                    await interaction.editReply({ embeds: [sizeErrorEmbed], components: [] });
                    return;
                }
                // Show uploading stage
                try {
                    const uploadEmbed = videoEmbedBuilder?.buildLoadingEmbed?.(platformName, platformId, 'uploading') ||
                        new discord_js_1.EmbedBuilder()
                            .setColor(constants_js_1.COLORS.PRIMARY)
                            .setTitle('☁️ Uploading to Discord')
                            .setDescription('Almost done...');
                    await interaction.editReply({ embeds: [uploadEmbed] });
                }
                catch (e) {
                    // Ignore update errors
                }
                // Detect if file is GIF
                const isGif = result.format.toLowerCase() === 'gif' ||
                    result.path.toLowerCase().endsWith('.gif') ||
                    url.toLowerCase().includes('.gif') ||
                    url.toLowerCase().includes('/gif');
                // Build success message with Original button
                const fileType = isGif ? 'GIF' : result.format;
                const successMessage = `✅ **${platformName}** • ${result.size.toFixed(2)} MB • ${fileType}`;
                const originalButton = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                    .setLabel('Original')
                    .setStyle(discord_js_1.ButtonStyle.Link)
                    .setURL(url)
                    .setEmoji('🔗'));
                // Upload file with correct extension
                const fileExtension = isGif ? 'gif' : result.format.toLowerCase();
                const attachment = new discord_js_1.AttachmentBuilder(result.path, {
                    name: `${platformId}_${isGif ? 'gif' : 'video'}.${fileExtension}`
                });
                await interaction.editReply({
                    content: successMessage,
                    embeds: [],
                    files: [attachment],
                    components: [originalButton]
                });
                // Delete file after successful upload
                if (downloadedFilePath && fs_1.default.existsSync(downloadedFilePath)) {
                    try {
                        fs_1.default.unlinkSync(downloadedFilePath);
                        console.log(`🗑️ Deleted uploaded file: ${downloadedFilePath}`);
                        downloadedFilePath = null;
                    }
                    catch (e) {
                        console.warn(`⚠️ Failed to delete file: ${e.message}`);
                    }
                }
                setCooldown(userId);
            }
            finally {
                // Remove event listeners
                videoDownloadService?.off?.('stage', stageHandler);
                videoDownloadService?.off?.('progress', progressHandler);
            }
        }
        catch (error) {
            const err = error;
            console.error('[Video] Error:', err.message);
            // Clean up file on error
            if (downloadedFilePath && fs_1.default.existsSync(downloadedFilePath)) {
                try {
                    fs_1.default.unlinkSync(downloadedFilePath);
                }
                catch (e) { /* ignore */ }
            }
            // Check if it's a file size or timeout error
            const isFileTooLarge = err.message?.toLowerCase().includes('too large') ||
                err.message?.toLowerCase().includes('entity') ||
                err.message?.startsWith('FILE_TOO_LARGE') ||
                err.code === 40005;
            const isTimeout = err.message?.toLowerCase().includes('abort') ||
                err.message === 'This operation was aborted' ||
                err.name === 'AbortError';
            const isDurationTooLong = err.message?.includes('DURATION_TOO_LONG');
            let errorEmbed;
            if (isDurationTooLong) {
                const durationMatch = err.message.match(/DURATION_TOO_LONG:([^|]+)/);
                let durationInfo = durationMatch ? durationMatch[1].trim() : 'too long';
                durationInfo = durationInfo.replace(/[')"\]]+$/, '').trim();
                errorEmbed = new discord_js_1.EmbedBuilder()
                    .setColor(constants_js_1.COLORS.ERROR)
                    .setTitle('⏱️ Video Too Long')
                    .setDescription(`⚠️ This video is **${durationInfo}**\n\n` +
                    `📏 **Maximum duration:** 10 minutes\n\n` +
                    `💡 **Suggestions:**\n` +
                    `• Use a shorter video or clip\n` +
                    `• Trim the video before downloading`)
                    .setFooter({ text: 'Maximum video duration: 10 minutes' });
            }
            else if (isFileTooLarge) {
                const sizeMatch = err.message.match(/FILE_TOO_LARGE:([\d.]+)MB/);
                const fileSize = sizeMatch ? sizeMatch[1] : 'over 100';
                errorEmbed = new discord_js_1.EmbedBuilder()
                    .setColor(constants_js_1.COLORS.ERROR)
                    .setTitle('📦 Video Too Large')
                    .setDescription(`⚠️ This video is **${fileSize} MB** - max allowed is **100 MB**.\n\n` +
                    `📏 **Discord Limits:**\n` +
                    `• Free: 10 MB • Nitro Basic: 50 MB • Nitro: 500 MB\n\n` +
                    `💡 **Alternatives:**\n` +
                    `• Try lower quality (480p) for smaller file\n` +
                    `• Use a shorter video clip`)
                    .setFooter({ text: 'Maximum file size: 100MB (Discord Nitro limit)' });
            }
            else if (isTimeout) {
                errorEmbed = new discord_js_1.EmbedBuilder()
                    .setColor(constants_js_1.COLORS.ERROR)
                    .setTitle('⏰ Download Timeout')
                    .setDescription(`⚠️ The download took too long and was cancelled.\n\n` +
                    `💡 **Suggestions:**\n` +
                    `• Try a shorter video\n` +
                    `• Try lower quality (480p)\n` +
                    `• Try again later if the server is busy`)
                    .setFooter({ text: 'Download timeout: 2 minutes' });
            }
            else {
                errorEmbed = videoEmbedBuilder?.buildDownloadFailedEmbed?.(err.message) ||
                    new discord_js_1.EmbedBuilder()
                        .setColor(constants_js_1.COLORS.ERROR)
                        .setTitle('❌ Download Failed')
                        .setDescription(err.message || 'An unexpected error occurred.');
            }
            await interaction.editReply({ embeds: [errorEmbed], files: [], components: [] }).catch(() => { });
        }
        finally {
            activeDownloads.delete(userId);
            removeGuildDownload(guildId, userId);
        }
    }
}
exports.default = new VideoCommand();
//# sourceMappingURL=video.js.map
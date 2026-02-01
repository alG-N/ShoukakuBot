const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { checkAccess, AccessType } = require('../../middleware');
const path = require('path');
const fs = require('fs');

const videoDownloadService = require('../../services/video/VideoDownloadService');
const platformDetector = require('../../utils/video/platformDetector');
const videoEmbedBuilder = require('../../utils/video/videoEmbedBuilder');
const progressAnimator = require('../../utils/video/progressAnimator');
const { validateUrl } = require('../../middleware/urlValidator');
const videoConfig = require('../../config/features/video');

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
    userCooldowns.set(userId, Date.now() + (videoConfig.USER_COOLDOWN_SECONDS * 1000));
}

function checkConcurrentLimit() {
    return activeDownloads.size >= videoConfig.MAX_CONCURRENT_DOWNLOADS;
}

// Cleanup old cooldowns periodically
setInterval(() => {
    const now = Date.now();
    for (const [userId, expiry] of userCooldowns.entries()) {
        if (now > expiry) userCooldowns.delete(userId);
    }
}, 60000);

module.exports = {
    data: new SlashCommandBuilder()
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
        ),

    async execute(interaction) {
        // Access control check (before defer so we can use ephemeral)
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.reply({ embeds: [access.embed], ephemeral: true });
        }

        const userId = interaction.user.id;

        // Check user cooldown
        const remainingCooldown = checkCooldown(userId);
        if (remainingCooldown > 0) {
            const cooldownEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('⏳ Cooldown Active')
                .setDescription(`Please wait **${remainingCooldown} seconds** before downloading another video.`)
                .setFooter({ text: 'This helps prevent server overload' });
            return interaction.reply({ embeds: [cooldownEmbed], ephemeral: true });
        }

        // Check concurrent download limit
        if (checkConcurrentLimit()) {
            const busyEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('🚦 Server Busy')
                .setDescription(`Too many downloads in progress. Please wait a moment and try again.\n\n*Max concurrent downloads: ${videoConfig.MAX_CONCURRENT_DOWNLOADS}*`)
                .setFooter({ text: 'This helps keep the bot responsive' });
            return interaction.reply({ embeds: [busyEmbed], ephemeral: true });
        }

        const url = interaction.options.getString('url');
        const quality = interaction.options.getString('quality') || videoConfig.COBALT_VIDEO_QUALITY;
        const platform = platformDetector.detect(url);

        console.log('📹 [Video] Starting download for:', url);
        console.log('📹 [Video] Platform detected:', platform.name);

        // Defer reply first
        await interaction.deferReply();
        console.log('📹 [Video] Deferred reply');
        
        // Immediately show processing embed (replace "thinking" with actual embed)
        try {
            const loadingEmbed = videoEmbedBuilder.buildLoadingEmbed(platform.name, platform.id, 'initializing');
            console.log('📹 [Video] Built loading embed, sending...');
            await interaction.editReply({ embeds: [loadingEmbed] });
            console.log('📹 [Video] Loading embed sent successfully');
        } catch (embedError) {
            console.error('❌ Failed to show loading embed:', embedError);
        }

        // Validate URL
        if (!await validateUrl(interaction, url)) {
            return;
        }

        // Set cooldown and track active download
        setCooldown(userId);
        activeDownloads.add(userId);

        try {
            // Download and upload to Discord
            await this.handleUpload(interaction, url, platform, quality);
        } finally {
            // Always remove from active downloads
            activeDownloads.delete(userId);
        }
    },

    /**
     * Handle video download and upload to Discord
     */
    async handleUpload(interaction, url, platform, quality) {
        let lastUpdateTime = 0;
        const UPDATE_INTERVAL = 1500; // Update embed every 1.5 seconds to avoid rate limits
        let currentStage = 'initializing';
        let currentMethod = 'Auto';
        let lastProgress = { percent: 0 };

        // Progress update handler
        const updateProgress = async (stage, progressData = {}) => {
            const now = Date.now();
            if (now - lastUpdateTime < UPDATE_INTERVAL) return;
            lastUpdateTime = now;

            try {
                const embed = videoEmbedBuilder.buildProgressEmbed(
                    platform.name,
                    platform.id,
                    {
                        stage,
                        percent: progressData.percent || 0,
                        downloaded: progressData.downloaded || 0,
                        total: progressData.total || 0,
                        speed: progressData.speed || 0,
                        eta: progressData.eta || 0,
                        method: currentMethod,
                    }
                );
                await interaction.editReply({ embeds: [embed] });
            } catch (err) {
                // Ignore update errors (rate limits, etc.)
            }
        };

        // Setup event listeners
        const stageHandler = async (data) => {
            currentStage = data.stage;
            if (data.method) currentMethod = data.method;
            await updateProgress(data.stage, lastProgress);
        };

        const progressHandler = async (data) => {
            lastProgress = data;
            if (data.method) currentMethod = data.method;
            await updateProgress(currentStage, data);
        };

        // Subscribe to events
        videoDownloadService.on('stage', stageHandler);
        videoDownloadService.on('progress', progressHandler);

        try {
            // Show connecting stage
            await updateProgress('connecting');

            const result = await videoDownloadService.downloadVideo(url, { quality });

            // Prepare file info
            const fileName = `${platform.id}_video${path.extname(result.path)}`;

            // Show uploading stage
            try {
                const uploadEmbed = videoEmbedBuilder.buildLoadingEmbed(platform.name, platform.id, 'uploading');
                await interaction.editReply({ embeds: [uploadEmbed] });
            } catch (err) {}

            // Build simple success message with Original button
            const successMessage = `✅ **${platform.name}** • ${result.size.toFixed(2)} MB • ${result.format}`;
            
            const originalButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Original')
                    .setStyle(ButtonStyle.Link)
                    .setURL(url)
                    .setEmoji('🔗')
            );

            // Upload the video with Original button
            try {
                await interaction.editReply({ 
                    content: successMessage,
                    embeds: [],
                    files: [{
                        attachment: result.path,
                        name: fileName
                    }],
                    components: [originalButton]
                });
                
                // Delete file immediately after successful upload
                if (result.path && fs.existsSync(result.path)) {
                    try { 
                        fs.unlinkSync(result.path); 
                        console.log(`🗑️ Deleted uploaded file: ${result.path}`);
                    } catch (e) {
                        console.warn(`⚠️ Failed to delete file: ${e.message}`);
                    }
                }
            } catch (uploadError) {
                console.error('❌ Upload error:', uploadError.message);
                // Clean up file immediately on upload failure
                if (result.path && fs.existsSync(result.path)) {
                    try { fs.unlinkSync(result.path); } catch {}
                }
                
                // Check if it's a file size issue or timeout (AbortError)
                const isFileTooLarge = uploadError.message.toLowerCase().includes('too large') || 
                                       uploadError.message.toLowerCase().includes('entity') ||
                                       uploadError.code === 40005;
                const isTimeout = uploadError.message.toLowerCase().includes('abort') ||
                                  uploadError.name === 'AbortError';
                
                let errorEmbed;
                if (isFileTooLarge || isTimeout) {
                    errorEmbed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('📦 Cannot Upload Video')
                        .setDescription(
                            `Video size: **${result.size.toFixed(2)} MB**\n\n` +
                            `⚠️ You need **Discord Nitro** to upload videos larger than **10 MB**.\n\n` +
                            `💡 **Alternatives:**\n` +
                            `• Try lower quality (480p) for smaller file\n` +
                            `• Use a shorter video clip`
                        )
                        .setFooter({ text: 'Discord limits: 10MB (free) • 50MB (Nitro Basic) • 500MB (Nitro)' });
                } else {
                    errorEmbed = videoEmbedBuilder.buildDownloadFailedEmbed(
                        `Upload failed: ${uploadError.message}`
                    );
                }
                
                await interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
                return;
            }

        } catch (error) {
            console.error('❌ Download/Upload error:', error.message);
            const errorEmbed = videoEmbedBuilder.buildDownloadFailedEmbed(error.message);
            await interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
        } finally {
            // Cleanup event listeners
            videoDownloadService.off('stage', stageHandler);
            videoDownloadService.off('progress', progressHandler);
        }
    }
};
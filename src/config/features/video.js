/**
 * Video Feature Configuration
 * Settings for video download functionality
 * @module config/features/video
 */

module.exports = {
    // ==========================================
    // QUALITY SETTINGS
    // ==========================================
    COBALT_VIDEO_QUALITY: '720',
    YTDLP_VIDEO_QUALITY: '720',
    quality: {
        video: '720',
        audio: '192'
    },

    // ==========================================
    // MOBILE COMPATIBILITY
    // ==========================================
    ENABLE_MOBILE_PROCESSING: true,
    MOBILE_VIDEO_CODEC: 'libx264',
    MOBILE_AUDIO_CODEC: 'aac',
    MOBILE_CRF: '23',
    MOBILE_PRESET: 'fast',
    mobile: {
        enabled: true,
        videoCodec: 'libx264',
        audioCodec: 'aac',
        crf: '28',            // Higher = faster, slightly lower quality
        preset: 'ultrafast',   // Fastest encoding
        
        // Hardware acceleration
        useHardwareAccel: true,
        hardwareEncoders: ['h264_nvenc', 'h264_qsv', 'h264_vaapi']
    },

    // ==========================================
    // LIMITS (flat for easy access)
    // ==========================================
    MAX_FILE_SIZE_MB: 50,               // 50MB to avoid Discord upload timeout (large files timeout even with Nitro)
    MAX_VIDEO_DURATION_SECONDS: 600,    // 10 minutes max
    MAX_CONCURRENT_DOWNLOADS: 3,
    USER_COOLDOWN_SECONDS: 30,
    limits: {
        maxFileSizeMB: 50,                // 50MB safe upload limit
        maxDurationSeconds: 600,          // 10 minutes
        maxConcurrentDownloads: 3,
        userCooldownSeconds: 30
    },

    // ==========================================
    // CLEANUP
    // ==========================================
    TEMP_FILE_CLEANUP_INTERVAL: 5 * 60 * 1000,
    TEMP_FILE_MAX_AGE: 15 * 60 * 1000,
    FILE_DELETE_DELAY: 5000,
    cleanup: {
        tempFileInterval: 5 * 60 * 1000,  // 5 minutes
        tempFileMaxAge: 15 * 60 * 1000,   // 15 minutes
        fileDeleteDelay: 5000              // 5 seconds
    },

    // ==========================================
    // NETWORK
    // ==========================================
    DOWNLOAD_TIMEOUT: 120000,
    MAX_RETRIES: 5,
    FRAGMENT_RETRIES: 5,
    network: {
        downloadTimeout: 120000,
        maxRetries: 5,
        fragmentRetries: 5,
        bufferSize: '8M',
        concurrentFragments: 8,
        ffmpegThreads: 0  // 0 = auto (use all cores)
    },

    // ==========================================
    // UI
    // ==========================================
    ui: {
        progressUpdateInterval: 1500,
        progressBarStyle: 'default',
        showDownloadSpeed: true,
        showEta: true,
        showFileSize: true,
        animationEnabled: true
    },

    // ==========================================
    // MESSAGES
    // ==========================================
    messages: {
        downloadTip: ' *Tip: Lower quality = faster download & smaller file size*',
        successTip: '> *Video will be attached below* '
    },

    // User Agent for requests
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

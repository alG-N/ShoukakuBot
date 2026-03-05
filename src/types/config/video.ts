export interface VideoQualityConfig {
    video: string;
    audio: string;
}

export interface VideoMobileConfig {
    enabled: boolean;
    videoCodec: string;
    audioCodec: string;
    crf: string;
    preset: string;
    useHardwareAccel: boolean;
    hardwareEncoders: string[];
}

export interface VideoLimitsConfig {
    maxFileSizeMB: number;
    maxDurationSeconds: number;
    maxConcurrentDownloads: number;
    userCooldownSeconds: number;
}

export interface PeakHoursConfig {
    enabled: boolean;
    start: number;
    end: number;
    peakMaxConcurrent: number;
    peakPerGuildMax: number;
    peakUserCooldownSeconds: number;
}

export interface BurstProtectionConfig {
    enabled: boolean;
    windowSeconds: number;
    maxRequestsPerWindow: number;
}

export interface SmartRateLimitingConfig {
    enabled: boolean;
    globalMaxConcurrent: number;
    perGuildMaxConcurrent: number;
    perGuildCooldownSeconds: number;
    peakHours: PeakHoursConfig;
    burstProtection: BurstProtectionConfig;
}

export interface VideoCleanupConfig {
    tempFileInterval: number;
    tempFileMaxAge: number;
    fileDeleteDelay: number;
}

export interface VideoNetworkConfig {
    downloadTimeout: number;
    maxRetries: number;
    fragmentRetries: number;
    bufferSize: string;
    concurrentFragments: number;
    ffmpegThreads: number;
}

export interface VideoUiConfig {
    progressUpdateInterval: number;
    progressBarStyle: string;
    showDownloadSpeed: boolean;
    showEta: boolean;
    showFileSize: boolean;
    animationEnabled: boolean;
}

export interface VideoMessagesConfig {
    downloadTip: string;
    successTip: string;
}

export interface VideoFeatureConfig {
    COBALT_VIDEO_QUALITY: string;
    YTDLP_VIDEO_QUALITY: string;
    quality: VideoQualityConfig;
    ENABLE_MOBILE_PROCESSING: boolean;
    MOBILE_VIDEO_CODEC: string;
    MOBILE_AUDIO_CODEC: string;
    MOBILE_CRF: string;
    MOBILE_PRESET: string;
    USE_HARDWARE_ACCEL: boolean;
    HARDWARE_ENCODERS: string[];
    FFMPEG_THREADS: number;
    mobile: VideoMobileConfig;
    MAX_FILE_SIZE_MB: number;
    MAX_VIDEO_DURATION_SECONDS: number;
    MAX_CONCURRENT_DOWNLOADS: number;
    USER_COOLDOWN_SECONDS: number;
    limits: VideoLimitsConfig;
    smartRateLimiting: SmartRateLimitingConfig;
    TEMP_FILE_CLEANUP_INTERVAL: number;
    TEMP_FILE_MAX_AGE: number;
    FILE_DELETE_DELAY: number;
    cleanup: VideoCleanupConfig;
    DOWNLOAD_TIMEOUT: number;
    MAX_RETRIES: number;
    FRAGMENT_RETRIES: number;
    network: VideoNetworkConfig;
    ui: VideoUiConfig;
    messages: VideoMessagesConfig;
    userAgent: string;
    COBALT_INSTANCES: string[];
}

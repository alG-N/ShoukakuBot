export interface ProgressData {
    stage?: string;
    progress?: number;
    percent?: number;
    total?: number;
    downloaded?: number;
    speed?: string | number | null;
    eta?: string | number | null;
    method?: string;
    message?: string;
    etaMs?: number;
}

export interface VideoConfigType {
    MAX_VIDEO_DURATION_SECONDS?: number;
    MAX_FILE_SIZE_MB?: number;
    YTDLP_VIDEO_QUALITY?: string;
    COBALT_VIDEO_QUALITY?: string;
    MAX_RETRIES?: number;
    FRAGMENT_RETRIES?: number;
    HARDWARE_ENCODERS?: string[];
    ENABLE_MOBILE_PROCESSING?: boolean;
    MOBILE_VIDEO_CODEC?: string;
    MOBILE_AUDIO_CODEC?: string;
    MOBILE_CRF?: string;
    MOBILE_PRESET?: string;
    FFMPEG_THREADS?: number;
    USE_HARDWARE_ACCEL?: boolean;
    TEMP_FILE_MAX_AGE?: number;
    TEMP_FILE_CLEANUP_INTERVAL?: number;
    FILE_DELETE_DELAY?: number;
    network?: {
        maxRetries?: number;
        fragmentRetries?: number;
    };
}

export interface DownloadOptions {
    quality?: string;
}

export interface DownloadProgressOptions {
    onProgress?: (data: ProgressData) => void;
    onStage?: (data: StageData) => void;
    quality?: string;
}

export interface StageData {
    stage: string;
    message: string;
    method?: string;
}

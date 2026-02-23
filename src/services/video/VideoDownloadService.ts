/**
 * VideoDownloadService - Cobalt with yt-dlp fallback
 * Uses self-hosted Cobalt API for video downloads
 * @module services/video/VideoDownloadService
 */

import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import cobaltService from './CobaltService.js';
import ytDlpService from './YtDlpService.js';
import videoProcessingService from './VideoProcessingService.js';
import * as videoConfig from '../../config/features/video.js';
import logger from '../../core/Logger.js';
// TYPES
interface DownloadOptions {
    onProgress?: (data: ProgressData) => void;
    onStage?: (data: StageData) => void;
    quality?: string;
}

interface ProgressData {
    percent?: number;
    total?: number;
    downloaded?: number;
    speed?: string | null;
    eta?: string | null;
    method?: string;
}

interface StageData {
    stage: string;
    message: string;
    method?: string;
}

interface DownloadResult {
    success: boolean;
    path: string;
    size: number;
    format: string;
    method: string;
}

interface DirectUrlResult {
    directUrl: string;
    size: string;
    title: string;
    thumbnail: string | null;
    method: string;
}

// Type for video config
interface VideoConfigType {
    COBALT_VIDEO_QUALITY?: string;
    MAX_FILE_SIZE_MB?: number;
    TEMP_FILE_MAX_AGE?: number;
    TEMP_FILE_CLEANUP_INTERVAL?: number;
    FILE_DELETE_DELAY?: number;
}

const config = videoConfig as unknown as VideoConfigType;
// VIDEO DOWNLOAD SERVICE CLASS
class VideoDownloadService extends EventEmitter {
    private tempDir: string;
    private initialized: boolean = false;
    private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

    constructor() {
        super();
        this.tempDir = path.join(__dirname, 'temp');
        this._setupEventForwarding();
    }

    /**
     * Setup event forwarding from child services
     */
    private _setupEventForwarding(): void {
        // Forward Cobalt events
        cobaltService.on('stage', (data: StageData) => this.emit('stage', { ...data, method: 'Cobalt' }));
        cobaltService.on('progress', (data: ProgressData) => this.emit('progress', { ...data, method: 'Cobalt' }));
        cobaltService.on('complete', (data: unknown) => this.emit('downloadComplete', { ...(data as object), method: 'Cobalt' }));
        cobaltService.on('error', (data: unknown) => this.emit('downloadError', { ...(data as object), method: 'Cobalt' }));

        // Forward yt-dlp events
        ytDlpService.on('stage', (data: StageData) => this.emit('stage', { ...data, method: 'yt-dlp' }));
        ytDlpService.on('progress', (data: ProgressData) => this.emit('progress', { ...data, method: 'yt-dlp' }));
        ytDlpService.on('complete', (data: unknown) => this.emit('downloadComplete', { ...(data as object), method: 'yt-dlp' }));
        ytDlpService.on('error', (data: unknown) => this.emit('downloadError', { ...(data as object), method: 'yt-dlp' }));

        // Forward video processing events
        videoProcessingService.on('stage', (data: StageData) => this.emit('stage', { ...data, method: 'Processing' }));
        videoProcessingService.on('progress', (data: ProgressData) => this.emit('progress', { ...data, method: 'Processing' }));
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        
        // Ensure temp directory exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        // Initialize yt-dlp as fallback
        await ytDlpService.initialize();
        
        // Initialize video processing service for mobile compatibility
        await videoProcessingService.initialize();
        
        this.startCleanupInterval();
        this.initialized = true;
        logger.info('VideoDownloadService', 'Initialized');
    }

    /**
     * Download video with progress tracking
     * @param url - Video URL
     * @param options - Download options
     * @returns Download result
     */
    async downloadVideo(url: string, options: DownloadOptions = {}): Promise<DownloadResult> {
        // Auto-initialize on first use
        if (!this.initialized) {
            await this.initialize();
        }
        
        const timestamp = Date.now();
        const { onProgress, onStage, quality } = options;
        
        // Use provided quality or fall back to config default
        const videoQuality = quality || config.COBALT_VIDEO_QUALITY || '720';
        
        // Setup temporary event listeners if callbacks provided
        const progressHandler = onProgress ? (data: ProgressData) => onProgress(data) : null;
        const stageHandler = onStage ? (data: StageData) => onStage(data) : null;

        if (progressHandler) this.on('progress', progressHandler);
        if (stageHandler) this.on('stage', stageHandler);

        try {
            this.emit('stage', { stage: 'initializing', message: 'Initializing download...' });
            
            let videoPath: string;
            let downloadMethod = 'Cobalt';

            // Check if URL is YouTube or TikTok - skip Cobalt, go straight to yt-dlp
            const isYouTube = this._isYouTubeUrl(url);
            const isTikTok = this._isTikTokUrl(url);

            if (isYouTube || isTikTok) {
                // YouTube/TikTok → use yt-dlp directly (bypass Cobalt)
                const platform = isYouTube ? 'YouTube' : 'TikTok';
                logger.info('VideoDownloadService', `${platform} URL detected, using yt-dlp directly (skipping Cobalt)`);
                this.emit('stage', { stage: 'connecting', message: 'Downloading with yt-dlp...', method: 'yt-dlp' });
                downloadMethod = 'yt-dlp';
                videoPath = await ytDlpService.downloadVideo(url, this.tempDir, { quality: videoQuality });
            } else {
                // Non-YouTube → try Cobalt first, fallback to yt-dlp
                this.emit('stage', { stage: 'connecting', message: 'Connecting to Cobalt...', method: 'Cobalt' });
                try {
                    videoPath = await cobaltService.downloadVideo(url, this.tempDir, { quality: videoQuality });
                } catch (cobaltError) {
                    const errorMsg = (cobaltError as Error).message;
                    // Don't fallback for size/duration/content-type errors - these will be the same for yt-dlp
                    if (errorMsg.startsWith('FILE_TOO_LARGE') || 
                        errorMsg.startsWith('DURATION_TOO_LONG') ||
                        errorMsg.startsWith('CONTENT_IS_IMAGES')) {
                        throw cobaltError;
                    }
                    
                    logger.info('VideoDownloadService', `Cobalt failed: ${errorMsg}, trying yt-dlp fallback...`);
                    this.emit('stage', { stage: 'fallback', message: 'Cobalt failed, trying yt-dlp...', method: 'yt-dlp' });
                    
                    // Fallback to yt-dlp
                    try {
                        videoPath = await ytDlpService.downloadVideo(url, this.tempDir, { quality: videoQuality });
                        downloadMethod = 'yt-dlp';
                    } catch (ytdlpError) {
                        // Both failed, throw combined error
                        throw new Error(`Cobalt: ${errorMsg} | yt-dlp: ${(ytdlpError as Error).message}`);
                    }
                }
            }
            
            // Verify file exists and get size
            if (!fs.existsSync(videoPath)) {
                throw new Error('Download completed but file not found');
            }
            
            // Get ACTUAL file size (authoritative — don't trust content-length headers)
            let stats = fs.statSync(videoPath);
            let fileSizeMB = stats.size / (1024 * 1024);
            
            logger.info('VideoDownloadService', `Actual file size: ${fileSizeMB.toFixed(2)}MB (method: ${downloadMethod})`);
            
            // Check if file is empty
            if (fileSizeMB === 0) {
                fs.unlinkSync(videoPath);
                throw new Error('Downloaded file is empty. The video may be unavailable or protected.');
            }

            // Check file size limit using ACTUAL size (100MB - Discord Nitro limit)
            const maxSizeMB = config.MAX_FILE_SIZE_MB || 100;
            if (fileSizeMB > maxSizeMB) {
                logger.info('VideoDownloadService', `Actual file size ${fileSizeMB.toFixed(1)}MB exceeds limit ${maxSizeMB}MB`);
                fs.unlinkSync(videoPath);
                throw new Error(`FILE_TOO_LARGE:${fileSizeMB.toFixed(1)}MB`);
            }

            // Process video for mobile compatibility (converts WebM/VP9/AV1 to H.264+AAC)
            this.emit('stage', { stage: 'processing', message: 'Optimizing for mobile...', method: 'Processing' });
            try {
                const originalPath = videoPath;
                const processedPath = await videoProcessingService.processForMobile(videoPath);
                if (processedPath !== videoPath) {
                    videoPath = processedPath;
                    // Delete original file to prevent disk leak
                    try {
                        if (fs.existsSync(originalPath)) {
                            fs.unlinkSync(originalPath);
                            logger.info('VideoDownloadService', `Deleted original file after conversion: ${path.basename(originalPath)}`);
                        }
                    } catch { /* ignore */ }
                    // Update file size after processing
                    stats = fs.statSync(videoPath);
                    fileSizeMB = stats.size / (1024 * 1024);
                    logger.info('VideoDownloadService', 'Video converted for mobile compatibility');
                }
            } catch (processError) {
                logger.warn('VideoDownloadService', `Mobile processing failed, using original: ${(processError as Error).message}`);
                // Continue with original file if processing fails
            }

            const extension = path.extname(videoPath).toLowerCase();
            const format = extension === '.webm' ? 'WebM' : extension === '.mp4' ? 'MP4' : extension.toUpperCase().replace('.', '');

            this.emit('stage', { stage: 'complete', message: 'Download complete!' });

            const result: DownloadResult = { 
                success: true,
                path: videoPath, 
                size: fileSizeMB, 
                format,
                method: downloadMethod
            };

            this.emit('complete', result);
            return result;

        } catch (error) {
            const errorMsg = (error as Error).message;
            logger.error('VideoDownloadService', `Download error: ${errorMsg}`);
            this.emit('error', { message: errorMsg });
            
            // Cleanup any partial files
            this.cleanupPartialDownloads(timestamp);
            
            // Provide more specific error messages
            const finalErrorMsg = errorMsg.includes('empty') 
                ? 'Downloaded file is empty. The video may be unavailable or protected.'
                : errorMsg.includes('timeout')
                ? 'Download timed out. Try again or use a shorter video.'
                : `Download failed: ${errorMsg}`;
            
            throw new Error(finalErrorMsg);
        } finally {
            // Remove temporary event listeners
            if (progressHandler) this.off('progress', progressHandler);
            if (stageHandler) this.off('stage', stageHandler);
        }
    }

    /**
     * Cleanup partial downloads from a specific timestamp
     */
    cleanupPartialDownloads(timestamp: number): void {
        try {
            if (!fs.existsSync(this.tempDir)) return;
            
            const files = fs.readdirSync(this.tempDir);
            files.forEach(file => {
                try {
                    const filePath = path.join(this.tempDir, file);
                    const stats = fs.statSync(filePath);
                    const ageMs = Date.now() - stats.mtimeMs;
                    
                    // Delete if:
                    // 1. Matches our download timestamp
                    // 2. Any video_* file older than 5 minutes (leaked from previous downloads)
                    // 3. Any file older than 30 minutes (catch-all safety net)
                    if (file.includes(String(timestamp)) ||
                        (file.startsWith('video_') && ageMs > 5 * 60 * 1000) ||
                        ageMs > 30 * 60 * 1000) {
                        fs.unlinkSync(filePath);
                        logger.info('VideoDownloadService', `Cleaned up file: ${file} (age: ${Math.round(ageMs / 1000)}s)`);
                    }
                } catch {
                    // Ignore individual file errors
                }
            });
        } catch (e) {
            logger.error('VideoDownloadService', `Cleanup partial downloads error: ${(e as Error).message}`);
        }
    }

    async getDirectUrl(url: string, options: { quality?: string } = {}): Promise<DirectUrlResult | null> {
        const quality = options.quality || config.COBALT_VIDEO_QUALITY || '720';
        const isYouTube = this._isYouTubeUrl(url);
        const isTikTok = this._isTikTokUrl(url);

        // YouTube/TikTok → use yt-dlp directly
        if (isYouTube || isTikTok) {
            try {
                const info = await ytDlpService.getVideoInfo(url);
                if (info.url) {
                    return {
                        directUrl: info.url,
                        size: 'Unknown',
                        title: info.title || 'Video',
                        thumbnail: info.thumbnail || null,
                        method: 'yt-dlp'
                    };
                }
            } catch (ytdlpError) {
                logger.error('VideoDownloadService', `yt-dlp URL extraction failed: ${(ytdlpError as Error).message}`);
            }
            return null;
        }

        // Non-YouTube → try Cobalt first
        try {
            // Set quality for Cobalt before requesting
            (cobaltService as unknown as { currentQuality?: string }).currentQuality = quality;
            
            // Try Cobalt first for direct URL
            const info = await cobaltService.getVideoInfo(url);
            
            if (info.url) {
                return {
                    directUrl: info.url,
                    size: 'Unknown',
                    title: 'Video',
                    thumbnail: null,
                    method: 'Cobalt'
                };
            }
        } catch (cobaltError) {
            logger.info('VideoDownloadService', `Cobalt URL extraction failed: ${(cobaltError as Error).message}, trying yt-dlp...`);
            
            // Fallback to yt-dlp
            try {
                const info = await ytDlpService.getVideoInfo(url);
                if (info.url) {
                    return {
                        directUrl: info.url,
                        size: 'Unknown',
                        title: info.title || 'Video',
                        thumbnail: info.thumbnail || null,
                        method: 'yt-dlp'
                    };
                }
            } catch (ytdlpError) {
                logger.error('VideoDownloadService', `yt-dlp URL extraction failed: ${(ytdlpError as Error).message}`);
            }
        }

        return null;
    }

    /**
     * Get video URL without downloading (alias for slash command compatibility)
     * Returns direct download link for "Link mode"
     */
    async getVideoUrl(url: string, options: { quality?: string } = {}): Promise<{ url: string; filename?: string; size?: number } | null> {
        const result = await this.getDirectUrl(url, options);
        if (result?.directUrl) {
            return {
                url: result.directUrl,
                filename: result.title || 'video'
            };
        }
        return null;
    }

    cleanupTempFiles(): void {
        if (!fs.existsSync(this.tempDir)) return;

        try {
            const files = fs.readdirSync(this.tempDir);
            const now = Date.now();
            let cleanedCount = 0;

            files.forEach(file => {
                try {
                    const filePath = path.join(this.tempDir, file);
                    const stats = fs.statSync(filePath);
                    const ageMs = now - stats.mtimeMs;
                    
                    // Delete files older than 10 minutes (default) to prevent disk fill
                    if (ageMs > (config.TEMP_FILE_MAX_AGE || 600000)) {
                        fs.unlinkSync(filePath);
                        cleanedCount++;
                    }
                } catch {
                    // Ignore individual file errors
                }
            });
            
            if (cleanedCount > 0) {
                logger.info('VideoDownloadService', `Periodic cleanup: removed ${cleanedCount} temp file(s)`);
            }
        } catch (error) {
            logger.error('VideoDownloadService', `Cleanup error: ${(error as Error).message}`);
        }
    }

    startCleanupInterval(): void {
        // Only start one cleanup interval
        if (this.cleanupIntervalId) return;
        
        this.cleanupIntervalId = setInterval(() => {
            this.cleanupTempFiles();
        }, config.TEMP_FILE_CLEANUP_INTERVAL || 600000);
    }

    /**
     * Destroy - clear cleanup interval for clean shutdown
     */
    destroy(): void {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
            this.cleanupIntervalId = null;
        }
    }

    deleteFile(filePath: string | null, delay: number = config.FILE_DELETE_DELAY || 5000): void {
        if (!filePath) return;
        
        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (err) {
                logger.error('VideoDownloadService', `Failed to delete file ${filePath}: ${(err as Error).message}`);
            }
        }, delay);
    }

    /**
     * Check if URL is a YouTube URL
     * YouTube URLs should bypass Cobalt and use yt-dlp directly
     */
    private _isYouTubeUrl(url: string): boolean {
        const lowerUrl = url.toLowerCase();
        return lowerUrl.includes('youtube.com') || 
               lowerUrl.includes('youtu.be') || 
               lowerUrl.includes('youtube-nocookie.com');
    }

    /**
     * Check if URL is a TikTok URL
     * TikTok URLs should bypass Cobalt and use yt-dlp directly (Cobalt tunnel gets blocked)
     */
    private _isTikTokUrl(url: string): boolean {
        const lowerUrl = url.toLowerCase();
        return lowerUrl.includes('tiktok.com') || 
               lowerUrl.includes('vm.tiktok.com');
    }
}

// Create default instance
const videoDownloadService = new VideoDownloadService();

export { VideoDownloadService };
export type { DownloadOptions, DownloadResult, DirectUrlResult };
export default videoDownloadService;

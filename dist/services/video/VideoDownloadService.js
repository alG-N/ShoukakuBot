"use strict";
/**
 * VideoDownloadService - Cobalt with yt-dlp fallback
 * Uses self-hosted Cobalt API for video downloads
 * @module services/video/VideoDownloadService
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoDownloadService = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const events_1 = require("events");
const CobaltService_js_1 = __importDefault(require("./CobaltService.js"));
const YtDlpService_js_1 = __importDefault(require("./YtDlpService.js"));
const VideoProcessingService_js_1 = __importDefault(require("./VideoProcessingService.js"));
const videoConfig = __importStar(require("../../config/features/video.js"));
const config = videoConfig;
// VIDEO DOWNLOAD SERVICE CLASS
class VideoDownloadService extends events_1.EventEmitter {
    tempDir;
    initialized = false;
    cleanupIntervalId = null;
    constructor() {
        super();
        this.tempDir = path.join(__dirname, 'temp');
        this._setupEventForwarding();
    }
    /**
     * Setup event forwarding from child services
     */
    _setupEventForwarding() {
        // Forward Cobalt events
        CobaltService_js_1.default.on('stage', (data) => this.emit('stage', { ...data, method: 'Cobalt' }));
        CobaltService_js_1.default.on('progress', (data) => this.emit('progress', { ...data, method: 'Cobalt' }));
        CobaltService_js_1.default.on('complete', (data) => this.emit('downloadComplete', { ...data, method: 'Cobalt' }));
        CobaltService_js_1.default.on('error', (data) => this.emit('downloadError', { ...data, method: 'Cobalt' }));
        // Forward yt-dlp events
        YtDlpService_js_1.default.on('stage', (data) => this.emit('stage', { ...data, method: 'yt-dlp' }));
        YtDlpService_js_1.default.on('progress', (data) => this.emit('progress', { ...data, method: 'yt-dlp' }));
        YtDlpService_js_1.default.on('complete', (data) => this.emit('downloadComplete', { ...data, method: 'yt-dlp' }));
        YtDlpService_js_1.default.on('error', (data) => this.emit('downloadError', { ...data, method: 'yt-dlp' }));
        // Forward video processing events
        VideoProcessingService_js_1.default.on('stage', (data) => this.emit('stage', { ...data, method: 'Processing' }));
        VideoProcessingService_js_1.default.on('progress', (data) => this.emit('progress', { ...data, method: 'Processing' }));
    }
    async initialize() {
        if (this.initialized)
            return;
        // Ensure temp directory exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
        // Initialize yt-dlp as fallback
        await YtDlpService_js_1.default.initialize();
        // Initialize video processing service for mobile compatibility
        await VideoProcessingService_js_1.default.initialize();
        this.startCleanupInterval();
        this.initialized = true;
        console.log('✅ VideoDownloadService initialized');
    }
    /**
     * Download video with progress tracking
     * @param url - Video URL
     * @param options - Download options
     * @returns Download result
     */
    async downloadVideo(url, options = {}) {
        // Auto-initialize on first use
        if (!this.initialized) {
            await this.initialize();
        }
        const timestamp = Date.now();
        const { onProgress, onStage, quality } = options;
        // Use provided quality or fall back to config default
        const videoQuality = quality || config.COBALT_VIDEO_QUALITY || '720';
        // Setup temporary event listeners if callbacks provided
        const progressHandler = onProgress ? (data) => onProgress(data) : null;
        const stageHandler = onStage ? (data) => onStage(data) : null;
        if (progressHandler)
            this.on('progress', progressHandler);
        if (stageHandler)
            this.on('stage', stageHandler);
        try {
            this.emit('stage', { stage: 'initializing', message: 'Initializing download...' });
            let videoPath;
            let downloadMethod = 'Cobalt';
            // Try Cobalt first
            this.emit('stage', { stage: 'connecting', message: 'Connecting to Cobalt...', method: 'Cobalt' });
            try {
                videoPath = await CobaltService_js_1.default.downloadVideo(url, this.tempDir, { quality: videoQuality });
            }
            catch (cobaltError) {
                const errorMsg = cobaltError.message;
                // Don't fallback for size/duration errors - these will be the same for yt-dlp
                if (errorMsg.startsWith('FILE_TOO_LARGE') ||
                    errorMsg.startsWith('DURATION_TOO_LONG')) {
                    throw cobaltError;
                }
                console.log(`⚠️ Cobalt failed: ${errorMsg}, trying yt-dlp fallback...`);
                this.emit('stage', { stage: 'fallback', message: 'Cobalt failed, trying yt-dlp...', method: 'yt-dlp' });
                // Fallback to yt-dlp
                try {
                    videoPath = await YtDlpService_js_1.default.downloadVideo(url, this.tempDir, { quality: videoQuality });
                    downloadMethod = 'yt-dlp';
                }
                catch (ytdlpError) {
                    // Both failed, throw combined error
                    throw new Error(`Cobalt: ${errorMsg} | yt-dlp: ${ytdlpError.message}`);
                }
            }
            // Verify file exists and get size
            if (!fs.existsSync(videoPath)) {
                throw new Error('Download completed but file not found');
            }
            // Get file size
            let stats = fs.statSync(videoPath);
            let fileSizeMB = stats.size / (1024 * 1024);
            // Check if file is empty
            if (fileSizeMB === 0) {
                fs.unlinkSync(videoPath);
                throw new Error('Downloaded file is empty. The video may be unavailable or protected.');
            }
            // Check file size limit (100MB - Discord Nitro limit)
            const maxSizeMB = config.MAX_FILE_SIZE_MB || 100;
            if (fileSizeMB > maxSizeMB) {
                fs.unlinkSync(videoPath);
                throw new Error(`FILE_TOO_LARGE:${fileSizeMB.toFixed(1)}MB`);
            }
            // Process video for mobile compatibility (converts WebM/VP9/AV1 to H.264+AAC)
            this.emit('stage', { stage: 'processing', message: 'Optimizing for mobile...', method: 'Processing' });
            try {
                const processedPath = await VideoProcessingService_js_1.default.processForMobile(videoPath);
                if (processedPath !== videoPath) {
                    videoPath = processedPath;
                    // Update file size after processing
                    stats = fs.statSync(videoPath);
                    fileSizeMB = stats.size / (1024 * 1024);
                    console.log(`✅ Video converted for mobile compatibility`);
                }
            }
            catch (processError) {
                console.warn(`⚠️ Mobile processing failed, using original: ${processError.message}`);
                // Continue with original file if processing fails
            }
            const extension = path.extname(videoPath).toLowerCase();
            const format = extension === '.webm' ? 'WebM' : extension === '.mp4' ? 'MP4' : extension.toUpperCase().replace('.', '');
            this.emit('stage', { stage: 'complete', message: 'Download complete!' });
            const result = {
                success: true,
                path: videoPath,
                size: fileSizeMB,
                format,
                method: downloadMethod
            };
            this.emit('complete', result);
            return result;
        }
        catch (error) {
            const errorMsg = error.message;
            console.error('❌ Download error:', errorMsg);
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
        }
        finally {
            // Remove temporary event listeners
            if (progressHandler)
                this.off('progress', progressHandler);
            if (stageHandler)
                this.off('stage', stageHandler);
        }
    }
    /**
     * Cleanup partial downloads from a specific timestamp
     */
    cleanupPartialDownloads(timestamp) {
        try {
            if (!fs.existsSync(this.tempDir))
                return;
            const files = fs.readdirSync(this.tempDir);
            files.forEach(file => {
                // Clean up files starting with video_ or that match the timestamp
                if (file.startsWith('video_') || file.includes(String(timestamp))) {
                    try {
                        const filePath = path.join(this.tempDir, file);
                        const stats = fs.statSync(filePath);
                        // Delete if older than 5 minutes or matches timestamp
                        if (Date.now() - stats.mtimeMs > 5 * 60 * 1000 || file.includes(String(timestamp))) {
                            fs.unlinkSync(filePath);
                            console.log(`🗑️ Cleaned up partial file: ${file}`);
                        }
                    }
                    catch {
                        // Ignore individual file errors
                    }
                }
            });
        }
        catch (e) {
            console.error('Cleanup partial downloads error:', e.message);
        }
    }
    async getDirectUrl(url, options = {}) {
        const quality = options.quality || config.COBALT_VIDEO_QUALITY || '720';
        try {
            // Set quality for Cobalt before requesting
            CobaltService_js_1.default.currentQuality = quality;
            // Try Cobalt first for direct URL
            const info = await CobaltService_js_1.default.getVideoInfo(url);
            if (info.url) {
                return {
                    directUrl: info.url,
                    size: 'Unknown',
                    title: 'Video',
                    thumbnail: null,
                    method: 'Cobalt'
                };
            }
        }
        catch (cobaltError) {
            console.log(`⚠️ Cobalt URL extraction failed: ${cobaltError.message}, trying yt-dlp...`);
            // Fallback to yt-dlp
            try {
                const info = await YtDlpService_js_1.default.getVideoInfo(url);
                if (info.url) {
                    return {
                        directUrl: info.url,
                        size: 'Unknown',
                        title: info.title || 'Video',
                        thumbnail: info.thumbnail || null,
                        method: 'yt-dlp'
                    };
                }
            }
            catch (ytdlpError) {
                console.error('❌ yt-dlp URL extraction failed:', ytdlpError.message);
            }
        }
        return null;
    }
    /**
     * Get video URL without downloading (alias for slash command compatibility)
     * Returns direct download link for "Link mode"
     */
    async getVideoUrl(url, options = {}) {
        const result = await this.getDirectUrl(url, options);
        if (result?.directUrl) {
            return {
                url: result.directUrl,
                filename: result.title || 'video'
            };
        }
        return null;
    }
    cleanupTempFiles() {
        if (!fs.existsSync(this.tempDir))
            return;
        try {
            const files = fs.readdirSync(this.tempDir);
            const now = Date.now();
            files.forEach(file => {
                try {
                    const filePath = path.join(this.tempDir, file);
                    const stats = fs.statSync(filePath);
                    if (now - stats.mtimeMs > (config.TEMP_FILE_MAX_AGE || 3600000)) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️ Cleaned up old temp file: ${file}`);
                    }
                }
                catch {
                    // Ignore individual file errors
                }
            });
        }
        catch (error) {
            console.error('Cleanup error:', error.message);
        }
    }
    startCleanupInterval() {
        // Only start one cleanup interval
        if (this.cleanupIntervalId)
            return;
        this.cleanupIntervalId = setInterval(() => {
            this.cleanupTempFiles();
        }, config.TEMP_FILE_CLEANUP_INTERVAL || 600000);
    }
    deleteFile(filePath, delay = config.FILE_DELETE_DELAY || 5000) {
        if (!filePath)
            return;
        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
            catch (err) {
                console.error(`Failed to delete file ${filePath}:`, err.message);
            }
        }, delay);
    }
}
exports.VideoDownloadService = VideoDownloadService;
// Create default instance
const videoDownloadService = new VideoDownloadService();
exports.default = videoDownloadService;
//# sourceMappingURL=VideoDownloadService.js.map
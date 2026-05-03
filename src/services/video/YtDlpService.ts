/**
 * YtDlpService - Video downloader via yt-dlp HTTP API
 * Bot calls the yt-dlp-api container over HTTP. Files are shared via Docker volume.
 * @module services/video/YtDlpService
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as videoConfig from '../../config/features/video.js';
import logger from '../../core/observability/Logger.js';
import type { VideoConfigType } from '../../types/video/processing.js';
import type {
    VideoInfo,
    YtDlpCompleteData,
    ApiDownloadResponse,
    ApiInfoResponse,
    ApiHealthResponse,
    DownloadOptions,
    ProgressData,
    StageData
} from '../../types/video/ytdlp.js';

const config = videoConfig as unknown as VideoConfigType;

// ── Service ──
class YtDlpService extends EventEmitter {
    private tempDir: string;
    private initialized: boolean = false;
    private apiUrl: string;

    constructor() {
        super();
        this.tempDir = path.join(__dirname, 'temp');
        this.apiUrl = process.env.YTDLP_API_URL || 'http://ytdlp-api:8900';
    }

    private _formatFetchError(error: unknown): string {
        const err = error as Error & { cause?: unknown };
        const cause = typeof err?.cause === 'object' && err.cause !== null
            ? (err.cause as { message?: string }).message
            : undefined;
        return cause || err?.message || 'network error';
    }

    private async _fetchWithRetry(url: string, init: RequestInit, timeoutMs: number, retries: number = 1): Promise<Response> {
        let lastError: unknown;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fetch(url, {
                    ...init,
                    signal: AbortSignal.timeout(timeoutMs)
                });
            } catch (error) {
                lastError = error;

                if (attempt >= retries) {
                    break;
                }

                await this.initialize();
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        throw new Error(`yt-dlp API unreachable at ${this.apiUrl}: ${this._formatFetchError(lastError)}`);
    }

    /**
     * Initialize - verify API is reachable
     */
    async initialize(): Promise<boolean> {
        if (this.initialized) return true;

        try {
            if (!fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, { recursive: true });
            }

            const resp = await this._fetchWithRetry(`${this.apiUrl}/health`, {}, 5000, 0);

            if (resp.ok) {
                const data = await resp.json() as ApiHealthResponse;
                this.initialized = true;
                logger.info('YtDlpService', `yt-dlp API available (version: ${data.version}, max concurrent: ${data.max_concurrent})`);
                return true;
            }
            logger.warn('YtDlpService', 'yt-dlp API returned non-OK status');
            return false;
        } catch (error) {
            logger.warn('YtDlpService', `yt-dlp API not reachable: ${(error as Error).message}`);
            return false;
        }
    }

    /**
     * Download video via yt-dlp HTTP API
     * The API saves files to a shared Docker volume mounted at this.tempDir
     */
    async downloadVideo(url: string, tempDir?: string, options: DownloadOptions = {}): Promise<string> {
        if (!this.initialized) {
            await this.initialize();
        }

        const downloadDir = tempDir || this.tempDir;
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        const timestamp = Date.now();
        const outputFilename = `video_${timestamp}`;
        const quality = options.quality || config.YTDLP_VIDEO_QUALITY || config.COBALT_VIDEO_QUALITY || '720';

        this.emit('stage', { stage: 'analyzing', message: 'Analyzing video with yt-dlp...' } as StageData);

        // ── Pre-download checks via /info ──
        const maxDuration = config.MAX_VIDEO_DURATION_SECONDS || 600;
        const maxFileSizeMB = config.MAX_FILE_SIZE_MB || 100;

        try {
            const videoInfo = await this._getVideoInfo(url, quality);

            if (videoInfo) {
                if (videoInfo.duration && videoInfo.duration > maxDuration) {
                    const durationStr = this._formatDuration(videoInfo.duration);
                    const maxStr = this._formatDuration(maxDuration);
                    throw new Error(`DURATION_TOO_LONG:${durationStr} (max: ${maxStr})`);
                }

                if (videoInfo.filesize) {
                    const fileSizeMB = videoInfo.filesize / (1024 * 1024);
                    if (fileSizeMB > maxFileSizeMB) {
                        logger.info('YtDlpService', `File size ${fileSizeMB.toFixed(1)}MB exceeds ${maxFileSizeMB}MB limit`);
                        throw new Error(`FILE_TOO_LARGE:${fileSizeMB.toFixed(1)}MB`);
                    }
                    logger.info('YtDlpService', `Pre-download size check: ${fileSizeMB.toFixed(1)}MB (limit: ${maxFileSizeMB}MB) ✓`);
                } else if (videoInfo.duration) {
                    const bitrateMultiplier = quality === '1080' ? 2.5 : (quality === '480' ? 0.5 : 1.2);
                    const estimatedSizeMB = (videoInfo.duration / 60) * bitrateMultiplier * 8;
                    if (estimatedSizeMB > maxFileSizeMB * 2) {
                        logger.info('YtDlpService', `Estimated size ${estimatedSizeMB.toFixed(1)}MB exceeds safety limit`);
                        throw new Error(`FILE_TOO_LARGE:~${estimatedSizeMB.toFixed(0)}MB (estimated)`);
                    }
                }
            }
        } catch (infoError) {
            const errorMsg = (infoError as Error).message;
            if (errorMsg.startsWith('DURATION_TOO_LONG') || errorMsg.startsWith('FILE_TOO_LARGE')) {
                throw infoError;
            }
            logger.warn('YtDlpService', `Could not get video info, proceeding with download: ${errorMsg}`);
        }

        // ── Download via API ──
        logger.info('YtDlpService', `yt-dlp API downloading (${quality}p): ${url.substring(0, 50)}...`);
        this.emit('stage', { stage: 'downloading', message: 'Downloading with yt-dlp...' } as StageData);

        const resp = await this._fetchWithRetry(
            `${this.apiUrl}/download`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, quality, filename: outputFilename }),
            },
            120000,
            1
        );

        if (!resp.ok) {
            const error = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` })) as { detail: string };
            const detail = error.detail || `yt-dlp API error: ${resp.status}`;

            // Handle rate limiting
            if (resp.status === 429) {
                throw new Error('SERVER_BUSY:Too many downloads in progress. Try again in a few seconds.');
            }

            throw new Error(detail);
        }

        const result = await resp.json() as ApiDownloadResponse;

        if (this._isNonVideoFormat(result.format) || this._isNonVideoAsset(result.filename)) {
            throw new Error('CONTENT_IS_IMAGES:This content is an image/GIF/slideshow, not a downloadable video.');
        }

        // File is in the shared volume (mounted at downloadDir)
        const finalPath = path.join(downloadDir, result.filename);

        // Verify file exists in shared volume
        if (!fs.existsSync(finalPath)) {
            throw new Error('yt-dlp API reported success but file not found in shared volume');
        }

        const stats = fs.statSync(finalPath);
        if (stats.size === 0) {
            fs.unlinkSync(finalPath);
            throw new Error('Downloaded file is empty');
        }

        if (this._isNonVideoAsset(finalPath)) {
            fs.unlinkSync(finalPath);
            throw new Error('CONTENT_IS_IMAGES:This content is an image/GIF/slideshow, not a downloadable video.');
        }

        const fileSizeInMB = stats.size / (1024 * 1024);
        logger.info('YtDlpService', `yt-dlp downloaded ${fileSizeInMB.toFixed(2)} MB via API → ${finalPath}`);
        // NOTE: Pre-download size vs actual download size discrepancy explained:
        // - Pre-download size is YouTube's reported filesize (videoInfo.filesize)
        // - Actual size can differ due to:
        //   1. YouTube may report estimate instead of exact size
        //   2. Different format selection (best[height<=720] may pick different codec)
        //   3. Compression variations between reported and actual stream
        //   4. Audio/video stream merging overhead
        // This is normal and expected behavior from yt-dlp/YouTube API

        this.emit('complete', {
            path: finalPath,
            size: fileSizeInMB
        } as YtDlpCompleteData);

        return finalPath;
    }

    /**
     * Get video info via API (internal)
     * @param quality - Video quality to check size for (e.g. '720', '480')
     */
    private async _getVideoInfo(url: string, quality?: string): Promise<VideoInfo | null> {
        try {
            const body: Record<string, string> = { url };
            if (quality) body.quality = quality;

            const resp = await this._fetchWithRetry(
                `${this.apiUrl}/info`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                },
                15000,
                1
            );

            if (!resp.ok) {
                const error = await resp.json().catch(() => ({ detail: 'unknown' })) as { detail: string };
                throw new Error(error.detail);
            }

            return await resp.json() as ApiInfoResponse;
        } catch (error) {
            throw error;
        }
    }

    private _isNonVideoFormat(format?: string): boolean {
        if (!format) return false;
        const normalized = format.toLowerCase();
        return ['gif', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'avif', 'heic', 'photo', 'image'].some(token => normalized.includes(token));
    }

    private _isNonVideoAsset(value: string): boolean {
        return /\.(jpg|jpeg|png|webp|bmp|avif|heic|gif)(\?|$)/i.test(value);
    }

    /**
     * Get video info (public)
     */
    async getVideoInfo(url: string): Promise<VideoInfo> {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.initialized) {
            throw new Error('yt-dlp API is not available');
        }

        const resp = await this._fetchWithRetry(
            `${this.apiUrl}/info`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            },
            30000,
            1
        );

        if (!resp.ok) {
            const error = await resp.json().catch(() => ({ detail: 'Failed to get video info' })) as { detail: string };
            throw new Error(error.detail);
        }

        return await resp.json() as ApiInfoResponse;
    }

    /**
     * Format duration in seconds to human readable string
     */
    private _formatDuration(seconds: number): string {
        if (!seconds || seconds < 0) return 'unknown';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        }
        return `${secs}s`;
    }
}

// Create default instance
const ytDlpService = new YtDlpService();

export { YtDlpService };
export { type VideoInfo, type DownloadOptions, type ProgressData, type StageData, type YtDlpCompleteData };
export default ytDlpService;



/**
 * Cobalt Service
 * Enhanced Cobalt API client with progress tracking and event emission
 * @module services/video/CobaltService
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import * as videoConfig from '../../config/features/video.js';
import logger from '../../core/Logger.js';
// TYPES
interface DownloadInfo {
    url?: string;
    filename?: string;
    error?: string;
}

interface CobaltResponse {
    status?: string;
    url?: string;
    filename?: string;
    error?: { code?: string } | string;
    text?: string;
    picker?: Array<{ type?: string; url?: string; filename?: string }>;
}

interface ProgressData {
    downloaded: number;
    total: number;
    percent: number;
    speed: number;
    eta: number;
}

interface CompleteData {
    path: string;
    size: number;
    filename?: string;
}

interface DownloadOptions {
    quality?: string;
}
// COBALT SERVICE CLASS
class CobaltService extends EventEmitter {
    private apiUrls: string[];
    private currentApiIndex: number = 0;
    private currentQuality: string = '720';

    constructor() {
        super();
        // Use configured Cobalt instances
        this.apiUrls = (videoConfig as { COBALT_INSTANCES?: string[] }).COBALT_INSTANCES || [
            'http://localhost:9000'
        ];
    }

    get apiUrl(): string {
        return this.apiUrls[this.currentApiIndex];
    }

    switchApi(): void {
        this.currentApiIndex = (this.currentApiIndex + 1) % this.apiUrls.length;
        logger.info('CobaltService', `Switching to Cobalt API: ${this.apiUrl}`);
        this.emit('apiSwitch', { api: this.apiUrl });
    }

    async downloadVideo(url: string, tempDir: string, options: DownloadOptions = {}): Promise<string> {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        let lastError: Error | null = null;
        this.currentQuality = options.quality || (videoConfig as { COBALT_VIDEO_QUALITY?: string }).COBALT_VIDEO_QUALITY || '720';
        
        logger.info('CobaltService', `Cobalt quality requested: ${this.currentQuality}p`);

        this.emit('stage', { stage: 'connecting', message: 'Connecting to Cobalt API...' });

        // Try each API instance
        for (let attempt = 0; attempt < this.apiUrls.length; attempt++) {
            try {
                this.emit('attempt', { attempt: attempt + 1, total: this.apiUrls.length, api: this.apiUrl });
                const result = await this._tryDownload(url, tempDir, timestamp);
                return result;
            } catch (error) {
                lastError = error as Error;
                logger.info('CobaltService', `Cobalt failed for ${url}: ${lastError.message}`);
                this.emit('error', { api: this.apiUrl, error: lastError.message });
                this.switchApi();
            }
        }

        throw lastError || new Error('All Cobalt API instances failed');
    }

    private async _tryDownload(url: string, tempDir: string, timestamp: number): Promise<string> {
        this.emit('stage', { stage: 'analyzing', message: 'Analyzing video...' });
        const downloadInfo = await this._requestDownload(url);

        if (!downloadInfo.url) {
            throw new Error(downloadInfo.error || 'Failed to get download URL');
        }

        this.emit('stage', { stage: 'downloading', message: 'Downloading video file...' });

        const extension = downloadInfo.filename?.split('.').pop() || 'mp4';
        const outputPath = path.join(tempDir, `video_${timestamp}.${extension}`);

        // Retry tunnel/stream downloads up to 2 times (transient 5xx from source proxying)
        const maxTunnelRetries = 2;
        let lastTunnelError: Error | null = null;
        for (let retry = 0; retry <= maxTunnelRetries; retry++) {
            try {
                if (retry > 0) {
                    logger.info('CobaltService', `Retrying tunnel download (attempt ${retry + 1}/${maxTunnelRetries + 1})...`);
                    // Brief delay before retry
                    await new Promise(r => setTimeout(r, 1000 * retry));
                }
                await this._downloadFile(downloadInfo.url, outputPath);
                lastTunnelError = null;
                break;
            } catch (err) {
                lastTunnelError = err as Error;
                const msg = lastTunnelError.message;
                // Only retry on server errors (5xx) — don't retry size/content errors
                if (msg.startsWith('FILE_TOO_LARGE') || msg.startsWith('CONTENT_IS_IMAGES') || !msg.includes('HTTP 5')) {
                    throw lastTunnelError;
                }
                logger.info('CobaltService', `Tunnel download failed (attempt ${retry + 1}): ${msg}`);
            }
        }
        if (lastTunnelError) {
            throw lastTunnelError;
        }

        if (!fs.existsSync(outputPath)) {
            throw new Error('Video file not found after download');
        }

        const stats = fs.statSync(outputPath);
        const fileSizeInMB = stats.size / (1024 * 1024);

        if (fileSizeInMB === 0) {
            fs.unlinkSync(outputPath);
            throw new Error('Downloaded file is empty');
        }

        this.emit('complete', { 
            path: outputPath, 
            size: fileSizeInMB,
            filename: downloadInfo.filename 
        } as CompleteData);

        return outputPath;
    }

    private _requestDownload(url: string): Promise<DownloadInfo> {
        return new Promise((resolve, reject) => {
            // Cobalt API format (v10+ compatible)
            const requestBody = JSON.stringify({
                url: url,
                videoQuality: this.currentQuality || (videoConfig as { COBALT_VIDEO_QUALITY?: string }).COBALT_VIDEO_QUALITY || '720',
                filenameStyle: 'basic'
            });

            const apiUrlParsed = new URL(this.apiUrl);
            const isHttps = apiUrlParsed.protocol === 'https:';
            const protocol = isHttps ? https : http;
            
            const options = {
                hostname: apiUrlParsed.hostname,
                port: apiUrlParsed.port || (isHttps ? '443' : '80'),
                path: '/',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Content-Length': Buffer.byteLength(requestBody),
                    'User-Agent': (videoConfig as { userAgent?: string }).userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: (videoConfig as { network?: { downloadTimeout?: number } }).network?.downloadTimeout || 120000
            };

            logger.info('CobaltService', `Requesting from Cobalt: ${this.apiUrl}`);

            const req = protocol.request(options, (res) => {
                let data = '';

                // Handle HTTP 5xx errors immediately without buffering full response
                if (res.statusCode && res.statusCode >= 500) {
                    reject(new Error(`Cobalt API returned HTTP ${res.statusCode} (server error — instance may be overloaded or crashed)`));
                    return;
                }

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        // Check if response is HTML (error page)
                        if (data.trim().startsWith('<!') || data.trim().startsWith('<html')) {
                            reject(new Error('API returned HTML instead of JSON (might be blocked or down)'));
                            return;
                        }

                        const parsed = JSON.parse(data) as CobaltResponse;
                        logger.info('CobaltService', `Cobalt response status: ${parsed.status}`);
                        
                        // Handle error responses
                        if (parsed.status === 'error' || parsed.error) {
                            const errorCode = typeof parsed.error === 'object' ? parsed.error?.code : parsed.error;
                            const errorMsg = errorCode || parsed.text || 'Cobalt API error';
                            reject(new Error(errorMsg));
                            return;
                        }

                        // Handle different response formats
                        if (parsed.status === 'tunnel' || parsed.status === 'redirect' || parsed.status === 'stream') {
                            // Check if the response is an image/slideshow instead of a video
                            const filename = parsed.filename?.toLowerCase() || '';
                            const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.heic'];
                            if (imageExtensions.some(ext => filename.endsWith(ext))) {
                                reject(new Error('CONTENT_IS_IMAGES:This content contains images/slideshow, not a downloadable video.'));
                                return;
                            }
                            resolve({ url: parsed.url, filename: parsed.filename });
                        } else if (parsed.status === 'picker' && parsed.picker?.length) {
                            // Multiple options available — only pick videos, reject if only images/slideshows
                            const videoOption = parsed.picker.find(p => p.type === 'video');
                            if (videoOption?.url) {
                                resolve({ url: videoOption.url, filename: videoOption.filename });
                            } else {
                                // Check if all picker items are images
                                const hasOnlyImages = parsed.picker.every(p => 
                                    p.type === 'photo' || p.type === 'image' || 
                                    !p.type || // items without type in picker are usually images
                                    (p.url && /\.(jpg|jpeg|png|webp|gif|avif|heic)(\?|$)/i.test(p.url))
                                );
                                if (hasOnlyImages) {
                                    reject(new Error('CONTENT_IS_IMAGES:This content is a photo slideshow, not a downloadable video.'));
                                } else {
                                    reject(new Error('No video found in picker response'));
                                }
                            }
                        } else if (parsed.url) {
                            // Direct URL response
                            resolve({ url: parsed.url, filename: parsed.filename });
                        } else {
                            reject(new Error(`Unexpected response: ${parsed.status || 'unknown'}`));
                        }
                    } catch {
                        reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
                    }
                });
            });

            req.on('error', (err) => {
                reject(new Error(`Connection error: ${err.message}`));
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(requestBody);
            req.end();
        });
    }

    private _downloadFile(url: string, outputPath: string, maxFileSizeMB: number | null = null): Promise<void> {
        return new Promise((resolve, reject) => {
            let redirectCount = 0;
            const maxRedirects = 10;
            let totalBytes = 0;
            let downloadedBytes = 0;
            let lastProgressUpdate = 0;
            const progressUpdateInterval = 500;
            const startTime = Date.now();
            const sizeLimit = maxFileSizeMB || (videoConfig as { MAX_FILE_SIZE_MB?: number }).MAX_FILE_SIZE_MB || 100;

            const download = (downloadUrl: string): void => {
                if (redirectCount >= maxRedirects) {
                    reject(new Error('Too many redirects'));
                    return;
                }

                const urlObj = new URL(downloadUrl);
                const isHttps = urlObj.protocol === 'https:';
                const protocol = isHttps ? https : http;
                
                const options = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || (isHttps ? '443' : '80'),
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': (videoConfig as { userAgent?: string }).userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: (videoConfig as { network?: { downloadTimeout?: number } }).network?.downloadTimeout || 120000
                };

                const req = protocol.request(options, (response) => {
                    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        redirectCount++;
                        let newUrl = response.headers.location;
                        if (!newUrl.startsWith('http')) {
                            newUrl = `${urlObj.protocol}//${urlObj.host}${newUrl}`;
                        }
                        download(newUrl);
                        return;
                    }

                    if (response.statusCode !== 200) {
                        // Consume the response body to get error details
                        let errorBody = '';
                        response.on('data', (chunk: Buffer) => { errorBody += chunk; });
                        response.on('end', () => {
                            const detail = errorBody.substring(0, 200).trim();
                            const statusText = response.statusCode && response.statusCode >= 500
                                ? 'server error — source may be blocking or cookies expired'
                                : 'unexpected status';
                            logger.info('CobaltService', `Tunnel download HTTP ${response.statusCode} (${statusText})${detail ? ': ' + detail : ''}`);
                            reject(new Error(`HTTP ${response.statusCode}`));
                        });
                        return;
                    }

                    // Get content length for progress tracking
                    totalBytes = parseInt(response.headers['content-length'] || '0', 10) || 0;
                    
                    // Check content-type: reject if response is an image (not video)
                    const contentType = response.headers['content-type'] || '';
                    if (contentType.startsWith('image/')) {
                        logger.info('CobaltService', `Response is an image (${contentType}), not a video — rejecting`);
                        req.destroy();
                        reject(new Error('CONTENT_IS_IMAGES:The server returned an image instead of a video file.'));
                        return;
                    }

                    // PRE-DOWNLOAD SIZE CHECK (using content-length as a hint, not authoritative)
                    // Content-Length can be inaccurate due to transcoding/chunked encoding
                    if (totalBytes > 0) {
                        const fileSizeMB = totalBytes / (1024 * 1024);
                        // Only reject if significantly over limit (2x buffer) since header may be inaccurate
                        if (fileSizeMB > sizeLimit * 2) {
                            logger.info('CobaltService', `File size ${fileSizeMB.toFixed(1)}MB greatly exceeds ${sizeLimit}MB limit (pre-download check)`);
                            req.destroy();
                            reject(new Error(`FILE_TOO_LARGE:${fileSizeMB.toFixed(1)}MB`));
                            return;
                        }
                        logger.info('CobaltService', `Pre-download size hint: ${fileSizeMB.toFixed(1)}MB (limit: ${sizeLimit}MB) — will verify after download`);
                    }

                    // Hard streaming limit: abort download immediately if actual bytes exceed limit
                    // This prevents huge files from blowing up the server when content-length is absent/wrong
                    const hardLimitBytes = sizeLimit * 1024 * 1024; // exact limit in bytes for streaming check

                    const file = fs.createWriteStream(outputPath);
                    
                    response.on('data', (chunk: Buffer) => {
                        downloadedBytes += chunk.length;
                        
                        // STREAMING SIZE CHECK: abort if actual downloaded bytes exceed the hard limit
                        if (downloadedBytes > hardLimitBytes) {
                            const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(1);
                            logger.info('CobaltService', `Streaming size limit hit: ${downloadedMB}MB downloaded exceeds ${sizeLimit}MB limit — aborting`);
                            response.destroy();
                            file.close();
                            fs.unlink(outputPath, () => {});
                            reject(new Error(`FILE_TOO_LARGE:${downloadedMB}MB`));
                            return;
                        }

                        const now = Date.now();
                        if (now - lastProgressUpdate >= progressUpdateInterval) {
                            const elapsed = (now - startTime) / 1000;
                            const speed = downloadedBytes / elapsed;
                            const percent = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
                            const eta = totalBytes > 0 && speed > 0 ? (totalBytes - downloadedBytes) / speed : 0;
                            
                            this.emit('progress', {
                                downloaded: downloadedBytes,
                                total: totalBytes,
                                percent: Math.min(percent, 100),
                                speed,
                                eta
                            } as ProgressData);
                            lastProgressUpdate = now;
                        }
                    });
                    
                    response.pipe(file);

                    file.on('finish', () => {
                        file.close();
                        
                        this.emit('progress', {
                            downloaded: downloadedBytes,
                            total: downloadedBytes,
                            percent: 100,
                            speed: 0,
                            eta: 0
                        } as ProgressData);
                        
                        logger.info('CobaltService', `Downloaded ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
                        resolve();
                    });

                    file.on('error', (err) => {
                        fs.unlink(outputPath, () => {});
                        reject(err);
                    });
                });

                req.on('error', (err) => {
                    fs.unlink(outputPath, () => {});
                    reject(err);
                });

                req.on('timeout', () => {
                    req.destroy();
                    fs.unlink(outputPath, () => {});
                    reject(new Error('Download timeout'));
                });

                req.end();
            };

            download(url);
        });
    }

    async getVideoInfo(url: string): Promise<DownloadInfo> {
        return this._requestDownload(url);
    }
}

// Export singleton
const cobaltService = new CobaltService();

export { CobaltService };
export type { DownloadInfo, ProgressData, CompleteData, DownloadOptions };
export default cobaltService;

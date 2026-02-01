const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const videoConfig = require('../../config/features/video');

/**
 * YtDlpService - Fallback video downloader using yt-dlp via Docker
 * Used when Cobalt fails or returns empty videos
 */
class YtDlpService extends EventEmitter {
    constructor() {
        super();
        this.containerName = 'yt-dlp';
        this.dockerDownloadPath = '/downloads';
        // Use services/video/temp folder
        this.tempDir = path.join(__dirname, 'temp');
        this.initialized = false;
    }

    /**
     * Initialize and verify Docker container is running
     */
    async initialize() {
        if (this.initialized) return true;

        try {
            // Ensure temp directory exists
            if (!fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, { recursive: true });
            }

            // Check if Docker is available
            try {
                execSync('docker --version', { 
                    stdio: 'pipe',
                    encoding: 'utf-8',
                    windowsHide: true
                });
            } catch (e) {
                console.warn('⚠️ Docker is not available');
                return false;
            }

            // Check if container is running
            try {
                const result = execSync(`docker inspect -f "{{.State.Running}}" ${this.containerName}`, { 
                    stdio: 'pipe',
                    encoding: 'utf-8',
                    windowsHide: true
                }).trim();

                if (result === 'true') {
                    this.initialized = true;
                    console.log(`✅ yt-dlp Docker container is running`);
                    return true;
                }
            } catch (e) {
                // Container doesn't exist or not running
            }

            // Try to start existing container
            try {
                execSync(`docker start ${this.containerName}`, { 
                    stdio: 'pipe',
                    windowsHide: true
                });
                this.initialized = true;
                console.log(`✅ yt-dlp Docker container started`);
                return true;
            } catch (e) {
                console.warn(`⚠️ yt-dlp container not found. Run: cd YtDlpLocalServer && docker-compose up -d`);
                return false;
            }
        } catch (error) {
            console.warn('⚠️ yt-dlp Docker setup failed:', error.message);
            return false;
        }
    }

    /**
     * Download video using yt-dlp via Docker
     * Uses docker run with volume mount for flexibility
     * @param {string} url - Video URL
     * @param {string} tempDir - Temp directory path (optional)
     * @returns {Promise<string>} - Path to downloaded file
     */
    async downloadVideo(url, tempDir, options = {}) {
        // Ensure temp directory exists
        const downloadDir = tempDir || this.tempDir;
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        const timestamp = Date.now();
        const outputFilename = `video_${timestamp}`;
        
        this.emit('stage', { stage: 'analyzing', message: 'Analyzing video with yt-dlp...' });

        // Get video info first to check duration and file size
        const maxDuration = videoConfig.MAX_VIDEO_DURATION_SECONDS || 600;
        const maxFileSizeMB = videoConfig.MAX_FILE_SIZE_MB || 50;
        
        try {
            const videoInfo = await this._getVideoInfo(url);
            
            if (videoInfo) {
                // Check duration
                if (videoInfo.duration && videoInfo.duration > maxDuration) {
                    const durationStr = this._formatDuration(videoInfo.duration);
                    const maxStr = this._formatDuration(maxDuration);
                    throw new Error(`DURATION_TOO_LONG:${durationStr} (max: ${maxStr})`);
                }
                
                // Estimate file size (rough estimate: ~1MB per minute at 720p, ~2MB at 1080p)
                const quality = options.quality || '720';
                const bitrateMultiplier = quality === '1080' ? 2.5 : (quality === '480' ? 0.5 : 1.2);
                const estimatedSizeMB = (videoInfo.duration / 60) * bitrateMultiplier * 8; // Rough estimate
                
                if (estimatedSizeMB > maxFileSizeMB * 1.5) { // 1.5x buffer for estimate inaccuracy
                    console.log(`⚠️ Estimated size ${estimatedSizeMB.toFixed(1)}MB may exceed ${maxFileSizeMB}MB limit`);
                }
            }
        } catch (infoError) {
            // If it's our custom error, rethrow it
            if (infoError.message.startsWith('DURATION_TOO_LONG')) {
                throw infoError;
            }
            // Otherwise continue with download attempt
            console.warn('⚠️ Could not get video info, proceeding with download:', infoError.message);
        }

        return new Promise((resolve, reject) => {
            // Build quality format string - use provided quality or fall back to config
            const quality = options.quality || videoConfig.YTDLP_VIDEO_QUALITY || videoConfig.COBALT_VIDEO_QUALITY || '720';
            // Format string priority:
            // 1. Best mp4 video at exact quality + m4a audio (h264 codec preferred)
            // 2. Best mp4 video <= quality + m4a audio 
            // 3. Best any video <= quality + best audio
            // NOTE: Do NOT use `best` at the end - it picks combined 360p format 18
            const formatString = `bestvideo[height=${quality}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=${quality}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}][vcodec!*=none]`;
            
            console.log(`🎯 yt-dlp quality requested: ${quality}p, format: ${formatString}`);
            
            // Use docker run with volume mount (more flexible than docker exec)
            // This works regardless of which folder the persistent container is mounted to
            // Note: We already checked duration above, but keep this as backup filter
            const dockerArgs = [
                'run', '--rm',
                '-v', `${downloadDir}:/downloads`,
                'jauderho/yt-dlp:latest',
                url,
                '-f', formatString,
                '-o', `/downloads/${outputFilename}.%(ext)s`,
                '--no-playlist',
                '--no-warnings',
                '--no-check-certificate',
                '--socket-timeout', '30',
                '--retries', String(videoConfig.network?.maxRetries || videoConfig.MAX_RETRIES || 5),
                '--fragment-retries', String(videoConfig.network?.fragmentRetries || videoConfig.FRAGMENT_RETRIES || 5),
                '--merge-output-format', 'mp4',
                '--newline',
            ];

            console.log(`📥 yt-dlp downloading (${quality}p): ${url.substring(0, 50)}...`);
            this.emit('stage', { stage: 'downloading', message: 'Downloading with yt-dlp...' });

            const dockerProcess = spawn('docker', dockerArgs, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });

            let lastProgressUpdate = 0;
            let outputData = '';
            let errorData = '';

            dockerProcess.stdout.on('data', (data) => {
                const line = data.toString();
                outputData += line;
                
                // Parse progress from yt-dlp output
                const progressMatch = line.match(/(\d+\.?\d*)%/);
                if (progressMatch) {
                    const now = Date.now();
                    if (now - lastProgressUpdate >= 500) {
                        const percent = parseFloat(progressMatch[1]);
                        
                        // Try to extract more info
                        const sizeMatch = line.match(/of\s+~?(\d+\.?\d*)(Mi?B|Ki?B|Gi?B)/i);
                        const speedMatch = line.match(/at\s+(\d+\.?\d*)(Mi?B|Ki?B|Gi?B)\/s/i);
                        const etaMatch = line.match(/ETA\s+(\d+:\d+|\d+:\d+:\d+)/);

                        let total = 0;
                        if (sizeMatch) {
                            const size = parseFloat(sizeMatch[1]);
                            const unit = sizeMatch[2].toLowerCase();
                            if (unit.includes('g')) total = size * 1024 * 1024 * 1024;
                            else if (unit.includes('m')) total = size * 1024 * 1024;
                            else if (unit.includes('k')) total = size * 1024;
                        }

                        this.emit('progress', {
                            percent,
                            total,
                            downloaded: total * (percent / 100),
                            speed: speedMatch ? speedMatch[0] : null,
                            eta: etaMatch ? etaMatch[1] : null
                        });
                        lastProgressUpdate = now;
                    }
                }
            });

            dockerProcess.stderr.on('data', (data) => {
                errorData += data.toString();
            });

            dockerProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error('❌ yt-dlp stderr:', errorData);
                    reject(new Error(this._parseYtDlpError(errorData) || `yt-dlp exited with code ${code}`));
                    return;
                }

                // Find the output file in the download directory
                const files = fs.readdirSync(downloadDir);
                const outputFile = files.find(f => f.startsWith(outputFilename));

                if (!outputFile) {
                    reject(new Error('yt-dlp did not produce an output file'));
                    return;
                }

                const finalPath = path.join(downloadDir, outputFile);
                const stats = fs.statSync(finalPath);
                const fileSizeInMB = stats.size / (1024 * 1024);

                if (stats.size === 0) {
                    fs.unlinkSync(finalPath);
                    reject(new Error('Downloaded file is empty'));
                    return;
                }

                console.log(`✅ yt-dlp downloaded ${fileSizeInMB.toFixed(2)} MB to ${finalPath}`);
                this.emit('complete', { 
                    path: finalPath, 
                    size: fileSizeInMB 
                });

                resolve(finalPath);
            });

            dockerProcess.on('error', (err) => {
                reject(new Error(`Docker spawn error: ${err.message}`));
            });
        });
    }

    /**
     * Parse yt-dlp error messages into user-friendly messages
     */
    _parseYtDlpError(errorText) {
        if (!errorText) return null;
        
        const errorLower = errorText.toLowerCase();
        
        // Duration filter rejection
        if (errorLower.includes('does not pass filter') && errorLower.includes('duration')) {
            // Extract duration if possible
            const durationMatch = errorText.match(/duration\s*[<>=]+\s*(\d+)/i);
            const maxMinutes = Math.floor((videoConfig.MAX_VIDEO_DURATION_SECONDS || 600) / 60);
            return `DURATION_TOO_LONG:over ${maxMinutes} minutes`;
        }
        if (errorLower.includes('does not pass filter')) {
            return 'DURATION_TOO_LONG:exceeds limit';
        }
        if (errorLower.includes('private video') || errorLower.includes('sign in')) {
            return 'This video is private or requires login';
        }
        if (errorLower.includes('copyright') || errorLower.includes('blocked')) {
            return 'This video is blocked due to copyright';
        }
        if (errorLower.includes('age') || errorLower.includes('confirm your age')) {
            return 'This video is age-restricted';
        }
        if (errorLower.includes('unavailable') || errorLower.includes('not available')) {
            return 'This video is unavailable';
        }
        if (errorLower.includes('live')) {
            return 'Cannot download live streams';
        }
        if (errorLower.includes('premieres') || errorLower.includes('scheduled')) {
            return 'This video has not premiered yet';
        }
        if (errorLower.includes('members only')) {
            return 'This video is for channel members only';
        }
        if (errorLower.includes('file size')) {
            return 'Video exceeds maximum file size limit';
        }
        if (errorLower.includes('unsupported url') || errorLower.includes('no video')) {
            return 'Unsupported URL or no video found';
        }
        
        // Extract the actual error message if possible
        const errorMatch = errorText.match(/ERROR:\s*(.+)/i);
        if (errorMatch) {
            return errorMatch[1].trim();
        }
        
        return null;
    }

    /**
     * Format duration in seconds to human readable string
     */
    _formatDuration(seconds) {
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

    /**
     * Get video info quickly (internal use)
     */
    async _getVideoInfo(url) {
        return new Promise((resolve, reject) => {
            try {
                const result = execSync(
                    `docker run --rm jauderho/yt-dlp:latest --dump-single-json --no-warnings --no-check-certificate --no-playlist --skip-download "${url}"`,
                    { 
                        stdio: 'pipe',
                        encoding: 'utf-8',
                        timeout: 15000, // 15 second timeout for info only
                        windowsHide: true
                    }
                );
                
                const info = JSON.parse(result);
                resolve({
                    title: info.title,
                    duration: info.duration,
                    filesize: info.filesize || info.filesize_approx,
                    uploader: info.uploader
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Get video info without downloading (via Docker)
     */
    async getVideoInfo(url) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.initialized) {
            throw new Error('yt-dlp Docker container is not available');
        }

        return new Promise((resolve, reject) => {
            try {
                const result = execSync(
                    `docker run --rm jauderho/yt-dlp:latest --dump-single-json --no-warnings --no-check-certificate --no-playlist --extractor-args "youtube:player_client=android,web" --user-agent "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36" --geo-bypass "${url}"`,
                    { 
                        stdio: 'pipe',
                        encoding: 'utf-8',
                        timeout: 30000,
                        windowsHide: true
                    }
                );
                
                const info = JSON.parse(result);
                resolve({
                    title: info.title,
                    duration: info.duration,
                    thumbnail: info.thumbnail,
                    uploader: info.uploader,
                    url: info.url || info.webpage_url
                });
            } catch (error) {
                reject(new Error(this._parseYtDlpError(error.message) || 'Failed to get video info'));
            }
        });
    }
}

module.exports = new YtDlpService();

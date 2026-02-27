/**
 * VideoProcessingService - Ensures videos are mobile-compatible
 * Converts videos to H.264 + AAC format for universal playback
 * @module services/video/VideoProcessingService
 */

import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as videoConfig from '../../config/features/video.js';
import logger from '../../core/Logger.js';
// TYPES
interface VideoAnalysis {
    needsReencoding: boolean;
    videoCodec?: string;
    audioCodec?: string;
    container?: string;
    width?: number;
    height?: number;
    duration?: number;
    reason: string;
}

interface ProcessingOptions {
    maxDuration?: number;
}

interface ProgressData {
    percent: number;
    stage: string;
    message: string;
}

interface StageData {
    stage: string;
    message: string;
}

interface VideoStream {
    codec_type: string;
    codec_name?: string;
    width?: number;
    height?: number;
}

interface FFprobeOutput {
    streams?: VideoStream[];
    format?: {
        duration?: string;
    };
}

// Type for video config
interface VideoConfigType {
    HARDWARE_ENCODERS?: string[];
    ENABLE_MOBILE_PROCESSING?: boolean;
    MOBILE_VIDEO_CODEC?: string;
    MOBILE_AUDIO_CODEC?: string;
    MOBILE_CRF?: string;
    MOBILE_PRESET?: string;
    FFMPEG_THREADS?: number;
    USE_HARDWARE_ACCEL?: boolean;
    MAX_VIDEO_DURATION_SECONDS?: number;
}

const config = videoConfig as unknown as VideoConfigType;
// VIDEO PROCESSING SERVICE CLASS
class VideoProcessingService extends EventEmitter {
    private ffmpegPath: string = 'ffmpeg';
    private ffprobePath: string = 'ffprobe';
    private initialized: boolean = false;
    private hardwareEncoder: string | null = null;
    private hardwareChecked: boolean = false;

    constructor() {
        super();
    }

    /**
     * Initialize and check if FFmpeg is available
     */
    async initialize(): Promise<boolean> {
        if (this.initialized) return true;

        try {
            execSync('ffmpeg -version', { stdio: 'pipe', windowsHide: true });
            execSync('ffprobe -version', { stdio: 'pipe', windowsHide: true });
            this.initialized = true;
            logger.info('VideoProcessingService', 'Initialized (FFmpeg available)');
            return true;
        } catch {
            logger.warn('VideoProcessingService', 'FFmpeg not found - video processing disabled');
            logger.warn('VideoProcessingService', 'Install FFmpeg for mobile-compatible video encoding');
            return false;
        }
    }

    /**
     * Detect available hardware encoder
     * @returns Hardware encoder name or null
     */
    async detectHardwareEncoder(): Promise<string | null> {
        if (this.hardwareChecked) return this.hardwareEncoder;
        this.hardwareChecked = true;
        
        const encoders = config.HARDWARE_ENCODERS || ['h264_nvenc', 'h264_qsv', 'h264_vaapi'];
        
        for (const encoder of encoders) {
            try {
                // Test if encoder is available
                execSync(`ffmpeg -hide_banner -encoders 2>&1 | findstr /i ${encoder}`, {
                    stdio: 'pipe',
                    windowsHide: true,
                    shell: 'cmd.exe'
                });
                
                // Test if encoder actually works with a quick encode
                execSync(`ffmpeg -f lavfi -i color=black:s=64x64:d=0.1 -c:v ${encoder} -f null - 2>&1`, {
                    stdio: 'pipe',
                    windowsHide: true,
                    timeout: 5000
                });
                
                this.hardwareEncoder = encoder;
                logger.info('VideoProcessingService', `Hardware encoder detected: ${encoder}`);
                return encoder;
            } catch {
                // Try next encoder
                continue;
            }
        }
        
        logger.info('VideoProcessingService', 'No hardware encoder available, using software encoding');
        return null;
    }

    /**
     * Check if video needs re-encoding for mobile compatibility
     * @param videoPath - Path to video file
     * @returns Video info and whether it needs re-encoding
     */
    async analyzeVideo(videoPath: string): Promise<VideoAnalysis> {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.initialized) {
            return { needsReencoding: false, reason: 'FFmpeg not available' };
        }

        return new Promise((resolve) => {
            const args = [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                videoPath
            ];

            const ffprobe = spawn(this.ffprobePath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });

            let output = '';
            let errorOutput = '';

            ffprobe.stdout.on('data', (data: Buffer) => {
                output += data.toString();
            });

            ffprobe.stderr.on('data', (data: Buffer) => {
                errorOutput += data.toString();
            });

            ffprobe.on('close', (code: number | null) => {
                if (code !== 0) {
                    logger.error('VideoProcessingService', `FFprobe error: ${errorOutput}`);
                    resolve({ needsReencoding: false, reason: 'Analysis failed' });
                    return;
                }

                try {
                    const info: FFprobeOutput = JSON.parse(output);
                    const videoStream = info.streams?.find(s => s.codec_type === 'video');
                    const audioStream = info.streams?.find(s => s.codec_type === 'audio');

                    if (!videoStream) {
                        resolve({ needsReencoding: false, reason: 'No video stream' });
                        return;
                    }

                    const videoCodec = videoStream.codec_name?.toLowerCase() || '';
                    const audioCodec = audioStream?.codec_name?.toLowerCase() || '';
                    const container = path.extname(videoPath).toLowerCase();

                    // Mobile-compatible codecs
                    const mobileVideoCodecs = ['h264', 'avc', 'avc1'];
                    const mobileAudioCodecs = ['aac', 'mp3', 'mp4a'];

                    const isVideoCompatible = mobileVideoCodecs.some(c => videoCodec.includes(c));
                    const isAudioCompatible = !audioStream || mobileAudioCodecs.some(c => audioCodec.includes(c));
                    const isContainerCompatible = container === '.mp4';

                    const needsReencoding = !isVideoCompatible || !isAudioCompatible || !isContainerCompatible;

                    const result: VideoAnalysis = {
                        needsReencoding,
                        videoCodec,
                        audioCodec,
                        container,
                        width: videoStream.width,
                        height: videoStream.height,
                        duration: parseFloat(info.format?.duration || '0'),
                        reason: needsReencoding
                            ? `Video: ${videoCodec}${!isVideoCompatible ? ' (incompatible)' : ''}, ` +
                              `Audio: ${audioCodec || 'none'}${!isAudioCompatible ? ' (incompatible)' : ''}, ` +
                              `Container: ${container}${!isContainerCompatible ? ' (incompatible)' : ''}`
                            : 'Already mobile-compatible'
                    };

                    logger.info('VideoProcessingService', `Video analysis: ${result.reason}`);
                    resolve(result);
                } catch (parseError) {
                    logger.error('VideoProcessingService', `FFprobe parse error: ${(parseError as Error).message}`);
                    resolve({ needsReencoding: false, reason: 'Parse failed' });
                }
            });

            ffprobe.on('error', (err: Error) => {
                logger.error('VideoProcessingService', `FFprobe spawn error: ${err.message}`);
                resolve({ needsReencoding: false, reason: 'Spawn failed' });
            });
        });
    }

    /**
     * Convert video to mobile-compatible format (H.264 + AAC in MP4)
     * @param inputPath - Input video path
     * @param options - Processing options
     * @returns Path to processed video
     */
    async processForMobile(inputPath: string, options: ProcessingOptions = {}): Promise<string> {
        // Check if mobile processing is enabled
        if (config.ENABLE_MOBILE_PROCESSING === false) {
            logger.info('VideoProcessingService', 'Mobile processing disabled in config');
            return inputPath;
        }

        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.initialized) {
            logger.warn('VideoProcessingService', 'FFmpeg not available, skipping processing');
            return inputPath;
        }

        // Analyze the video first
        const analysis = await this.analyzeVideo(inputPath);

        if (!analysis.needsReencoding) {
            logger.info('VideoProcessingService', 'Video is already mobile-compatible, applying faststart remux');
            // Even if codecs are compatible, the MOOV atom may be at the end of the file
            // (common in streamed downloads). Discord needs MOOV at the start to stream properly.
            // Do a fast remux (no re-encoding, just move MOOV atom) to fix playback issues.
            return this._applyFaststart(inputPath);
        }

        this.emit('stage', { stage: 'processing', message: 'Converting for mobile compatibility...' } as StageData);
        logger.info('VideoProcessingService', `Re-encoding video for mobile: ${analysis.reason}`);

        return new Promise(async (resolve) => {
            const timestamp = Date.now();
            const outputPath = inputPath.replace(/\.[^.]+$/, `_mobile_${timestamp}.mp4`);
            
            // Get settings from config or use defaults
            let videoCodec = config.MOBILE_VIDEO_CODEC || 'libx264';
            const audioCodec = config.MOBILE_AUDIO_CODEC || 'aac';
            const crf = config.MOBILE_CRF || '28';
            const preset = config.MOBILE_PRESET || 'ultrafast';
            const threads = config.FFMPEG_THREADS ?? 0;
            
            // Try hardware acceleration if enabled
            if (config.USE_HARDWARE_ACCEL) {
                const hwEncoder = await this.detectHardwareEncoder();
                if (hwEncoder) {
                    videoCodec = hwEncoder;
                    logger.info('VideoProcessingService', `Using hardware encoder: ${hwEncoder}`);
                }
            }
            
            // FFmpeg arguments for mobile-compatible encoding - OPTIMIZED FOR SPEED
            const args: string[] = [
                '-i', inputPath,
                '-y',                           // Overwrite output
                '-threads', String(threads),    // Use all CPU cores
                '-c:v', videoCodec,             // Video codec (hw or libx264)
            ];
            
            // Add codec-specific options
            if (videoCodec === 'libx264') {
                args.push(
                    '-preset', preset,          // ultrafast for max speed
                    '-crf', crf,                // Higher CRF = faster
                    '-tune', 'fastdecode'       // Optimize for fast decoding
                );
            } else if (videoCodec.includes('nvenc')) {
                args.push(
                    '-preset', 'p1',            // Fastest NVENC preset
                    '-rc', 'vbr',               // Variable bitrate
                    '-cq', crf                  // Quality level
                );
            } else if (videoCodec.includes('qsv')) {
                args.push(
                    '-preset', 'veryfast',
                    '-global_quality', crf
                );
            }
            
            args.push(
                '-profile:v', 'high',           // High profile for compression
                '-level', '4.1',                // Compatible with most devices
                '-pix_fmt', 'yuv420p',          // Required for some players
                '-c:a', audioCodec,             // AAC audio codec
                '-b:a', '128k',                 // Lower audio bitrate for speed
                '-ar', '44100',                 // Audio sample rate
                '-movflags', '+faststart',      // Enable fast start for streaming
                '-max_muxing_queue_size', '2048',
                outputPath
            );

            // Add duration limit if needed
            const maxDuration = config.MAX_VIDEO_DURATION_SECONDS || 600;
            if (analysis.duration && analysis.duration > maxDuration) {
                args.splice(2, 0, '-t', String(maxDuration));
            }

            logger.info('VideoProcessingService', `FFmpeg processing: ${inputPath} -> ${outputPath}`);
            logger.info('VideoProcessingService', `Codec: ${videoCodec}, Preset: ${preset}, CRF: ${crf}`);

            const ffmpeg = spawn(this.ffmpegPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });

            let lastProgressUpdate = 0;
            let errorOutput = '';

            ffmpeg.stderr.on('data', (data: Buffer) => {
                const line = data.toString();
                errorOutput += line;

                // Parse progress from FFmpeg output
                const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
                if (timeMatch && analysis.duration && analysis.duration > 0) {
                    const hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const seconds = parseFloat(timeMatch[3]);
                    const currentTime = hours * 3600 + minutes * 60 + seconds;
                    const percent = Math.min((currentTime / analysis.duration) * 100, 99);

                    const now = Date.now();
                    if (now - lastProgressUpdate >= 500) {
                        this.emit('progress', {
                            percent,
                            stage: 'processing',
                            message: `Converting: ${percent.toFixed(0)}%`
                        } as ProgressData);
                        lastProgressUpdate = now;
                    }
                }
            });

            ffmpeg.on('close', (code: number | null) => {
                if (code !== 0) {
                    logger.error('VideoProcessingService', `FFmpeg error: ${errorOutput.slice(-500)}`);
                    // Return original file if processing fails
                    resolve(inputPath);
                    return;
                }

                // Verify output file exists and has content
                if (fs.existsSync(outputPath)) {
                    const stats = fs.statSync(outputPath);
                    if (stats.size > 0) {
                        logger.info('VideoProcessingService', `Video processed: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                        
                        // Delete original file
                        try {
                            fs.unlinkSync(inputPath);
                        } catch (e) {
                            logger.warn('VideoProcessingService', `Could not delete original file: ${(e as Error).message}`);
                        }

                        this.emit('progress', { percent: 100, stage: 'processing', message: 'Processing complete!' } as ProgressData);
                        resolve(outputPath);
                        return;
                    }
                }

                // Output file invalid, return original
                logger.warn('VideoProcessingService', 'Processed file invalid, using original');
                try {
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                } catch {
                    // Ignore cleanup errors
                }
                resolve(inputPath);
            });

            ffmpeg.on('error', (err: Error) => {
                logger.error('VideoProcessingService', `FFmpeg spawn error: ${err.message}`);
                resolve(inputPath);
            });

            // Timeout for processing (5 minutes max)
            const timeout = setTimeout(() => {
                logger.warn('VideoProcessingService', 'FFmpeg processing timeout');
                ffmpeg.kill('SIGKILL');
            }, 5 * 60 * 1000);

            ffmpeg.on('close', () => clearTimeout(timeout));
        });
    }

    /**
     * Apply faststart to an already-compatible MP4 file (remux only, no re-encoding).
     * Moves the MOOV atom to the beginning of the file so Discord can stream it properly.
     * This fixes the issue where videos stop playing mid-way and require a page reload.
     * @param inputPath - Path to the input MP4 file
     * @returns Path to the faststart remuxed file
     */
    private async _applyFaststart(inputPath: string): Promise<string> {
        if (!this.initialized) {
            return inputPath;
        }

        const timestamp = Date.now();
        const outputPath = inputPath.replace(/\.[^.]+$/, `_faststart_${timestamp}.mp4`);

        return new Promise((resolve) => {
            const args = [
                '-i', inputPath,
                '-y',
                '-c', 'copy',                      // No re-encoding, just remux
                '-movflags', '+faststart',          // Move MOOV atom to the beginning
                '-max_muxing_queue_size', '2048',
                outputPath
            ];

            logger.info('VideoProcessingService', `Applying faststart remux: ${path.basename(inputPath)}`);

            const ffmpeg = spawn(this.ffmpegPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });

            let errorOutput = '';

            ffmpeg.stderr.on('data', (data: Buffer) => {
                errorOutput += data.toString();
            });

            ffmpeg.on('close', (code: number | null) => {
                if (code !== 0) {
                    logger.warn('VideoProcessingService', `Faststart remux failed (code ${code}), using original file`);
                    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* ignore */ }
                    resolve(inputPath);
                    return;
                }

                if (fs.existsSync(outputPath)) {
                    const stats = fs.statSync(outputPath);
                    if (stats.size > 0) {
                        logger.info('VideoProcessingService', `Faststart remux complete: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                        // Delete original file
                        try { fs.unlinkSync(inputPath); } catch (e) {
                            logger.warn('VideoProcessingService', `Could not delete original file: ${(e as Error).message}`);
                        }
                        resolve(outputPath);
                        return;
                    }
                }

                // Output invalid, use original
                logger.warn('VideoProcessingService', 'Faststart output invalid, using original');
                try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* ignore */ }
                resolve(inputPath);
            });

            ffmpeg.on('error', (err: Error) => {
                logger.error('VideoProcessingService', `Faststart spawn error: ${err.message}`);
                resolve(inputPath);
            });

            // Timeout for remux (30 seconds should be plenty for copy-only)
            const timeout = setTimeout(() => {
                logger.warn('VideoProcessingService', 'Faststart remux timeout');
                ffmpeg.kill('SIGKILL');
            }, 30 * 1000);

            ffmpeg.on('close', () => clearTimeout(timeout));
        });
    }

    /**
     * Quick check if file is mobile-compatible without full analysis
     * @param videoPath - Video file path
     * @returns True if likely compatible
     */
    isLikelyMobileCompatible(videoPath: string): boolean {
        const ext = path.extname(videoPath).toLowerCase();
        // WebM files are almost never mobile-compatible
        // MKV files need conversion
        return ext === '.mp4';
    }
}

// Create default instance
const videoProcessingService = new VideoProcessingService();

export { VideoProcessingService };
export type { VideoAnalysis, ProcessingOptions, ProgressData, StageData };
export default videoProcessingService;

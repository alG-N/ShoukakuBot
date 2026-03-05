import type { ProgressData, StageData } from './processing.js';

export interface VideoAnalysis {
    needsReencoding: boolean;
    videoCodec?: string;
    audioCodec?: string;
    container?: string;
    width?: number;
    height?: number;
    duration?: number;
    reason: string;
}

export interface ProcessingOptions {
    maxDuration?: number;
}

export interface VideoStream {
    codec_type: string;
    codec_name?: string;
    width?: number;
    height?: number;
}

export interface FFprobeOutput {
    streams?: VideoStream[];
    format?: {
        duration?: string;
    };
}

export type { ProgressData, StageData };

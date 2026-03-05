import type { DownloadOptions, ProgressData, StageData } from './processing.js';

export interface VideoInfo {
    title: string;
    duration: number;
    filesize?: number;
    uploader?: string;
    thumbnail?: string;
    url?: string;
}

export interface YtDlpCompleteData {
    path: string;
    size: number;
}

export interface ApiDownloadResponse {
    filename: string;
    size_mb: number;
    duration: number;
    title: string;
    format: string;
}

export interface ApiInfoResponse {
    title: string;
    duration: number;
    filesize?: number;
    uploader?: string;
    thumbnail?: string;
    url?: string;
}

export interface ApiHealthResponse {
    status: string;
    version: string;
    active_downloads: number;
    max_concurrent: number;
    disk_free_mb: number;
}

export type { DownloadOptions, ProgressData, StageData };

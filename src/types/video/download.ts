import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { ProgressData } from './processing.js';

export interface VideoConfig {
	USER_COOLDOWN_SECONDS?: number;
	MAX_CONCURRENT_DOWNLOADS?: number;
	COBALT_VIDEO_QUALITY?: string;
	MAX_FILE_SIZE_MB?: number;
	limits?: {
		maxFileSizeMB?: number;
	};
	smartRateLimiting?: {
		enabled: boolean;
		globalMaxConcurrent: number;
		perGuildMaxConcurrent: number;
		perGuildCooldownSeconds: number;
		peakHours: {
			enabled: boolean;
			start: number;
			end: number;
			peakMaxConcurrent: number;
			peakPerGuildMax: number;
			peakUserCooldownSeconds: number;
		};
		burstProtection: {
			enabled: boolean;
			windowSeconds: number;
			maxRequestsPerWindow: number;
		};
	};
}

export interface Platform {
	name: string;
	id: string;
}

export interface CommandDownloadResult {
	path: string;
	size: number;
	format: string;
	error?: string;
}

export type VideoDownloadService = {
	downloadVideo: (url: string, options: { quality: string }) => Promise<CommandDownloadResult>;
	getVideoUrl?: (url: string, options: { quality: string }) => Promise<{ url: string; filename?: string; size?: number } | null>;
	on?: (event: string, handler: (data: ProgressData) => void) => void;
	off?: (event: string, handler: (data: ProgressData) => void) => void;
};

export interface PlatformDetector {
	detect: (url: string) => Platform | string;
}

export interface VideoEmbedBuilder {
	buildLoadingEmbed?: (platformName: string, platformId: string, stage: string) => EmbedBuilder;
	buildProgressEmbed?: (platformName: string, platformId: string, data: ProgressData) => EmbedBuilder;
	buildDownloadFailedEmbed?: (message: string) => EmbedBuilder;
}

export interface UrlValidator {
	validateUrl: (interaction: ChatInputCommandInteraction, url: string) => Promise<boolean>;
}
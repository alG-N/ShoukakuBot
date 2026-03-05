export interface EmbedFixRule {
    platformId: string;
    name: string;
    emoji: string;
    patterns: RegExp[];
    replacements: [string, string][];
    service: string;
    reliable: boolean;
}

export interface EmbedFixResult {
    success: boolean;
    originalUrl: string;
    fixedUrl?: string;
    platform?: {
        id: string;
        name: string;
        emoji: string;
        service: string;
        reliable: boolean;
    };
    error?: string;
}

export interface EmbedFixStats {
    totalConverted: number;
    perPlatform: Record<string, number>;
}

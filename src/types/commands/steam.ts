import type { ChatInputCommandInteraction } from 'discord.js';

export type SaleHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;

export interface SteamStoreSearchItem {
    id: number;
    name: string;
    tiny_image?: string;
    metascore?: string;
    price?: {
        currency: string;
        initial: number;
        final: number;
        discount_percent: number;
    };
}

export interface SteamAppDetail {
    success: boolean;
    data?: {
        name: string;
        steam_appid: number;
        short_description?: string;
        header_image?: string;
        developers?: string[];
        publishers?: string[];
        release_date?: { coming_soon: boolean; date: string };
        genres?: Array<{ description: string }>;
        metacritic?: { score: number; url: string };
        price_overview?: {
            currency: string;
            initial: number;
            final: number;
            discount_percent: number;
            initial_formatted: string;
            final_formatted: string;
        };
        platforms?: { windows: boolean; mac: boolean; linux: boolean };
        recommendations?: { total: number };
        categories?: Array<{ description: string }>;
        is_free?: boolean;
    };
}
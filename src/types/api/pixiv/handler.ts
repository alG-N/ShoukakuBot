import type { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from 'discord.js';
import type { PixivImageUrls, PixivTag } from './model.js';

export interface PixivContentUser {
    id: number;
    name: string;
}

export interface PixivItem {
    id: number;
    title: string;
    user: PixivContentUser;
    tags?: PixivTag[];
    page_count: number;
    x_restrict: number;
    illust_ai_type?: number;
    type?: string;
    total_view?: number;
    total_bookmarks?: number;
    create_date: string;
    image_urls?: PixivImageUrls;
    text?: string;
    text_length?: number;
}

export interface ContentEmbedOptions {
    resultIndex?: number;
    totalResults?: number;
    searchPage?: number;
    cacheKey?: string;
    contentType?: 'illust' | 'novel';
    hasNextPage?: boolean;
    shouldTranslate?: boolean;
    originalQuery?: string;
    translatedQuery?: string;
    mangaPageIndex?: number;
    sortMode?: string;
    showNsfw?: boolean;
}

export interface ContentEmbedResult {
    embed: EmbedBuilder;
    rows: ActionRowBuilder<ButtonBuilder>[];
}

export interface BuildEmbedOptions {
    sortModeText: string;
    nsfwStatus: string;
    aiStatus: string;
    searchPage: number;
    resultIndex: number;
    totalResults: number;
    shouldTranslate: boolean;
    originalQuery: string;
    views: number;
    bookmarks: number;
    bookmarkRate: string;
    mangaPageIndex?: number;
}
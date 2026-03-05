export interface SteamGame {
    id: number;
    name: string;
    discount_percent: number;
    original_price: number;
    final_price: number;
    currency?: string;
    needsUsdPrice?: boolean;
    usdPrice?: {
        currency: string;
        initial: number;
        final: number;
        discount_percent: number;
    };
    owners?: string;
    positive?: number;
    negative?: number;
}

export interface SteamSaleResponse {
    success: number;
    results_html: string;
    total_count: number;
    start: number;
}

export interface SteamPriceOverview {
    currency: string;
    initial: number;
    final: number;
    discount_percent: number;
    initial_formatted: string;
    final_formatted: string;
}

export interface SteamAppDetailsData {
    price_overview?: SteamPriceOverview;
}

export interface SteamAppDetailsResponse {
    success: boolean;
    data?: SteamAppDetailsData;
}

export interface SteamFeaturedGame {
    id: number;
    name: string;
    discount_percent: number;
    original_price: number;
    final_price: number;
}

export interface SteamFeaturedCategoriesResponse {
    specials?: {
        items: SteamFeaturedGame[];
    };
}

export interface SteamSpyData {
    appid: number;
    name: string;
    developer: string;
    publisher: string;
    score_rank: string;
    positive: number;
    negative: number;
    userscore: number;
    owners: string;
    average_forever: number;
    average_2weeks: number;
    median_forever: number;
    median_2weeks: number;
    price: string;
    initialprice: string;
    discount: string;
    ccu: number;
    languages: string;
    genre: string;
    tags: Record<string, number>;
}

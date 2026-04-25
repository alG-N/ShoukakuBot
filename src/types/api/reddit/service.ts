export interface RedditTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}

export interface RawRedditPostData {
    title?: string;
    url?: string;
    url_overridden_by_dest?: string;
    post_hint?: string;
    preview?: {
        images?: Array<{
            source?: {
                url: string;
            };
            variants?: {
                gif?: {
                    source?: {
                        url: string;
                    };
                };
                mp4?: {
                    source?: {
                        url: string;
                    };
                };
            };
        }>;
        reddit_video_preview?: {
            fallback_url: string;
            is_gif?: boolean;
        };
    };
    gallery_data?: {
        items: Array<{
            media_id: string;
        }>;
    };
    media_metadata?: Record<string, {
        s?: {
            u?: string;
            gif?: string;
            mp4?: string;
        };
        e?: string;
    }>;
    is_video?: boolean;
    media?: {
        reddit_video?: {
            fallback_url: string;
            is_gif?: boolean;
        };
    };
    selftext?: string;
    permalink?: string;
    ups?: number;
    downs?: number;
    num_comments?: number;
    total_awards_received?: number;
    author?: string;
    over_18?: boolean;
    created_utc?: number;
    domain?: string;
}

export interface RawRedditListingResponse {
    data?: {
        children?: Array<{
            data: RawRedditPostData;
        }>;
    };
}

export interface RawSubredditAboutResponse {
    kind?: string;
    data?: {
        display_name: string;
    };
}

export interface RawSubredditSearchResponse {
    data: {
        children: Array<{
            data: {
                display_name: string;
                title?: string;
                display_name_prefixed: string;
            };
        }>;
    };
}

export type RedditSortBy = 'hot' | 'new' | 'top' | 'rising' | 'controversial';

export type RedditTimeFilter = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';

export type RedditRegion =
    | 'global'
    | 'us'
    | 'uk'
    | 'ar'
    | 'au'
    | 'de'
    | 'es'
    | 'fr'
    | 'in'
    | 'it'
    | 'jp'
    | 'mx'
    | 'nl'
    | 'pl'
    | 'pt'
    | 'se';
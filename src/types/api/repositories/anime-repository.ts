export interface AnimeFavourite {
    anime_id: number;
    anime_title: string;
    source?: string;
    created_at?: Date;
    title?: string;
}

export interface AnimeNotification {
    user_id: string;
    anime_id: number;
    notify: boolean;
    created_at?: Date;
    updated_at?: Date;
}

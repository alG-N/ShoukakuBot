import type { NHentaiGallery } from './model.js';

export type NHentaiFavouriteGalleryInput = Pick<NHentaiGallery, 'id' | 'title' | 'num_pages' | 'tags'>;

export interface NHentaiFavourite {
    gallery_id: number;
    gallery_title: string;
    num_pages: number;
    tags: string;
    created_at?: Date;
}

export interface ToggleFavouriteResult {
    added: boolean;
    removed: boolean;
}

export interface NHentaiUserSettings {
    popular_period: 'today' | 'week' | 'month' | 'all';
    random_period: 'today' | 'week' | 'month' | 'all';
}
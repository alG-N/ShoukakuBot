import type { NHentaiGallery } from '../models/nhentai.js';

export interface NHentaiSearchResponse {
    result: NHentaiGallery[];
    num_pages: number;
    per_page: number;
}

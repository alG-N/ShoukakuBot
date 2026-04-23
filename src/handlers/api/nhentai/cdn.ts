import https from 'node:https';
import axios from 'axios';
import logger from '../../../core/Logger.js';
import { nhentai as nhentaiConfig } from '../../../config/services.js';
import { getExt } from './utils.js';

interface PageCacheEntry {
    buffer: Buffer;
    cachedAt: number;
}

const PAGE_IMAGE_CACHE = new Map<string, PageCacheEntry>();
const PAGE_IMAGE_IN_FLIGHT = new Map<string, Promise<Buffer | null>>();
const PAGE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PAGE_CACHE_MAX_ENTRIES = 60;
const NHENTAI_HTTPS_AGENT = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 12,
    maxFreeSockets: 6,
    scheduling: 'lifo'
});
const NHENTAI_IMAGE_CLIENT = axios.create({
    responseType: 'arraybuffer',
    timeout: 10000,
    httpsAgent: NHENTAI_HTTPS_AGENT
});

export class NhentaiCdnClient {
    private readonly CDN_MIRRORS = ['i', 'i2', 'i3', 'i1'];
    private readonly THUMB_MIRRORS = ['t', 't2', 't3', 't1'];
    private thumbIndex = 0;

    async fetchImage(url: string): Promise<Buffer | null> {
        try {
            const headers: Record<string, string> = {
                'User-Agent': nhentaiConfig.userAgent,
                Referer: 'https://nhentai.net/',
                Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'same-site'
            };
            if (nhentaiConfig.cfClearance) {
                headers.Cookie = `cf_clearance=${nhentaiConfig.cfClearance}`;
            }
            const response = await NHENTAI_IMAGE_CLIENT.get(url, { headers });
            return Buffer.from(response.data);
        } catch (error) {
            const err = error as { response?: { status: number }; message?: string };
            const status = err.response?.status;
            if (status === 404) {
                logger.debug('NHentai', `Image not found (404), trying next mirror/extension | URL: ${url}`);
            } else {
                logger.warn('NHentai', `Failed to fetch image (${status || 'network'}): ${err.message} | URL: ${url}`);
            }
            return null;
        }
    }

    async fetchImageWithRetry(urls: string[]): Promise<Buffer | null> {
        for (const url of urls) {
            const result = await this.fetchImage(url);
            if (result) return result;
        }
        return null;
    }

    getAllThumbnailUrls(mediaId: string, coverType: string): string[] {
        const extension = getExt(coverType);
        const startIdx = this.thumbIndex % this.THUMB_MIRRORS.length;
        this.thumbIndex++;
        const urls: string[] = [];

        for (let i = 0; i < this.THUMB_MIRRORS.length; i++) {
            const mirror = this.THUMB_MIRRORS[(startIdx + i) % this.THUMB_MIRRORS.length];
            urls.push(`https://${mirror}.nhentai.net/galleries/${mediaId}/cover.${extension}`);
        }

        const fallbackExts = ['webp', 'jpg', 'png'].filter(e => e !== extension);
        const fallbackMirror = this.THUMB_MIRRORS[startIdx % this.THUMB_MIRRORS.length];
        for (const fbExt of fallbackExts) {
            urls.push(`https://${fallbackMirror}.nhentai.net/galleries/${mediaId}/cover.${fbExt}`);
        }

        return urls;
    }

    getAllPageImageUrls(mediaId: string, pageNum: number, pageType: string): string[] {
        const extension = getExt(pageType);
        const startIdx = pageNum % this.CDN_MIRRORS.length;
        const urls: string[] = [];

        for (let i = 0; i < this.CDN_MIRRORS.length; i++) {
            const mirror = this.CDN_MIRRORS[(startIdx + i) % this.CDN_MIRRORS.length];
            urls.push(`https://${mirror}.nhentai.net/galleries/${mediaId}/${pageNum}.${extension}`);
        }

        const fallbackExts = ['webp', 'jpg', 'png'].filter(e => e !== extension);
        const fallbackMirror = this.CDN_MIRRORS[startIdx % this.CDN_MIRRORS.length];
        for (const fbExt of fallbackExts) {
            urls.push(`https://${fallbackMirror}.nhentai.net/galleries/${mediaId}/${pageNum}.${fbExt}`);
        }

        return urls;
    }

    getThumbnailUrl(mediaId: string, coverType: string): string {
        const extension = getExt(coverType);
        const mirror = this.THUMB_MIRRORS[this.thumbIndex % this.THUMB_MIRRORS.length];
        this.thumbIndex++;
        return `https://${mirror}.nhentai.net/galleries/${mediaId}/cover.${extension}`;
    }

    getPageImageUrl(mediaId: string, pageNum: number, pageType: string): string {
        const extension = getExt(pageType);
        const mirror = this.CDN_MIRRORS[pageNum % this.CDN_MIRRORS.length];
        return `https://${mirror}.nhentai.net/galleries/${mediaId}/${pageNum}.${extension}`;
    }

    getPageThumbUrl(mediaId: string, pageNum: number, pageType: string): string {
        const extension = getExt(pageType);
        const mirror = this.THUMB_MIRRORS[pageNum % this.THUMB_MIRRORS.length];
        return `https://${mirror}.nhentai.net/galleries/${mediaId}/${pageNum}t.${extension}`;
    }

    getPageImageCached(mediaId: string, pageNum: number, pageType: string): Buffer | null {
        const key = `${mediaId}_${pageNum}_${getExt(pageType)}`;
        const entry = PAGE_IMAGE_CACHE.get(key);
        if (!entry) return null;
        if (Date.now() - entry.cachedAt > PAGE_CACHE_TTL_MS) {
            PAGE_IMAGE_CACHE.delete(key);
            return null;
        }
        return entry.buffer;
    }

    private setPageImageCached(mediaId: string, pageNum: number, pageType: string, buffer: Buffer): void {
        const key = `${mediaId}_${pageNum}_${getExt(pageType)}`;
        if (PAGE_IMAGE_CACHE.size >= PAGE_CACHE_MAX_ENTRIES) {
            const oldest = [...PAGE_IMAGE_CACHE.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
            if (oldest) PAGE_IMAGE_CACHE.delete(oldest[0]);
        }
        PAGE_IMAGE_CACHE.set(key, { buffer, cachedAt: Date.now() });
    }

    async fetchPageImageWithCache(mediaId: string, pageNum: number, pageType: string): Promise<Buffer | null> {
        const key = `${mediaId}_${pageNum}_${getExt(pageType)}`;
        const cached = this.getPageImageCached(mediaId, pageNum, pageType);
        if (cached) return cached;

        const inFlight = PAGE_IMAGE_IN_FLIGHT.get(key);
        if (inFlight) return inFlight;

        const fetchPromise = (async () => {
            const urls = this.getAllPageImageUrls(mediaId, pageNum, pageType);
            const buffer = await this.fetchImageWithRetry(urls);
            if (buffer) this.setPageImageCached(mediaId, pageNum, pageType, buffer);
            return buffer;
        })();

        PAGE_IMAGE_IN_FLIGHT.set(key, fetchPromise);

        try {
            return await fetchPromise;
        } finally {
            PAGE_IMAGE_IN_FLIGHT.delete(key);
        }
    }
}

import axios from 'axios';
import logger from '../../../core/Logger.js';
import { nhentai as nhentaiConfig } from '../../../config/services.js';
import { getExt } from './utils.js';

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
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 10000,
                headers
            });
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
}

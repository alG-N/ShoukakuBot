import https from 'node:https';
import axios from 'axios';
import logger from '../../../core/observability/Logger.js';
import { nhentai as nhentaiConfig } from '../../../config/services.js';
import { getExt } from './utils.js';

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
    private readonly PAGE_MIRROR = 'i1';
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

    getThumbnailUrl(mediaId: string, coverType: string): string {
        const extension = getExt(coverType);
        const mirror = this.THUMB_MIRRORS[this.thumbIndex % this.THUMB_MIRRORS.length];
        this.thumbIndex++;
        return `https://${mirror}.nhentai.net/galleries/${mediaId}/cover.${extension}`;
    }

    getPageImageUrl(mediaId: string, pageNum: number, pageType: string): string {
        const extension = getExt(pageType);
        return `https://${this.PAGE_MIRROR}.nhentai.net/galleries/${mediaId}/${pageNum}.${extension}`;
    }
}

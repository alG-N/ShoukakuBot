/**
 * Pixiv Repository
 * Database operations for pixiv user settings
 */

import postgres from '../../database/postgres.js';
import logger from '../../core/observability/Logger.js';
import type { PixivUserSettings } from '../../types/api/pixiv/settings.js';

const VALID_CONTENT_TYPES = ['illust', 'manga', 'novel'];
const VALID_NSFW_MODES = ['sfw', 'all'];
const VALID_SORT_MODES = ['popular_desc', 'date_desc', 'date_asc', 'day', 'week', 'month'];

const DEFAULT_SETTINGS: PixivUserSettings = {
    content_types: 'illust',
    r18_enabled: false,
    nsfw_mode: 'sfw',
    sort_mode: 'popular_desc',
    ai_filter: false,
    quality_filter: false,
    min_bookmarks: 0,
    translate: false
};

class PixivRepository {
    private initialized = false;

    private async _initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            await postgres.query(`
                CREATE TABLE IF NOT EXISTS pixiv_user_settings (
                    user_id VARCHAR(20) PRIMARY KEY,
                    content_types VARCHAR(50) NOT NULL DEFAULT 'illust',
                    r18_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    nsfw_mode VARCHAR(10) NOT NULL DEFAULT 'sfw',
                    sort_mode VARCHAR(20) NOT NULL DEFAULT 'popular_desc',
                    ai_filter BOOLEAN NOT NULL DEFAULT FALSE,
                    quality_filter BOOLEAN NOT NULL DEFAULT FALSE,
                    min_bookmarks INTEGER NOT NULL DEFAULT 0,
                    translate BOOLEAN NOT NULL DEFAULT FALSE,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.initialized = true;
        } catch (error: any) {
            logger.error('PixivRepository', `Init error: ${error.message}`);
        }
    }

    async getUserSettings(userId: string): Promise<PixivUserSettings | null> {
        await this._initialize();

        try {
            const row = await postgres.getOne(
                `SELECT content_types, r18_enabled, nsfw_mode, sort_mode, ai_filter, quality_filter, min_bookmarks, translate
                 FROM pixiv_user_settings WHERE user_id = $1`,
                [userId]
            ) as PixivUserSettings | null;

            if (!row) return null;

            return this._validateSettings(row);
        } catch (error: any) {
            logger.error('PixivRepository', `Error getting user settings: ${error.message}`);
            return null;
        }
    }

    async setUserSettings(userId: string, settings: Partial<PixivUserSettings>): Promise<PixivUserSettings> {
        await this._initialize();

        const current = (await this.getUserSettings(userId)) || { ...DEFAULT_SETTINGS };

        const next: PixivUserSettings = {
            content_types: settings.content_types !== undefined
                ? this._validateContentTypes(settings.content_types)
                : current.content_types,
            r18_enabled: settings.r18_enabled ?? current.r18_enabled,
            nsfw_mode: (settings.nsfw_mode && VALID_NSFW_MODES.includes(settings.nsfw_mode))
                ? settings.nsfw_mode
                : current.nsfw_mode,
            sort_mode: (settings.sort_mode && VALID_SORT_MODES.includes(settings.sort_mode))
                ? settings.sort_mode
                : current.sort_mode,
            ai_filter: settings.ai_filter ?? current.ai_filter,
            quality_filter: settings.quality_filter ?? current.quality_filter,
            min_bookmarks: settings.min_bookmarks ?? current.min_bookmarks,
            translate: settings.translate ?? current.translate
        };

        // If R18 enabled, force nsfw_mode to be irrelevant (store as 'sfw' but it won't be used)
        if (next.r18_enabled) {
            next.nsfw_mode = 'sfw';
        }

        try {
            await postgres.query(
                `INSERT INTO pixiv_user_settings (user_id, content_types, r18_enabled, nsfw_mode, sort_mode, ai_filter, quality_filter, min_bookmarks, translate, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                 ON CONFLICT (user_id)
                 DO UPDATE SET
                    content_types = EXCLUDED.content_types,
                    r18_enabled = EXCLUDED.r18_enabled,
                    nsfw_mode = EXCLUDED.nsfw_mode,
                    sort_mode = EXCLUDED.sort_mode,
                    ai_filter = EXCLUDED.ai_filter,
                    quality_filter = EXCLUDED.quality_filter,
                    min_bookmarks = EXCLUDED.min_bookmarks,
                    translate = EXCLUDED.translate,
                    updated_at = CURRENT_TIMESTAMP`,
                [userId, next.content_types, next.r18_enabled, next.nsfw_mode, next.sort_mode, next.ai_filter, next.quality_filter, next.min_bookmarks, next.translate]
            );
        } catch (error: any) {
            logger.error('PixivRepository', `Error setting user settings: ${error.message}`);
        }

        return next;
    }

    private _validateSettings(row: PixivUserSettings): PixivUserSettings {
        return {
            content_types: this._validateContentTypes(row.content_types),
            r18_enabled: Boolean(row.r18_enabled),
            nsfw_mode: VALID_NSFW_MODES.includes(row.nsfw_mode) ? row.nsfw_mode : 'sfw',
            sort_mode: VALID_SORT_MODES.includes(row.sort_mode) ? row.sort_mode : 'popular_desc',
            ai_filter: Boolean(row.ai_filter),
            quality_filter: Boolean(row.quality_filter),
            min_bookmarks: Math.max(0, Number(row.min_bookmarks) || 0),
            translate: Boolean(row.translate)
        };
    }

    private _validateContentTypes(raw: string): string {
        const types = raw.split(',').map(t => t.trim()).filter(t => VALID_CONTENT_TYPES.includes(t));
        return types.length > 0 ? types.join(',') : 'illust';
    }
}

const pixivRepository = new PixivRepository();
export { pixivRepository, PixivRepository };
export default pixivRepository;

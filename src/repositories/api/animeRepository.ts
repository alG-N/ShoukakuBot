/**
 * Anime Repository
 * Database operations for anime favourites and notifications
 */

import postgres from '../../database/postgres.js';
import logger from '../../core/Logger.js';
// Interfaces
interface AnimeFavourite {
    anime_id: number;
    anime_title: string;
    source?: string;
    created_at?: Date;
    // Mapped properties for easier access
    title?: string;
}

interface AnimeNotification {
    user_id: string;
    anime_id: number;
    notify: boolean;
    created_at?: Date;
    updated_at?: Date;
}


// AnimeRepository Class
class AnimeRepository {
    private initialized: boolean;

    constructor() {
        this.initialized = false;
    }

    private async _initialize(): Promise<void> {
        if (this.initialized) return;
        
        try {
            // Create tables if not exists (for development, schema.sql handles production)
            await postgres.query(`
                CREATE TABLE IF NOT EXISTS anime_favourites (
                    user_id VARCHAR(20) NOT NULL,
                    anime_id INTEGER NOT NULL,
                    anime_title TEXT NOT NULL,
                    source VARCHAR(20) DEFAULT 'anilist',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, anime_id)
                )
            `);
            
            // Add source column if not exists (migration for existing tables)
            await postgres.query(`
                ALTER TABLE anime_favourites 
                ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'anilist'
            `).catch(() => { /* Column might already exist */ });

            await postgres.query(`
                CREATE TABLE IF NOT EXISTS anime_notifications (
                    user_id VARCHAR(20) NOT NULL,
                    anime_id INTEGER NOT NULL,
                    notify BOOLEAN DEFAULT false,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, anime_id)
                )
            `);
            
            this.initialized = true;
        } catch (error: any) {
            logger.error('AnimeRepository', `Failed to initialize: ${error.message}`);
        }
    }

    async getUserFavourites(userId: string): Promise<AnimeFavourite[]> {
        await this._initialize();
        try {
            const rows = await postgres.getMany(
                `SELECT anime_id, anime_title, COALESCE(source, 'anilist') as source FROM anime_favourites WHERE user_id = $1 ORDER BY created_at DESC`,
                [userId]
            ) as unknown as AnimeFavourite[];
            // Map anime_title to title for compatibility
            return (rows || []).map(r => ({
                ...r,
                title: r.anime_title,
                source: r.source || 'anilist'
            }));
        } catch (error: any) {
            logger.error('AnimeRepository', `Error getting user favourites: ${error.message}`);
            return [];
        }
    }

    async isFavourited(userId: string, animeId: number): Promise<boolean> {
        await this._initialize();
        try {
            const row = await postgres.getOne(
                `SELECT 1 FROM anime_favourites WHERE user_id = $1 AND anime_id = $2`,
                [userId, animeId]
            );
            return !!row;
        } catch (error: any) {
            logger.error('AnimeRepository', `Error checking favourite: ${error.message}`);
            return false;
        }
    }

    async isNotifyEnabled(userId: string, animeId: number): Promise<boolean> {
        await this._initialize();
        try {
            const row = await postgres.getOne(
                `SELECT notify FROM anime_notifications WHERE user_id = $1 AND anime_id = $2`,
                [userId, animeId]
            );
            return row?.notify === true;
        } catch (error: any) {
            logger.error('AnimeRepository', `Error checking notify status: ${error.message}`);
            return false;
        }
    }

    async addFavourite(userId: string, animeId: number, animeTitle: string, source: string = 'anilist'): Promise<boolean> {
        await this._initialize();
        try {
            const result = await postgres.query(
                `INSERT INTO anime_favourites (user_id, anime_id, anime_title, source) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (user_id, anime_id) DO UPDATE SET anime_title = EXCLUDED.anime_title, source = EXCLUDED.source`,
                [userId, animeId, animeTitle, source]
            );
            return (result.rowCount ?? 0) > 0;
        } catch (error: any) {
            logger.error('AnimeRepository', `Error adding favourite: ${error.message}`);
            return false;
        }
    }

    async removeFavourite(userId: string, animeId: number): Promise<void> {
        await this._initialize();
        try {
            await postgres.transaction(async (client: any) => {
                await client.query(
                    `DELETE FROM anime_favourites WHERE user_id = $1 AND anime_id = $2`,
                    [userId, animeId]
                );
                await client.query(
                    `DELETE FROM anime_notifications WHERE user_id = $1 AND anime_id = $2`,
                    [userId, animeId]
                );
            });
        } catch (error: any) {
            logger.error('AnimeRepository', `Error removing favourite: ${error.message}`);
        }
    }

    async enableNotify(userId: string, animeId: number): Promise<void> {
        await this._initialize();
        try {
            await postgres.query(
                `INSERT INTO anime_notifications (user_id, anime_id, notify) 
                 VALUES ($1, $2, true) 
                 ON CONFLICT (user_id, anime_id) 
                 DO UPDATE SET notify = true, updated_at = CURRENT_TIMESTAMP`,
                [userId, animeId]
            );
        } catch (error: any) {
            logger.error('AnimeRepository', `Error enabling notify: ${error.message}`);
        }
    }

    async disableNotify(userId: string, animeId: number): Promise<void> {
        await this._initialize();
        try {
            await postgres.query(
                `INSERT INTO anime_notifications (user_id, anime_id, notify) 
                 VALUES ($1, $2, false) 
                 ON CONFLICT (user_id, anime_id) 
                 DO UPDATE SET notify = false, updated_at = CURRENT_TIMESTAMP`,
                [userId, animeId]
            );
        } catch (error: any) {
            logger.error('AnimeRepository', `Error disabling notify: ${error.message}`);
        }
    }

    async getEnabledNotifications(): Promise<AnimeNotification[]> {
        await this._initialize();
        try {
            const rows = await postgres.getMany(
                `SELECT user_id, anime_id FROM anime_notifications WHERE notify = true`
            ) as unknown as AnimeNotification[];
            return rows || [];
        } catch (error: any) {
            logger.error('AnimeRepository', `Error getting enabled notifications: ${error.message}`);
            return [];
        }
    }
}

// Export singleton instance
const animeRepository = new AnimeRepository();

export { animeRepository, AnimeRepository };
export type { AnimeFavourite, AnimeNotification };
export default animeRepository;

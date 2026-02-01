const postgres = require('../../database/postgres');

// Simple logger fallback
const logger = {
    info: (tag, msg) => console.log(`[${tag}] ${msg}`),
    warn: (tag, msg) => console.warn(`[${tag}] ${msg}`),
    error: (tag, msg) => console.error(`[${tag}] ${msg}`)
};

class AnimeRepository {
    constructor() {
        this.initialized = false;
    }

    async _initialize() {
        if (this.initialized) return;
        
        try {
            // Create tables if not exists (for development, schema.sql handles production)
            await postgres.query(`
                CREATE TABLE IF NOT EXISTS anime_favourites (
                    user_id VARCHAR(20) NOT NULL,
                    anime_id INTEGER NOT NULL,
                    anime_title TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, anime_id)
                )
            `);

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
        } catch (error) {
            logger.error('Failed to initialize AnimeRepository:', error);
        }
    }

    async getUserFavourites(userId) {
        await this._initialize();
        try {
            const rows = await postgres.getMany(
                `SELECT anime_id, anime_title FROM anime_favourites WHERE user_id = $1`,
                [userId]
            );
            return rows || [];
        } catch (error) {
            logger.error('Error getting user favourites:', error);
            return [];
        }
    }

    async isFavourited(userId, animeId) {
        await this._initialize();
        try {
            const row = await postgres.getOne(
                `SELECT 1 FROM anime_favourites WHERE user_id = $1 AND anime_id = $2`,
                [userId, animeId]
            );
            return !!row;
        } catch (error) {
            logger.error('Error checking favourite:', error);
            return false;
        }
    }

    async isNotifyEnabled(userId, animeId) {
        await this._initialize();
        try {
            const row = await postgres.getOne(
                `SELECT notify FROM anime_notifications WHERE user_id = $1 AND anime_id = $2`,
                [userId, animeId]
            );
            return row?.notify === true;
        } catch (error) {
            logger.error('Error checking notify status:', error);
            return false;
        }
    }

    async addFavourite(userId, animeId, animeTitle) {
        await this._initialize();
        try {
            const result = await postgres.query(
                `INSERT INTO anime_favourites (user_id, anime_id, anime_title) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (user_id, anime_id) DO NOTHING`,
                [userId, animeId, animeTitle]
            );
            return result.rowCount > 0;
        } catch (error) {
            logger.error('Error adding favourite:', error);
            return false;
        }
    }

    async removeFavourite(userId, animeId) {
        await this._initialize();
        try {
            await postgres.transaction(async (client) => {
                await client.query(
                    `DELETE FROM anime_favourites WHERE user_id = $1 AND anime_id = $2`,
                    [userId, animeId]
                );
                await client.query(
                    `DELETE FROM anime_notifications WHERE user_id = $1 AND anime_id = $2`,
                    [userId, animeId]
                );
            });
        } catch (error) {
            logger.error('Error removing favourite:', error);
        }
    }

    async enableNotify(userId, animeId) {
        await this._initialize();
        try {
            await postgres.query(
                `INSERT INTO anime_notifications (user_id, anime_id, notify) 
                 VALUES ($1, $2, true) 
                 ON CONFLICT (user_id, anime_id) 
                 DO UPDATE SET notify = true, updated_at = CURRENT_TIMESTAMP`,
                [userId, animeId]
            );
        } catch (error) {
            logger.error('Error enabling notify:', error);
        }
    }

    async disableNotify(userId, animeId) {
        await this._initialize();
        try {
            await postgres.query(
                `INSERT INTO anime_notifications (user_id, anime_id, notify) 
                 VALUES ($1, $2, false) 
                 ON CONFLICT (user_id, anime_id) 
                 DO UPDATE SET notify = false, updated_at = CURRENT_TIMESTAMP`,
                [userId, animeId]
            );
        } catch (error) {
            logger.error('Error disabling notify:', error);
        }
    }

    async getEnabledNotifications() {
        await this._initialize();
        try {
            const rows = await postgres.getMany(
                `SELECT user_id, anime_id FROM anime_notifications WHERE notify = true`
            );
            return rows || [];
        } catch (error) {
            logger.error('Error getting enabled notifications:', error);
            return [];
        }
    }
}

module.exports = new AnimeRepository();

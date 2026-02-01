/**
 * NHentai Repository
 * Database operations for nhentai favourites
 */

const postgres = require('../../database/postgres');

// Simple logger fallback
const logger = {
    info: (tag, msg) => console.log(`[${tag}] ${msg}`),
    warn: (tag, msg) => console.warn(`[${tag}] ${msg}`),
    error: (tag, msg) => console.error(`[${tag}] ${msg}`)
};

class NHentaiRepository {
    constructor() {
        this.initialized = false;
    }

    async _initialize() {
        if (this.initialized) return;
        
        try {
            // Create tables if not exists
            await postgres.query(`
                CREATE TABLE IF NOT EXISTS nhentai_favourites (
                    user_id VARCHAR(20) NOT NULL,
                    gallery_id INTEGER NOT NULL,
                    gallery_title TEXT NOT NULL,
                    num_pages INTEGER DEFAULT 0,
                    tags TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, gallery_id)
                )
            `);

            // Create index for faster lookups
            await postgres.query(`
                CREATE INDEX IF NOT EXISTS idx_nhentai_favourites_user 
                ON nhentai_favourites(user_id)
            `);
            
            this.initialized = true;
            logger.info('NHentaiRepository', 'Initialized successfully');
        } catch (error) {
            logger.error('NHentaiRepository', `Failed to initialize: ${error.message}`);
        }
    }

    /**
     * Get all favourites for a user
     */
    async getUserFavourites(userId, limit = 25, offset = 0) {
        await this._initialize();
        try {
            const rows = await postgres.getMany(
                `SELECT gallery_id, gallery_title, num_pages, tags, created_at 
                 FROM nhentai_favourites 
                 WHERE user_id = $1 
                 ORDER BY created_at DESC
                 LIMIT $2 OFFSET $3`,
                [userId, limit, offset]
            );
            return rows || [];
        } catch (error) {
            logger.error('NHentaiRepository', `Error getting user favourites: ${error.message}`);
            return [];
        }
    }

    /**
     * Get total count of user favourites
     */
    async getFavouritesCount(userId) {
        await this._initialize();
        try {
            const row = await postgres.getOne(
                `SELECT COUNT(*) as count FROM nhentai_favourites WHERE user_id = $1`,
                [userId]
            );
            return parseInt(row?.count || 0);
        } catch (error) {
            logger.error('NHentaiRepository', `Error getting favourites count: ${error.message}`);
            return 0;
        }
    }

    /**
     * Check if a gallery is favourited by user
     */
    async isFavourited(userId, galleryId) {
        await this._initialize();
        try {
            const row = await postgres.getOne(
                `SELECT 1 FROM nhentai_favourites WHERE user_id = $1 AND gallery_id = $2`,
                [userId, galleryId]
            );
            return !!row;
        } catch (error) {
            logger.error('NHentaiRepository', `Error checking favourite: ${error.message}`);
            return false;
        }
    }

    /**
     * Add a gallery to favourites
     */
    async addFavourite(userId, gallery) {
        await this._initialize();
        try {
            const title = gallery.title?.english || gallery.title?.japanese || gallery.title?.pretty || 'Unknown';
            const tags = this._extractTagsString(gallery.tags);
            
            const result = await postgres.query(
                `INSERT INTO nhentai_favourites (user_id, gallery_id, gallery_title, num_pages, tags) 
                 VALUES ($1, $2, $3, $4, $5) 
                 ON CONFLICT (user_id, gallery_id) DO NOTHING`,
                [userId, gallery.id, title, gallery.num_pages || 0, tags]
            );
            return result.rowCount > 0;
        } catch (error) {
            logger.error('NHentaiRepository', `Error adding favourite: ${error.message}`);
            return false;
        }
    }

    /**
     * Remove a gallery from favourites
     */
    async removeFavourite(userId, galleryId) {
        await this._initialize();
        try {
            const result = await postgres.query(
                `DELETE FROM nhentai_favourites WHERE user_id = $1 AND gallery_id = $2`,
                [userId, galleryId]
            );
            return result.rowCount > 0;
        } catch (error) {
            logger.error('NHentaiRepository', `Error removing favourite: ${error.message}`);
            return false;
        }
    }

    /**
     * Toggle favourite status
     */
    async toggleFavourite(userId, gallery) {
        const isFav = await this.isFavourited(userId, gallery.id);
        if (isFav) {
            await this.removeFavourite(userId, gallery.id);
            return { added: false, removed: true };
        } else {
            await this.addFavourite(userId, gallery);
            return { added: true, removed: false };
        }
    }

    /**
     * Search favourites by title
     */
    async searchFavourites(userId, query, limit = 10) {
        await this._initialize();
        try {
            const rows = await postgres.getMany(
                `SELECT gallery_id, gallery_title, num_pages, tags, created_at 
                 FROM nhentai_favourites 
                 WHERE user_id = $1 AND (gallery_title ILIKE $2 OR tags ILIKE $2)
                 ORDER BY created_at DESC
                 LIMIT $3`,
                [userId, `%${query}%`, limit]
            );
            return rows || [];
        } catch (error) {
            logger.error('NHentaiRepository', `Error searching favourites: ${error.message}`);
            return [];
        }
    }

    /**
     * Extract tags as comma-separated string for storage
     */
    _extractTagsString(tags) {
        if (!tags || !Array.isArray(tags)) return '';
        return tags
            .filter(t => t.type === 'tag')
            .map(t => t.name)
            .slice(0, 20)
            .join(', ');
    }
}

module.exports = new NHentaiRepository();

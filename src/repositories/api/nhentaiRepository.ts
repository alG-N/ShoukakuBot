/**
 * NHentai Repository
 * Database operations for nhentai favourites
 */

import postgres from '../../database/postgres.js';
import logger from '../../core/Logger.js';
// Interfaces
interface NHentaiGallery {
    id: number;
    title?: {
        english?: string;
        japanese?: string;
        pretty?: string;
    };
    num_pages?: number;
    tags?: NHentaiTag[];
}

interface NHentaiTag {
    id?: number;
    type: string;
    name: string;
    url?: string;
    count?: number;
}

interface NHentaiFavourite {
    gallery_id: number;
    gallery_title: string;
    num_pages: number;
    tags: string;
    created_at?: Date;
}

interface ToggleFavouriteResult {
    added: boolean;
    removed: boolean;
}


// NHentaiRepository Class
class NHentaiRepository {
    private initialized: boolean;

    constructor() {
        this.initialized = false;
    }

    private async _initialize(): Promise<void> {
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
        } catch (error: any) {
            logger.error('NHentaiRepository', `Failed to initialize: ${error.message}`);
        }
    }

    /**
     * Get all favourites for a user
     */
    async getUserFavourites(userId: string, limit: number = 25, offset: number = 0): Promise<NHentaiFavourite[]> {
        await this._initialize();
        try {
            const rows = await postgres.getMany(
                `SELECT gallery_id, gallery_title, num_pages, tags, created_at 
                 FROM nhentai_favourites 
                 WHERE user_id = $1 
                 ORDER BY created_at DESC
                 LIMIT $2 OFFSET $3`,
                [userId, limit, offset]
            ) as unknown as NHentaiFavourite[];
            return rows || [];
        } catch (error: any) {
            logger.error('NHentaiRepository', `Error getting user favourites: ${error.message}`);
            return [];
        }
    }

    /**
     * Get total count of user favourites
     */
    async getFavouritesCount(userId: string): Promise<number> {
        await this._initialize();
        try {
            const row = await postgres.getOne(
                `SELECT COUNT(*) as count FROM nhentai_favourites WHERE user_id = $1`,
                [userId]
            );
            return parseInt(String(row?.count ?? '0'));
        } catch (error: any) {
            logger.error('NHentaiRepository', `Error getting favourites count: ${error.message}`);
            return 0;
        }
    }

    /**
     * Check if a gallery is favourited by user
     */
    async isFavourited(userId: string, galleryId: number): Promise<boolean> {
        await this._initialize();
        try {
            const row = await postgres.getOne(
                `SELECT 1 FROM nhentai_favourites WHERE user_id = $1 AND gallery_id = $2`,
                [userId, galleryId]
            );
            return !!row;
        } catch (error: any) {
            logger.error('NHentaiRepository', `Error checking favourite: ${error.message}`);
            return false;
        }
    }

    /**
     * Add a gallery to favourites
     */
    async addFavourite(userId: string, gallery: NHentaiGallery): Promise<boolean> {
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
            return (result.rowCount ?? 0) > 0;
        } catch (error: any) {
            logger.error('NHentaiRepository', `Error adding favourite: ${error.message}`);
            return false;
        }
    }

    /**
     * Remove a gallery from favourites
     */
    async removeFavourite(userId: string, galleryId: number): Promise<boolean> {
        await this._initialize();
        try {
            const result = await postgres.query(
                `DELETE FROM nhentai_favourites WHERE user_id = $1 AND gallery_id = $2`,
                [userId, galleryId]
            );
            return (result.rowCount ?? 0) > 0;
        } catch (error: any) {
            logger.error('NHentaiRepository', `Error removing favourite: ${error.message}`);
            return false;
        }
    }

    /**
     * Toggle favourite status
     */
    async toggleFavourite(userId: string, gallery: NHentaiGallery): Promise<ToggleFavouriteResult> {
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
     * @param userId - User ID
     * @param query - Search query
     * @param limit - Max results
     * @returns Matching favourites
     */
    async searchFavourites(userId: string, query: string, limit: number = 10): Promise<NHentaiFavourite[]> {
        await this._initialize();
        try {
            // Escape special LIKE pattern characters to prevent pattern injection
            const escapedQuery = query
                .replace(/\\/g, '\\\\')  // Escape backslashes first
                .replace(/%/g, '\\%')      // Escape percent
                .replace(/_/g, '\\_');     // Escape underscore
            
            const rows = await postgres.getMany(
                `SELECT gallery_id, gallery_title, num_pages, tags, created_at 
                 FROM nhentai_favourites 
                 WHERE user_id = $1 AND (gallery_title ILIKE $2 OR tags ILIKE $2)
                 ORDER BY created_at DESC
                 LIMIT $3`,
                [userId, `%${escapedQuery}%`, limit]
            ) as unknown as NHentaiFavourite[];
            return rows || [];
        } catch (error: any) {
            logger.error('NHentaiRepository', `Error searching favourites: ${error.message}`);
            return [];
        }
    }

    /**
     * Extract tags as comma-separated string for storage
     */
    private _extractTagsString(tags?: NHentaiTag[]): string {
        if (!tags || !Array.isArray(tags)) return '';
        return tags
            .filter(t => t.type === 'tag')
            .map(t => t.name)
            .slice(0, 20)
            .join(', ');
    }
}

// Export singleton instance
const nhentaiRepository = new NHentaiRepository();

export { nhentaiRepository, NHentaiRepository };
export type { NHentaiGallery, NHentaiTag, NHentaiFavourite, ToggleFavouriteResult };
export default nhentaiRepository;

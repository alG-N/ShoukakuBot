import type { ALLOWED_TABLES } from '../../database/postgres.js';

export type AllowedTable = typeof ALLOWED_TABLES[number];

export interface PgError extends Error {
    code?: string;
}

/**
 * Database Module
 * Re-exports from PostgreSQL infrastructure layer
 * @module database
 */

import postgres, { initializeDatabase, isDatabaseReady } from './postgres.js';

// RE-EXPORTS FROM POSTGRES
export * from './postgres.js';

// DIRECT MODULE ACCESS
export { postgres };

// Convenience exports - proxy to postgres instance methods
export const query = postgres.query.bind(postgres);
export const getOne = postgres.getOne.bind(postgres);
export const getMany = postgres.getMany.bind(postgres);
export const insert = postgres.insert.bind(postgres);
export const update = postgres.update.bind(postgres);
export const upsert = postgres.upsert.bind(postgres);
export const transaction = postgres.transaction.bind(postgres);
export const close = postgres.close.bind(postgres);
export const healthCheck = postgres.healthCheck.bind(postgres);

// Aliases for backward compatibility
export const initialize = initializeDatabase;
export const isReady = isDatabaseReady;
export const deleteRows = postgres.delete.bind(postgres);

// DEFAULT EXPORT
export default postgres;


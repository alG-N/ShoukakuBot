/**
 * Database Module
 * Re-exports from infrastructure layer for backward compatibility
 * @module database
 */

const adminDb = require('./admin');
const postgres = require('./postgres');

// Try to use new infrastructure layer
let infrastructure;
try {
    infrastructure = require('../infrastructure');
} catch (e) {
    infrastructure = null;
}

module.exports = {
    // Main exports
    ...adminDb,
    
    // Direct postgres access for advanced queries
    postgres,
    
    // Initialize alias
    initialize: adminDb.initializeDatabase,
    
    // New infrastructure layer (if available)
    ...(infrastructure || {}),
    
    // Convenience method to use new or old
    query: infrastructure?.query || postgres.query?.bind(postgres)
};

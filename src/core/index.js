/**
 * Core Module
 * Central exports for core infrastructure
 * @module core
 */

const { createClient, setPresence, getClientStats, ActivityType, CLIENT_OPTIONS } = require('./Client');
const logger = require('./Logger');
const { Logger, LOG_CHANNEL_ID, LOG_LEVELS } = require('./Logger');
const { bootstrap, healthCheck: bootstrapHealthCheck, BOOTSTRAP_CONFIG } = require('./bootstrap');
const { 
    registerShutdownHandler, 
    handleShutdown, 
    initializeShutdownHandlers,
    isShuttingDown 
} = require('./shutdown');
const { initializeErrorHandlers } = require('./errorHandler');
const sentry = require('./sentry');
const health = require('./health');

module.exports = {
    // Client
    createClient,
    setPresence,
    getClientStats,
    ActivityType,
    CLIENT_OPTIONS,
    
    // Logger
    logger,
    Logger,
    LOG_CHANNEL_ID,
    LOG_LEVELS,
    
    // Bootstrap
    bootstrap,
    bootstrapHealthCheck,
    BOOTSTRAP_CONFIG,
    
    // Shutdown
    registerShutdownHandler,
    handleShutdown,
    initializeShutdownHandlers,
    isShuttingDown,
    
    // Error Handler
    initializeErrorHandlers,
    
    // Sentry Error Tracking
    sentry,
    
    // Health Check
    health
};

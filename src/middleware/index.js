/**
 * Middleware Module
 * Centralized access control, validation, and restrictions
 * @module middleware
 */

// Access control and rate limiting
const access = require('./access');

// Voice channel checks
const voiceChannelCheck = require('./voiceChannelCheck');

// URL validation
const urlValidator = require('./urlValidator');

module.exports = {
    // ============================================
    // Access Control (from access.js)
    // ============================================
    AccessType: access.AccessType,
    RateLimiter: access.RateLimiter,
    validators: access.validators,
    checkMaintenance: access.checkMaintenance,
    checkNSFW: access.checkNSFW,
    createErrorEmbed: access.createErrorEmbed,
    createWarningEmbed: access.createWarningEmbed,
    createSuccessEmbed: access.createSuccessEmbed,
    createCooldownEmbed: access.createCooldownEmbed,
    
    // ============================================
    // Voice Channel Checks
    // ============================================
    ...voiceChannelCheck,
    
    // ============================================
    // URL Validation
    // ============================================
    ...urlValidator
};

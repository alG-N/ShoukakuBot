/**
 * Admin Commands - Presentation Layer
 * @module commands/admin
 */

const kick = require('./kick');
const ban = require('./ban');
const mute = require('./mute');
const deleteCmd = require('./delete');
const snipe = require('./snipe');
const setting = require('./setting');

// Warning system
const warn = require('./warn');
const warnings = require('./warnings');
const clearwarns = require('./clearwarns');
const delwarn = require('./delwarn');
const caseCmd = require('./case');

// Auto-mod system (filter integrated)
const automod = require('./automod');

// Lockdown & Raid protection
const lockdown = require('./lockdown');
const slowmode = require('./slowmode');
const raid = require('./raid');

module.exports = {
    kick,
    ban,
    mute,
    delete: deleteCmd,
    snipe,
    setting,
    
    // Warning system
    warn,
    warnings,
    clearwarns,
    delwarn,
    case: caseCmd,
    
    // Auto-mod system
    automod,
    
    // Lockdown & Raid protection
    lockdown,
    slowmode,
    raid
};




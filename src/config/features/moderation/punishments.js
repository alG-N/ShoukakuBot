/**
 * Punishment Configuration
 * Warning thresholds, escalation rules, and punishment defaults
 * @module config/features/moderation/punishments
 */

module.exports = {
    // ==========================================
    // WARNING SYSTEM
    // ==========================================
    warnings: {
        // Default expiry for warnings (0 = never expire)
        defaultExpiryDays: 30,
        
        // Maximum active warnings before auto-action
        maxActive: 10,
        
        // Show warning count in DM
        showCountInDM: true,
        
        // Send DM to user when warned
        sendDM: true
    },
    
    // ==========================================
    // WARNING THRESHOLDS (Escalation)
    // These are DEFAULT values, each guild can customize
    // ==========================================
    defaultThresholds: [
        {
            warnCount: 3,
            action: 'mute',
            durationMs: 60 * 60 * 1000,    // 1 hour mute
            reason: 'Automatic mute: 3 warnings reached'
        },
        {
            warnCount: 5,
            action: 'kick',
            reason: 'Automatic kick: 5 warnings reached'
        },
        {
            warnCount: 7,
            action: 'ban',
            reason: 'Automatic ban: 7 warnings reached'
        }
    ],
    
    // ==========================================
    // MUTE SETTINGS
    // ==========================================
    mute: {
        // Default duration if not specified
        defaultDurationMs: 5 * 60 * 1000,    // 5 minutes
        
        // Maximum mute duration (Discord limit is 28 days)
        maxDurationMs: 27 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000,  // 27d 23h (safe margin)
        
        // Minimum mute duration
        minDurationMs: 60 * 1000,            // 1 minute
        
        // Duration presets for quick selection
        presets: {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '10m': 10 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '2h': 2 * 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '12h': 12 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '3d': 3 * 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '14d': 14 * 24 * 60 * 60 * 1000,
            '28d': 28 * 24 * 60 * 60 * 1000
        },
        
        // Send DM to user
        sendDM: true
    },
    
    // ==========================================
    // KICK SETTINGS
    // ==========================================
    kick: {
        // Send DM before kick
        sendDM: true,
        
        // Include invite link to rejoin (optional)
        includeInvite: false
    },
    
    // ==========================================
    // BAN SETTINGS
    // ==========================================
    ban: {
        // Default message delete days (0-7)
        defaultDeleteDays: 1,
        
        // Maximum delete days
        maxDeleteDays: 7,
        
        // Send DM before ban
        sendDM: true,
        
        // Include appeal info in DM
        includeAppealInfo: false,
        appealMessage: null
    },
    
    // ==========================================
    // SOFTBAN SETTINGS (ban + immediate unban to delete messages)
    // ==========================================
    softban: {
        // Message delete days
        deleteDays: 7,
        
        // Send DM
        sendDM: true
    },
    
    // ==========================================
    // DEFAULT REASONS
    // ==========================================
    defaultReasons: {
        warn: 'No reason provided',
        mute: 'No reason provided',
        kick: 'No reason provided',
        ban: 'No reason provided',
        unmute: 'Unmuted by moderator',
        unban: 'Unbanned by moderator'
    },
    
    // ==========================================
    // AUTO-MOD PUNISHMENT SETTINGS
    // ==========================================
    automod: {
        // Warn reason prefix for auto-mod
        warnReasonPrefix: '[Auto-Mod]',
        
        // Track auto-mod warns separately
        trackSeparately: true,
        
        // Auto-mod warn count before mute
        warnsBeforeMute: 3,
        muteDurationMs: 10 * 60 * 1000,  // 10 minutes
        
        // Escalation for repeated auto-mod violations
        escalation: {
            enabled: true,
            // Multiplier for mute duration on repeat offenses
            durationMultiplier: 2,
            // Max mute duration from escalation
            maxDurationMs: 24 * 60 * 60 * 1000,  // 24 hours
            // Reset escalation after this period of no violations
            resetAfterMs: 24 * 60 * 60 * 1000    // 24 hours
        }
    },
    
    // ==========================================
    // DM TEMPLATES
    // ==========================================
    dmTemplates: {
        warn: {
            title: '⚠️ You have been warned',
            description: 'You have received a warning in **{guild}**',
            fields: [
                { name: 'Reason', value: '{reason}' },
                { name: 'Warning Count', value: '{count} active warning(s)' },
                { name: 'Moderator', value: '{moderator}' }
            ],
            footer: 'Please follow the server rules to avoid further action.'
        },
        mute: {
            title: '🔇 You have been muted',
            description: 'You have been muted in **{guild}**',
            fields: [
                { name: 'Duration', value: '{duration}' },
                { name: 'Reason', value: '{reason}' },
                { name: 'Moderator', value: '{moderator}' }
            ]
        },
        kick: {
            title: '👢 You have been kicked',
            description: 'You have been kicked from **{guild}**',
            fields: [
                { name: 'Reason', value: '{reason}' },
                { name: 'Moderator', value: '{moderator}' }
            ]
        },
        ban: {
            title: '🔨 You have been banned',
            description: 'You have been banned from **{guild}**',
            fields: [
                { name: 'Reason', value: '{reason}' },
                { name: 'Moderator', value: '{moderator}' }
            ]
        }
    }
};

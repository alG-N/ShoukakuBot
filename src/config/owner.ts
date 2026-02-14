/**
 * Owner Configuration
 * Settings for bot owners and administrators
 * @module config/owner
 */

// Owner IDs with full bot access (from environment or defaults)
export const OWNER_IDS: string[] = process.env.OWNER_IDS 
    ? process.env.OWNER_IDS.split(',').map(id => id.trim()).filter(Boolean)
    : [
        '1128296349566251068',  // Primary Owner (fallback)
    ];

// Primary Owner ID (first in the list)
export const PRIMARY_OWNER_ID = OWNER_IDS[0] || '1128296349566251068';

// Logging Channels (from environment or defaults)
export const GUILD_LOG_CHANNEL_ID = process.env.GUILD_LOG_CHANNEL_ID || '';
export const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID || '';
export const SYSTEM_LOG_CHANNEL_ID = process.env.SYSTEM_LOG_CHANNEL_ID || '';

// Support Server
export const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID || '';

// Guild Feature Display Map
export const GUILD_FEATURES_MAP: Record<string, string> = {
    'ANIMATED_ICON': '🎬 Animated Icon',
    'BANNER': '🖼️ Banner',
    'COMMERCE': '🛒 Commerce',
    'COMMUNITY': '🏘️ Community',
    'DISCOVERABLE': '🔍 Discoverable',
    'FEATURABLE': '⭐ Featurable',
    'INVITE_SPLASH': '💦 Invite Splash',
    'MEMBER_VERIFICATION_GATE_ENABLED': '✅ Verification Gate',
    'NEWS': '📰 News Channels',
    'PARTNERED': '🤝 Partnered',
    'PREVIEW_ENABLED': '👁️ Preview',
    'VANITY_URL': '🔗 Vanity URL',
    'VERIFIED': '✅ Verified',
    'VIP_REGIONS': '🌐 VIP Regions',
    'WELCOME_SCREEN_ENABLED': '👋 Welcome Screen'
};

// Server Boost Tiers
export const BOOST_TIERS = {
    emojis: ['⚪', '🥉', '🥈', '🥇', '💎'],
    names: ['None', 'Tier 1', 'Tier 2', 'Tier 3']
};

// Helper Functions
export function isOwner(userId: string): boolean {
    return OWNER_IDS.includes(userId);
}

export function isValidUserId(userId: string): boolean {
    return /^\d{17,19}$/.test(userId);
}

export default {
    OWNER_IDS,
    PRIMARY_OWNER_ID,
    GUILD_LOG_CHANNEL_ID,
    REPORT_CHANNEL_ID,
    SYSTEM_LOG_CHANNEL_ID,
    SUPPORT_GUILD_ID,
    GUILD_FEATURES_MAP,
    BOOST_TIERS,
    isOwner,
    isValidUserId
};

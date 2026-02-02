-- ============================================================================
-- MODERATION SYSTEM SCHEMA
-- Full server moderation: warnings, auto-mod, filters, raid protection
-- ============================================================================

-- 1. Mod Infractions/Cases Table
-- Tracks all moderation actions (warns, mutes, kicks, bans, auto-mod triggers)
CREATE TABLE IF NOT EXISTS mod_infractions (
    id SERIAL PRIMARY KEY,
    case_id INT NOT NULL,                      -- Per-guild case number
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    moderator_id VARCHAR(32) NOT NULL,
    type VARCHAR(20) NOT NULL,                 -- warn, mute, kick, ban, unmute, unban, filter, automod
    reason TEXT,
    duration_ms BIGINT,                        -- For timed punishments (mute)
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,                      -- For warns that expire
    active BOOLEAN DEFAULT true,               -- Can be deactivated without deletion
    reference_id INT,                          -- Reference to related case (e.g., unban references ban)
    metadata JSONB DEFAULT '{}'::jsonb,        -- Extra data (auto-mod details, etc.)
    
    CONSTRAINT unique_guild_case UNIQUE(guild_id, case_id)
);

-- 2. Auto-mod Settings Per Guild
CREATE TABLE IF NOT EXISTS automod_settings (
    guild_id VARCHAR(32) PRIMARY KEY,
    enabled BOOLEAN DEFAULT false,
    
    -- Spam protection
    spam_enabled BOOLEAN DEFAULT false,
    spam_threshold INT DEFAULT 5,              -- Messages in window
    spam_window_ms INT DEFAULT 5000,           -- Time window (5 seconds)
    spam_action VARCHAR(20) DEFAULT 'delete_warn',
    spam_mute_duration_ms BIGINT DEFAULT 300000, -- 5 minutes
    
    -- Duplicate message detection
    duplicate_enabled BOOLEAN DEFAULT false,
    duplicate_threshold INT DEFAULT 3,         -- Same message count
    duplicate_window_ms INT DEFAULT 30000,     -- 30 seconds
    duplicate_action VARCHAR(20) DEFAULT 'delete_warn',
    
    -- Link filter
    links_enabled BOOLEAN DEFAULT false,
    links_whitelist TEXT[] DEFAULT '{}',
    links_action VARCHAR(20) DEFAULT 'delete_warn',
    
    -- Mention spam
    mention_enabled BOOLEAN DEFAULT false,
    mention_limit INT DEFAULT 5,               -- Max mentions per message
    mention_action VARCHAR(20) DEFAULT 'delete_warn',
    
    -- Caps spam
    caps_enabled BOOLEAN DEFAULT false,
    caps_percent INT DEFAULT 70,               -- % of message in caps
    caps_min_length INT DEFAULT 10,            -- Minimum message length to check
    caps_action VARCHAR(20) DEFAULT 'delete',
    
    -- Discord invite filter
    invites_enabled BOOLEAN DEFAULT false,
    invites_whitelist TEXT[] DEFAULT '{}',     -- Allowed server IDs
    invites_action VARCHAR(20) DEFAULT 'delete_warn',
    
    -- New account filter
    new_account_enabled BOOLEAN DEFAULT false,
    new_account_age_hours INT DEFAULT 24,      -- Account must be older than X hours
    new_account_action VARCHAR(20) DEFAULT 'kick',
    
    -- Raid protection
    raid_enabled BOOLEAN DEFAULT false,
    raid_join_threshold INT DEFAULT 10,        -- Joins in window
    raid_window_ms INT DEFAULT 10000,          -- 10 seconds
    raid_action VARCHAR(20) DEFAULT 'lockdown',
    raid_auto_unlock_ms BIGINT DEFAULT 300000, -- Auto unlock after 5 minutes
    
    -- Channels/Roles to ignore
    ignored_channels TEXT[] DEFAULT '{}',
    ignored_roles TEXT[] DEFAULT '{}',
    
    -- Log channel for auto-mod actions
    log_channel_id VARCHAR(32),
    
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Bad Word Filters Per Guild
CREATE TABLE IF NOT EXISTS word_filters (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    pattern VARCHAR(200) NOT NULL,             -- Word or regex pattern
    match_type VARCHAR(20) DEFAULT 'contains', -- exact, contains, word, regex
    action VARCHAR(20) DEFAULT 'delete_warn',  -- delete, delete_warn, warn, mute, kick
    severity INT DEFAULT 1,                    -- 1-5 severity level
    created_by VARCHAR(32),
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_guild_pattern UNIQUE(guild_id, pattern)
);

-- 4. Mod Log Settings
CREATE TABLE IF NOT EXISTS mod_log_settings (
    guild_id VARCHAR(32) PRIMARY KEY,
    log_channel_id VARCHAR(32),
    
    -- What to log
    log_warns BOOLEAN DEFAULT true,
    log_mutes BOOLEAN DEFAULT true,
    log_kicks BOOLEAN DEFAULT true,
    log_bans BOOLEAN DEFAULT true,
    log_unbans BOOLEAN DEFAULT true,
    log_automod BOOLEAN DEFAULT true,
    log_filters BOOLEAN DEFAULT true,
    log_message_deletes BOOLEAN DEFAULT false,
    log_message_edits BOOLEAN DEFAULT false,
    log_member_joins BOOLEAN DEFAULT false,
    log_member_leaves BOOLEAN DEFAULT false,
    log_role_changes BOOLEAN DEFAULT false,
    log_nickname_changes BOOLEAN DEFAULT false,
    
    -- Format settings
    use_embeds BOOLEAN DEFAULT true,
    include_moderator BOOLEAN DEFAULT true,
    include_reason BOOLEAN DEFAULT true,
    
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. Warning Thresholds (Escalation Rules)
CREATE TABLE IF NOT EXISTS warn_thresholds (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    warn_count INT NOT NULL,                   -- Number of warns to trigger
    action VARCHAR(20) NOT NULL,               -- mute, kick, ban
    duration_ms BIGINT,                        -- For mute action
    reason TEXT DEFAULT 'Automatic action due to warning threshold',
    
    CONSTRAINT unique_guild_threshold UNIQUE(guild_id, warn_count)
);

-- 6. Raid Mode State
CREATE TABLE IF NOT EXISTS raid_mode (
    guild_id VARCHAR(32) PRIMARY KEY,
    active BOOLEAN DEFAULT false,
    activated_at TIMESTAMP,
    activated_by VARCHAR(32),                  -- 'auto' or moderator ID
    auto_unlock_at TIMESTAMP,
    locked_channels TEXT[] DEFAULT '{}',
    
    -- Join tracking for detection
    recent_joins JSONB DEFAULT '[]'::jsonb
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Infractions indexes
CREATE INDEX IF NOT EXISTS idx_infractions_guild ON mod_infractions(guild_id);
CREATE INDEX IF NOT EXISTS idx_infractions_user ON mod_infractions(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_infractions_active ON mod_infractions(guild_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_infractions_type ON mod_infractions(guild_id, type);
CREATE INDEX IF NOT EXISTS idx_infractions_created ON mod_infractions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_infractions_expires ON mod_infractions(expires_at) WHERE expires_at IS NOT NULL;

-- Word filters indexes
CREATE INDEX IF NOT EXISTS idx_filters_guild ON word_filters(guild_id);
CREATE INDEX IF NOT EXISTS idx_filters_severity ON word_filters(guild_id, severity);

-- ============================================================================
-- DEFAULT DATA
-- ============================================================================

-- Default warning thresholds template (will be copied when guild enables)
-- 3 warns = 1 hour mute
-- 5 warns = kick
-- 7 warns = ban
-- These are just defaults, each guild can customize

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get next case ID for a guild
CREATE OR REPLACE FUNCTION get_next_case_id(p_guild_id VARCHAR(32))
RETURNS INT AS $$
DECLARE
    next_id INT;
BEGIN
    SELECT COALESCE(MAX(case_id), 0) + 1 INTO next_id
    FROM mod_infractions
    WHERE guild_id = p_guild_id;
    RETURN next_id;
END;
$$ LANGUAGE plpgsql;

-- Function to count active warns for a user
CREATE OR REPLACE FUNCTION count_active_warns(p_guild_id VARCHAR(32), p_user_id VARCHAR(32))
RETURNS INT AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM mod_infractions
        WHERE guild_id = p_guild_id
          AND user_id = p_user_id
          AND type = 'warn'
          AND active = true
          AND (expires_at IS NULL OR expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_moderation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers
DROP TRIGGER IF EXISTS automod_timestamp ON automod_settings;
CREATE TRIGGER automod_timestamp
    BEFORE UPDATE ON automod_settings
    FOR EACH ROW EXECUTE FUNCTION update_moderation_timestamp();

DROP TRIGGER IF EXISTS modlog_timestamp ON mod_log_settings;
CREATE TRIGGER modlog_timestamp
    BEFORE UPDATE ON mod_log_settings
    FOR EACH ROW EXECUTE FUNCTION update_moderation_timestamp();

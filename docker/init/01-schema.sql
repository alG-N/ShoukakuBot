-- alterGolden PostgreSQL Database Schema
-- This script runs automatically when the PostgreSQL container starts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- UPDATE TIMESTAMP FUNCTION (must be first!)
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- GUILD SETTINGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id VARCHAR(20) PRIMARY KEY,
    prefix VARCHAR(10) DEFAULT '!',
    language VARCHAR(10) DEFAULT 'en',
    welcome_channel VARCHAR(20),
    welcome_message TEXT,
    log_channel VARCHAR(20),
    mod_log_channel VARCHAR(20),
    music_channel VARCHAR(20),
    dj_role VARCHAR(20),
    mute_role VARCHAR(20),
    auto_role VARCHAR(20),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_guild_settings_timestamp
    BEFORE UPDATE ON guild_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- AUTOMOD SETTINGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS automod_settings (
    guild_id VARCHAR(20) PRIMARY KEY,
    enabled BOOLEAN DEFAULT false,
    
    -- Filter/Bad Words
    filter_enabled BOOLEAN DEFAULT false,
    filtered_words TEXT[] DEFAULT '{}',
    
    -- Spam Protection
    spam_enabled BOOLEAN DEFAULT false,
    spam_threshold INTEGER DEFAULT 5,
    spam_interval INTEGER DEFAULT 5000,
    spam_window_ms INTEGER DEFAULT 5000,
    spam_action VARCHAR(20) DEFAULT 'warn',
    spam_mute_duration_ms INTEGER DEFAULT 300000,
    
    -- Duplicate Messages
    duplicate_enabled BOOLEAN DEFAULT false,
    duplicate_threshold INTEGER DEFAULT 3,
    duplicate_window_ms INTEGER DEFAULT 60000,
    duplicate_action VARCHAR(20) DEFAULT 'warn',
    
    -- Links Protection
    links_enabled BOOLEAN DEFAULT false,
    links_whitelist TEXT[] DEFAULT '{}',
    links_action VARCHAR(20) DEFAULT 'delete',
    
    -- Mention Spam
    mention_enabled BOOLEAN DEFAULT false,
    mention_limit INTEGER DEFAULT 5,
    mention_action VARCHAR(20) DEFAULT 'warn',
    
    -- Caps Lock
    caps_enabled BOOLEAN DEFAULT false,
    caps_percent INTEGER DEFAULT 70,
    caps_percentage INTEGER DEFAULT 70,
    caps_min_length INTEGER DEFAULT 10,
    caps_action VARCHAR(20) DEFAULT 'warn',
    
    -- Discord Invites
    invites_enabled BOOLEAN DEFAULT false,
    invites_whitelist TEXT[] DEFAULT '{}',
    invites_action VARCHAR(20) DEFAULT 'delete',
    
    -- New Account Protection
    new_account_enabled BOOLEAN DEFAULT false,
    new_account_age_hours INTEGER DEFAULT 24,
    new_account_action VARCHAR(20) DEFAULT 'kick',
    
    -- Raid Protection
    raid_enabled BOOLEAN DEFAULT false,
    raid_join_threshold INTEGER DEFAULT 10,
    raid_window_ms INTEGER DEFAULT 10000,
    raid_action VARCHAR(20) DEFAULT 'kick',
    raid_auto_unlock_ms INTEGER DEFAULT 300000,
    
    -- Ignored Channels/Roles
    ignored_channels TEXT[] DEFAULT '{}',
    ignored_roles TEXT[] DEFAULT '{}',
    log_channel_id VARCHAR(20),
    
    -- Warn Settings
    auto_warn BOOLEAN DEFAULT false,
    mute_duration INTEGER DEFAULT 300000,
    default_action VARCHAR(20) DEFAULT 'warn',
    warn_threshold INTEGER DEFAULT 3,
    warn_action VARCHAR(20) DEFAULT 'mute',
    warn_reset_hours INTEGER DEFAULT 24,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_automod_settings_timestamp
    BEFORE UPDATE ON automod_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- MODERATION LOGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS moderation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    moderator_id VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL,
    reason TEXT,
    duration INTEGER,
    expires_at TIMESTAMP WITH TIME ZONE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mod_logs_guild ON moderation_logs(guild_id);
CREATE INDEX idx_mod_logs_user ON moderation_logs(user_id);
CREATE INDEX idx_mod_logs_active ON moderation_logs(guild_id, active) WHERE active = true;

-- ==========================================
-- USER DATA TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS user_data (
    user_id VARCHAR(20) PRIMARY KEY,
    username VARCHAR(100),
    global_xp INTEGER DEFAULT 0,
    global_level INTEGER DEFAULT 1,
    coins BIGINT DEFAULT 0,
    premium_until TIMESTAMP WITH TIME ZONE,
    settings JSONB DEFAULT '{}',
    badges JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_user_data_timestamp
    BEFORE UPDATE ON user_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- GUILD USER DATA TABLE (Per-server stats)
-- ==========================================
CREATE TABLE IF NOT EXISTS guild_user_data (
    guild_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    messages INTEGER DEFAULT 0,
    voice_time INTEGER DEFAULT 0,
    warns INTEGER DEFAULT 0,
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX idx_guild_user_level ON guild_user_data(guild_id, level DESC);
CREATE INDEX idx_guild_user_xp ON guild_user_data(guild_id, xp DESC);

CREATE TRIGGER update_guild_user_data_timestamp
    BEFORE UPDATE ON guild_user_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- AFK TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS user_afk (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20),
    reason TEXT DEFAULT 'AFK',
    timestamp BIGINT NOT NULL,
    type VARCHAR(10) NOT NULL DEFAULT 'guild',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_user_afk_guild ON user_afk(guild_id) WHERE guild_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_afk_global ON user_afk(user_id) WHERE guild_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_afk_user ON user_afk(user_id);

CREATE TRIGGER update_user_afk_timestamp
    BEFORE UPDATE ON user_afk
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- SNIPE TABLE (Deleted messages)
-- ==========================================
CREATE TABLE IF NOT EXISTS snipes (
    id SERIAL PRIMARY KEY,
    channel_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    content TEXT,
    attachments JSONB DEFAULT '[]',
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_snipes_channel ON snipes(channel_id, deleted_at DESC);

-- Auto-cleanup old snipes (keep last 10 per channel)
CREATE OR REPLACE FUNCTION cleanup_old_snipes()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM snipes 
    WHERE channel_id = NEW.channel_id 
    AND id NOT IN (
        SELECT id FROM snipes 
        WHERE channel_id = NEW.channel_id 
        ORDER BY deleted_at DESC 
        LIMIT 10
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_snipes
    AFTER INSERT ON snipes
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_old_snipes();

-- ==========================================
-- MUSIC PLAYLISTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS playlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    tracks JSONB DEFAULT '[]',
    is_public BOOLEAN DEFAULT false,
    play_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

CREATE INDEX idx_playlists_user ON playlists(user_id);
CREATE INDEX idx_playlists_public ON playlists(is_public) WHERE is_public = true;

CREATE TRIGGER update_playlists_timestamp
    BEFORE UPDATE ON playlists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- BOT STATISTICS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS bot_stats (
    id SERIAL PRIMARY KEY,
    date DATE DEFAULT CURRENT_DATE UNIQUE,
    commands_used INTEGER DEFAULT 0,
    messages_seen INTEGER DEFAULT 0,
    guilds_joined INTEGER DEFAULT 0,
    guilds_left INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    uptime_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- COMMAND USAGE ANALYTICS
-- ==========================================
CREATE TABLE IF NOT EXISTS command_analytics (
    id SERIAL PRIMARY KEY,
    command_name VARCHAR(50) NOT NULL,
    guild_id VARCHAR(20),
    user_id VARCHAR(20) NOT NULL,
    success BOOLEAN DEFAULT true,
    execution_time INTEGER,
    error_message TEXT,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cmd_analytics_name ON command_analytics(command_name);
CREATE INDEX idx_cmd_analytics_date ON command_analytics(used_at);

-- ==========================================
-- ANIME FAVOURITES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS anime_favourites (
    user_id VARCHAR(20) NOT NULL,
    anime_id INTEGER NOT NULL,
    anime_title TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, anime_id)
);

CREATE INDEX idx_anime_fav_user ON anime_favourites(user_id);

-- ==========================================
-- ANIME NOTIFICATIONS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS anime_notifications (
    user_id VARCHAR(20) NOT NULL,
    anime_id INTEGER NOT NULL,
    notify BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, anime_id)
);

CREATE TRIGGER update_anime_notifications_timestamp
    BEFORE UPDATE ON anime_notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- INITIAL DATA
-- ==========================================
INSERT INTO bot_stats (date, commands_used) VALUES (CURRENT_DATE, 0)
ON CONFLICT (date) DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO altergolden;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO altergolden;

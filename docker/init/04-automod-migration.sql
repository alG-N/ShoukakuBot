-- Migration: Update automod_settings table to match new schema
-- Run this manually if database already exists

-- Add new columns if they don't exist
DO $$
BEGIN
    -- Filter columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'filter_enabled') THEN
        ALTER TABLE automod_settings ADD COLUMN filter_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'filtered_words') THEN
        ALTER TABLE automod_settings ADD COLUMN filtered_words TEXT[] DEFAULT '{}';
    END IF;
    
    -- Spam columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'spam_enabled') THEN
        ALTER TABLE automod_settings ADD COLUMN spam_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'spam_threshold') THEN
        ALTER TABLE automod_settings ADD COLUMN spam_threshold INTEGER DEFAULT 5;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'spam_interval') THEN
        ALTER TABLE automod_settings ADD COLUMN spam_interval INTEGER DEFAULT 5000;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'spam_window_ms') THEN
        ALTER TABLE automod_settings ADD COLUMN spam_window_ms INTEGER DEFAULT 5000;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'spam_action') THEN
        ALTER TABLE automod_settings ADD COLUMN spam_action VARCHAR(20) DEFAULT 'warn';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'spam_mute_duration_ms') THEN
        ALTER TABLE automod_settings ADD COLUMN spam_mute_duration_ms INTEGER DEFAULT 300000;
    END IF;
    
    -- Duplicate columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'duplicate_enabled') THEN
        ALTER TABLE automod_settings ADD COLUMN duplicate_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'duplicate_threshold') THEN
        ALTER TABLE automod_settings ADD COLUMN duplicate_threshold INTEGER DEFAULT 3;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'duplicate_window_ms') THEN
        ALTER TABLE automod_settings ADD COLUMN duplicate_window_ms INTEGER DEFAULT 60000;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'duplicate_action') THEN
        ALTER TABLE automod_settings ADD COLUMN duplicate_action VARCHAR(20) DEFAULT 'warn';
    END IF;
    
    -- Links columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'links_enabled') THEN
        ALTER TABLE automod_settings ADD COLUMN links_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'links_whitelist') THEN
        ALTER TABLE automod_settings ADD COLUMN links_whitelist TEXT[] DEFAULT '{}';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'links_action') THEN
        ALTER TABLE automod_settings ADD COLUMN links_action VARCHAR(20) DEFAULT 'delete';
    END IF;
    
    -- Mention columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'mention_enabled') THEN
        ALTER TABLE automod_settings ADD COLUMN mention_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'mention_limit') THEN
        ALTER TABLE automod_settings ADD COLUMN mention_limit INTEGER DEFAULT 5;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'mention_action') THEN
        ALTER TABLE automod_settings ADD COLUMN mention_action VARCHAR(20) DEFAULT 'warn';
    END IF;
    
    -- Caps columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'caps_enabled') THEN
        ALTER TABLE automod_settings ADD COLUMN caps_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'caps_percent') THEN
        ALTER TABLE automod_settings ADD COLUMN caps_percent INTEGER DEFAULT 70;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'caps_percentage') THEN
        ALTER TABLE automod_settings ADD COLUMN caps_percentage INTEGER DEFAULT 70;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'caps_min_length') THEN
        ALTER TABLE automod_settings ADD COLUMN caps_min_length INTEGER DEFAULT 10;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'caps_action') THEN
        ALTER TABLE automod_settings ADD COLUMN caps_action VARCHAR(20) DEFAULT 'warn';
    END IF;
    
    -- Invites columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'invites_enabled') THEN
        ALTER TABLE automod_settings ADD COLUMN invites_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'invites_whitelist') THEN
        ALTER TABLE automod_settings ADD COLUMN invites_whitelist TEXT[] DEFAULT '{}';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'invites_action') THEN
        ALTER TABLE automod_settings ADD COLUMN invites_action VARCHAR(20) DEFAULT 'delete';
    END IF;
    
    -- New Account columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'new_account_enabled') THEN
        ALTER TABLE automod_settings ADD COLUMN new_account_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'new_account_age_hours') THEN
        ALTER TABLE automod_settings ADD COLUMN new_account_age_hours INTEGER DEFAULT 24;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'new_account_action') THEN
        ALTER TABLE automod_settings ADD COLUMN new_account_action VARCHAR(20) DEFAULT 'kick';
    END IF;
    
    -- Raid columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'raid_enabled') THEN
        ALTER TABLE automod_settings ADD COLUMN raid_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'raid_join_threshold') THEN
        ALTER TABLE automod_settings ADD COLUMN raid_join_threshold INTEGER DEFAULT 10;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'raid_window_ms') THEN
        ALTER TABLE automod_settings ADD COLUMN raid_window_ms INTEGER DEFAULT 10000;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'raid_action') THEN
        ALTER TABLE automod_settings ADD COLUMN raid_action VARCHAR(20) DEFAULT 'kick';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'raid_auto_unlock_ms') THEN
        ALTER TABLE automod_settings ADD COLUMN raid_auto_unlock_ms INTEGER DEFAULT 300000;
    END IF;
    
    -- Ignored columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'ignored_channels') THEN
        ALTER TABLE automod_settings ADD COLUMN ignored_channels TEXT[] DEFAULT '{}';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'ignored_roles') THEN
        ALTER TABLE automod_settings ADD COLUMN ignored_roles TEXT[] DEFAULT '{}';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'log_channel_id') THEN
        ALTER TABLE automod_settings ADD COLUMN log_channel_id VARCHAR(20);
    END IF;
    
    -- Warn settings columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'auto_warn') THEN
        ALTER TABLE automod_settings ADD COLUMN auto_warn BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'mute_duration') THEN
        ALTER TABLE automod_settings ADD COLUMN mute_duration INTEGER DEFAULT 300000;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'default_action') THEN
        ALTER TABLE automod_settings ADD COLUMN default_action VARCHAR(20) DEFAULT 'warn';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'warn_threshold') THEN
        ALTER TABLE automod_settings ADD COLUMN warn_threshold INTEGER DEFAULT 3;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'warn_action') THEN
        ALTER TABLE automod_settings ADD COLUMN warn_action VARCHAR(20) DEFAULT 'mute';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'warn_reset_hours') THEN
        ALTER TABLE automod_settings ADD COLUMN warn_reset_hours INTEGER DEFAULT 24;
    END IF;
    
    RAISE NOTICE 'automod_settings migration completed successfully';
END $$;

-- Migrate data from old columns to new columns if they exist
DO $$
BEGIN
    -- Migrate anti_spam -> spam_enabled
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'anti_spam') THEN
        UPDATE automod_settings SET spam_enabled = anti_spam WHERE spam_enabled IS NULL OR spam_enabled = false;
    END IF;
    
    -- Migrate anti_spam_threshold -> spam_threshold
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'anti_spam_threshold') THEN
        UPDATE automod_settings SET spam_threshold = anti_spam_threshold WHERE spam_threshold = 5;
    END IF;
    
    -- Migrate anti_links -> links_enabled
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'anti_links') THEN
        UPDATE automod_settings SET links_enabled = anti_links WHERE links_enabled IS NULL OR links_enabled = false;
    END IF;
    
    -- Migrate anti_invites -> invites_enabled
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'anti_invites') THEN
        UPDATE automod_settings SET invites_enabled = anti_invites WHERE invites_enabled IS NULL OR invites_enabled = false;
    END IF;
    
    -- Migrate anti_caps -> caps_enabled
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'anti_caps') THEN
        UPDATE automod_settings SET caps_enabled = anti_caps WHERE caps_enabled IS NULL OR caps_enabled = false;
    END IF;
    
    -- Migrate anti_mentions -> mention_enabled
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'anti_mentions') THEN
        UPDATE automod_settings SET mention_enabled = anti_mentions WHERE mention_enabled IS NULL OR mention_enabled = false;
    END IF;
    
    -- Migrate bad_words -> filtered_words
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'bad_words') THEN
        UPDATE automod_settings SET filtered_words = bad_words WHERE (filtered_words IS NULL OR filtered_words = '{}') AND bad_words != '{}';
    END IF;
    
    -- Migrate exempt_channels -> ignored_channels
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'exempt_channels') THEN
        UPDATE automod_settings SET ignored_channels = exempt_channels WHERE (ignored_channels IS NULL OR ignored_channels = '{}') AND exempt_channels != '{}';
    END IF;
    
    -- Migrate exempt_roles -> ignored_roles
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'exempt_roles') THEN
        UPDATE automod_settings SET ignored_roles = exempt_roles WHERE (ignored_roles IS NULL OR ignored_roles = '{}') AND exempt_roles != '{}';
    END IF;
    
    -- Migrate log_channel -> log_channel_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automod_settings' AND column_name = 'log_channel') THEN
        UPDATE automod_settings SET log_channel_id = log_channel WHERE log_channel_id IS NULL AND log_channel IS NOT NULL;
    END IF;
    
    RAISE NOTICE 'Data migration completed successfully';
END $$;

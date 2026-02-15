-- shoukaku Database Optimizations
-- Performance improvements and missing indexes

-- ==========================================
-- MISSING INDEXES
-- ==========================================

-- Add index on command_analytics.user_id for user-specific queries
CREATE INDEX IF NOT EXISTS idx_cmd_analytics_user ON command_analytics(user_id);

-- Composite index for common query patterns (user + date range)
CREATE INDEX IF NOT EXISTS idx_cmd_analytics_user_date ON command_analytics(user_id, used_at DESC);

-- ==========================================
-- OPTIMIZED SNIPE CLEANUP FUNCTION
-- ==========================================

-- Replace inefficient NOT IN with more performant DELETE using ROW_NUMBER
CREATE OR REPLACE FUNCTION cleanup_old_snipes()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete old snipes keeping only the 10 most recent per channel
    -- Uses a more efficient approach with a direct ID comparison
    WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY channel_id 
            ORDER BY deleted_at DESC
        ) as rn
        FROM snipes
        WHERE channel_id = NEW.channel_id
    )
    DELETE FROM snipes
    WHERE id IN (
        SELECT id FROM ranked WHERE rn > 10
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- PERIODIC CLEANUP FOR ANALYTICS
-- ==========================================

-- Function to cleanup old analytics data (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_analytics()
RETURNS void AS $$
BEGIN
    DELETE FROM command_analytics
    WHERE used_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
    
    DELETE FROM snipes
    WHERE deleted_at < CURRENT_TIMESTAMP - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- VACUUM ANALYZE for optimization
-- ==========================================
-- Run ANALYZE on frequently queried tables
ANALYZE command_analytics;
ANALYZE snipes;
ANALYZE guild_settings;
ANALYZE moderation_logs;

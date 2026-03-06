-- NHentai user settings persistence
-- Stores per-user timeframe preferences for Popular/Random buttons

CREATE TABLE IF NOT EXISTS nhentai_user_settings (
    user_id VARCHAR(20) PRIMARY KEY,
    popular_period VARCHAR(10) NOT NULL DEFAULT 'all',
    random_period VARCHAR(10) NOT NULL DEFAULT 'all',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure deployments from older versions are normalized
ALTER TABLE IF EXISTS nhentai_user_settings
    ALTER COLUMN random_period SET DEFAULT 'all';

UPDATE nhentai_user_settings
SET random_period = 'all'
WHERE random_period = 'any';

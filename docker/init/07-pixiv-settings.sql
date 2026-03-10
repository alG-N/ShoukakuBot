-- Pixiv user settings persistence
-- Stores per-user search preferences for /pixiv command

CREATE TABLE IF NOT EXISTS pixiv_user_settings (
    user_id VARCHAR(20) PRIMARY KEY,
    content_types VARCHAR(50) NOT NULL DEFAULT 'illust',
    r18_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    nsfw_mode VARCHAR(10) NOT NULL DEFAULT 'sfw',
    sort_mode VARCHAR(20) NOT NULL DEFAULT 'popular_desc',
    ai_filter BOOLEAN NOT NULL DEFAULT FALSE,
    quality_filter BOOLEAN NOT NULL DEFAULT FALSE,
    min_bookmarks INTEGER NOT NULL DEFAULT 0,
    translate BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- content_types: comma-separated values from 'illust', 'manga', 'novel'
-- r18_enabled: when true, nsfw_mode is ignored (R18 is a separate system)
-- nsfw_mode: 'sfw' | 'all' (only active when r18_enabled = false)

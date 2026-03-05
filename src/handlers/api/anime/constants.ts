import type { MALMediaType as AnimeMediaType } from '../../../types/api/mal.js';
import type { MediaConfig } from '../../../types/api/handlers/anime-handler.js';

export const MEDIA_CONFIG: Record<AnimeMediaType, MediaConfig> = {
    anime: { emoji: '📺', color: '#3498db', label: 'Anime' },
    manga: { emoji: '📚', color: '#e74c3c', label: 'Manga' },
    lightnovel: { emoji: '📖', color: '#9b59b6', label: 'Light Novel' },
    webnovel: { emoji: '💻', color: '#2ecc71', label: 'Web Novel' },
    oneshot: { emoji: '📄', color: '#f39c12', label: 'One-shot' }
};

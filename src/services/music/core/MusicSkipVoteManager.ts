/**
 * Music Facade — Skip Vote Manager
 * Handles skip vote lifecycle — delegation to musicCache + event emission.
 * Extracted from MusicFacade.ts for modularity.
 * @module services/music/MusicSkipVoteManager
 */

import musicCache from '../../../cache/music/MusicCacheFacade.js';
import { musicEventBus, MusicEvents } from '../events/index.js';
import type { VoteSkipResult } from './MusicTypes.js';

export class MusicSkipVoteManager {
    startSkipVote(guildId: string, userId: string, listenerCount: number): VoteSkipResult {
        const result = musicCache.startSkipVote(guildId, userId, listenerCount);
        musicEventBus.emitEvent(MusicEvents.SKIPVOTE_START, { guildId, userId, listenerCount });
        return result as VoteSkipResult;
    }

    addSkipVote(guildId: string, userId: string): VoteSkipResult | null {
        const result = musicCache.addSkipVote(guildId, userId);
        musicEventBus.emitEvent(MusicEvents.SKIPVOTE_ADD, { guildId, userId });
        return result as VoteSkipResult | null;
    }

    endSkipVote(guildId: string): void {
        musicCache.endSkipVote(guildId);
    }

    hasEnoughSkipVotes(guildId: string): boolean {
        return musicCache.hasEnoughSkipVotes(guildId);
    }

    isSkipVoteActive(guildId: string): boolean {
        return musicCache.hasActiveSkipVote(guildId);
    }
}

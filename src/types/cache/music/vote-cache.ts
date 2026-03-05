import type { MessageRef, MusicTrack } from '../../../cache/music/QueueCache.js';
import type { VoteResult, VoteSkipStatus } from '../../music/vote.js';

export interface SkipVoteSession {
    votes: Set<string>;
    listenerCount: number;
    required: number;
    startedAt: number;
    startedBy: string;
    timeout: NodeJS.Timeout | null;
    message: MessageRef | null;
}

export interface PriorityVoteSession {
    track: MusicTrack;
    votes: Set<string>;
    listenerCount: number;
    required: number;
    startedAt: number;
    startedBy: string;
    timeout: NodeJS.Timeout | null;
    message: MessageRef | null;
}

export interface AddVoteResult {
    added: boolean;
    voteCount: number;
    required?: number;
    message?: string;
}

export interface PriorityVoteEndResult {
    track: MusicTrack;
    voteCount: number;
    passed: boolean;
}

export interface VoteCacheStats {
    activeSkipVotes: number;
    activePriorityVotes: number;
}

export type { VoteResult, VoteSkipStatus };

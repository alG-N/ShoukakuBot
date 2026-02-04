/**
 * Vote Cache
 * Manages skip votes and priority votes
 * @module modules/music/repository/VoteCache
 */

import { Message } from 'discord.js';
import { MusicTrack } from './QueueCache';
// Types
export interface SkipVoteSession {
    votes: Set<string>;
    listenerCount: number;
    required: number;
    startedAt: number;
    startedBy: string;
    timeout: NodeJS.Timeout | null;
    message: Message | null;
}

export interface PriorityVoteSession {
    track: MusicTrack;
    votes: Set<string>;
    listenerCount: number;
    required: number;
    startedAt: number;
    startedBy: string;
    timeout: NodeJS.Timeout | null;
    message: Message | null;
}

export interface VoteResult {
    voteCount: number;
    required: number;
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

export interface VoteSkipStatus {
    active: boolean;
    count: number;
    required: number;
}

export interface VoteCacheStats {
    activeSkipVotes: number;
    activePriorityVotes: number;
}
// VoteCache Class
class VoteCache {
    // Skip vote sessions
    private skipVoteSessions: Map<string, SkipVoteSession>;
    // Priority vote sessions
    private priorityVoteSessions: Map<string, PriorityVoteSession>;

    constructor() {
        this.skipVoteSessions = new Map();
        this.priorityVoteSessions = new Map();
    }
    /**
     * Start skip vote
     */
    startSkipVote(guildId: string, userId: string, listenerCount: number): VoteResult {
        const session: SkipVoteSession = {
            votes: new Set([userId]),
            listenerCount,
            required: this.getRequiredVotes(listenerCount),
            startedAt: Date.now(),
            startedBy: userId,
            timeout: null,
            message: null,
        };
        
        this.skipVoteSessions.set(guildId, session);
        return { voteCount: 1, required: session.required };
    }

    /**
     * Add skip vote
     */
    addSkipVote(guildId: string, userId: string): AddVoteResult | null {
        const session = this.skipVoteSessions.get(guildId);
        if (!session) return null;
        
        if (session.votes.has(userId)) {
            return { added: false, voteCount: session.votes.size, message: 'Already voted' };
        }
        
        session.votes.add(userId);
        
        return {
            added: true,
            voteCount: session.votes.size,
            required: session.required
        };
    }

    /**
     * End skip vote
     */
    endSkipVote(guildId: string): number {
        const session = this.skipVoteSessions.get(guildId);
        if (!session) return 0;
        
        const voteCount = session.votes.size;
        
        if (session.timeout) {
            clearTimeout(session.timeout);
        }
        
        this.skipVoteSessions.delete(guildId);
        return voteCount;
    }

    /**
     * Check if skip vote is active
     */
    hasActiveSkipVote(guildId: string): boolean {
        return this.skipVoteSessions.has(guildId);
    }

    /**
     * Get skip vote session
     */
    getSkipVoteSession(guildId: string): SkipVoteSession | undefined {
        return this.skipVoteSessions.get(guildId);
    }

    /**
     * Set skip vote timeout
     */
    setSkipVoteTimeout(guildId: string, timeout: NodeJS.Timeout): void {
        const session = this.skipVoteSessions.get(guildId);
        if (session) {
            session.timeout = timeout;
        }
    }

    /**
     * Set skip vote message
     */
    setSkipVoteMessage(guildId: string, message: Message): void {
        const session = this.skipVoteSessions.get(guildId);
        if (session) {
            session.message = message;
        }
    }

    /**
     * Get required votes (majority)
     */
    getRequiredVotes(listenerCount: number): number {
        // Require ~60% of listeners
        return Math.ceil(listenerCount * 0.6);
    }

    /**
     * Check if enough votes to skip
     */
    hasEnoughSkipVotes(guildId: string): boolean {
        const session = this.skipVoteSessions.get(guildId);
        if (!session) return false;
        return session.votes.size >= session.required;
    }

    /**
     * Get vote skip status for display
     */
    getVoteSkipStatus(guildId: string, listenerCount: number = 0): VoteSkipStatus {
        const session = this.skipVoteSessions.get(guildId);
        
        if (session) {
            return {
                active: true,
                count: session.votes.size,
                required: session.required
            };
        }
        
        return {
            active: false,
            count: 0,
            required: listenerCount > 0 ? this.getRequiredVotes(listenerCount) : 0
        };
    }
    /**
     * Start priority vote
     */
    startPriorityVote(guildId: string, track: MusicTrack, userId: string, listenerCount: number): VoteResult {
        const session: PriorityVoteSession = {
            track,
            votes: new Set([userId]),
            listenerCount,
            required: this.getRequiredVotes(listenerCount),
            startedAt: Date.now(),
            startedBy: userId,
            timeout: null,
            message: null,
        };
        
        this.priorityVoteSessions.set(guildId, session);
        return { voteCount: 1, required: session.required };
    }

    /**
     * Add priority vote
     */
    addPriorityVote(guildId: string, userId: string): AddVoteResult | null {
        const session = this.priorityVoteSessions.get(guildId);
        if (!session) return null;
        
        if (session.votes.has(userId)) {
            return { added: false, voteCount: session.votes.size, message: 'Already voted' };
        }
        
        session.votes.add(userId);
        
        return {
            added: true,
            voteCount: session.votes.size,
            required: session.required
        };
    }

    /**
     * End priority vote
     */
    endPriorityVote(guildId: string): PriorityVoteEndResult | null {
        const session = this.priorityVoteSessions.get(guildId);
        if (!session) return null;
        
        if (session.timeout) {
            clearTimeout(session.timeout);
        }
        
        const result: PriorityVoteEndResult = {
            track: session.track,
            voteCount: session.votes.size,
            passed: session.votes.size >= session.required
        };
        
        this.priorityVoteSessions.delete(guildId);
        return result;
    }

    /**
     * Get priority vote session
     */
    getPriorityVoteSession(guildId: string): PriorityVoteSession | undefined {
        return this.priorityVoteSessions.get(guildId);
    }
    /**
     * Cleanup stale votes (older than 5 minutes)
     */
    cleanup(): void {
        const now = Date.now();
        const staleThreshold = 5 * 60 * 1000;
        
        for (const [guildId, session] of this.skipVoteSessions) {
            if (now - session.startedAt > staleThreshold) {
                this.endSkipVote(guildId);
            }
        }
        
        for (const [guildId, session] of this.priorityVoteSessions) {
            if (now - session.startedAt > staleThreshold) {
                this.endPriorityVote(guildId);
            }
        }
    }

    /**
     * Cleanup for specific guild
     */
    cleanupGuild(guildId: string): void {
        this.endSkipVote(guildId);
        this.endPriorityVote(guildId);
    }

    /**
     * Get statistics
     */
    getStats(): VoteCacheStats {
        return {
            activeSkipVotes: this.skipVoteSessions.size,
            activePriorityVotes: this.priorityVoteSessions.size,
        };
    }

    /**
     * Shutdown
     */
    shutdown(): void {
        for (const guildId of this.skipVoteSessions.keys()) {
            this.endSkipVote(guildId);
        }
        for (const guildId of this.priorityVoteSessions.keys()) {
            this.endPriorityVote(guildId);
        }
    }
}

export const voteCache = new VoteCache();
export default voteCache;

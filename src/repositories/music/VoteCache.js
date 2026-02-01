/**
 * Vote Cache
 * Manages skip votes and priority votes
 * @module modules/music/repository/VoteCache
 */

class VoteCache {
    constructor() {
        // Skip vote sessions
        this.skipVoteSessions = new Map();
        // Priority vote sessions
        this.priorityVoteSessions = new Map();
    }

    // ========== SKIP VOTES ==========

    /**
     * Start skip vote
     */
    startSkipVote(guildId, userId, listenerCount) {
        const session = {
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
    addSkipVote(guildId, userId) {
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
    endSkipVote(guildId) {
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
    hasActiveSkipVote(guildId) {
        return this.skipVoteSessions.has(guildId);
    }

    /**
     * Get skip vote session
     */
    getSkipVoteSession(guildId) {
        return this.skipVoteSessions.get(guildId);
    }

    /**
     * Set skip vote timeout
     */
    setSkipVoteTimeout(guildId, timeout) {
        const session = this.skipVoteSessions.get(guildId);
        if (session) {
            session.timeout = timeout;
        }
    }

    /**
     * Set skip vote message
     */
    setSkipVoteMessage(guildId, message) {
        const session = this.skipVoteSessions.get(guildId);
        if (session) {
            session.message = message;
        }
    }

    /**
     * Get required votes (majority)
     */
    getRequiredVotes(listenerCount) {
        // Require ~60% of listeners
        return Math.ceil(listenerCount * 0.6);
    }

    /**
     * Check if enough votes to skip
     */
    hasEnoughSkipVotes(guildId) {
        const session = this.skipVoteSessions.get(guildId);
        if (!session) return false;
        return session.votes.size >= session.required;
    }

    /**
     * Get vote skip status for display
     */
    getVoteSkipStatus(guildId, listenerCount = 0) {
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

    // ========== PRIORITY VOTES ==========

    /**
     * Start priority vote
     */
    startPriorityVote(guildId, track, userId, listenerCount) {
        const session = {
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
    addPriorityVote(guildId, userId) {
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
    endPriorityVote(guildId) {
        const session = this.priorityVoteSessions.get(guildId);
        if (!session) return null;
        
        if (session.timeout) {
            clearTimeout(session.timeout);
        }
        
        const result = {
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
    getPriorityVoteSession(guildId) {
        return this.priorityVoteSessions.get(guildId);
    }

    // ========== CLEANUP ==========

    /**
     * Cleanup stale votes (older than 5 minutes)
     */
    cleanup() {
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
    cleanupGuild(guildId) {
        this.endSkipVote(guildId);
        this.endPriorityVote(guildId);
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            activeSkipVotes: this.skipVoteSessions.size,
            activePriorityVotes: this.priorityVoteSessions.size,
        };
    }

    /**
     * Shutdown
     */
    shutdown() {
        for (const guildId of this.skipVoteSessions.keys()) {
            this.endSkipVote(guildId);
        }
        for (const guildId of this.priorityVoteSessions.keys()) {
            this.endPriorityVote(guildId);
        }
    }
}

module.exports = new VoteCache();

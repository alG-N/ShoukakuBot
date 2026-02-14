/**
 * VoteCache Unit Tests
 * Tests for in-memory skip/priority vote management
 */

import { voteCache } from '../../../../src/cache/music/VoteCache.js';

describe('VoteCache', () => {
    beforeEach(() => {
        voteCache.shutdown();
        jest.clearAllMocks();
    });

    describe('Skip Vote', () => {
        describe('startSkipVote', () => {
            it('should create a skip vote session', () => {
                const result = voteCache.startSkipVote('guild1', 'user1', 5);
                expect(result.voteCount).toBe(1);
                expect(result.required).toBe(3); // ceil(5 * 0.6) = 3
            });

            it('should include the starter as first voter', () => {
                voteCache.startSkipVote('guild1', 'user1', 5);
                const session = voteCache.getSkipVoteSession('guild1');
                expect(session?.votes.has('user1')).toBe(true);
                expect(session?.startedBy).toBe('user1');
            });

            it('should replace existing vote session', () => {
                voteCache.startSkipVote('guild1', 'user1', 5);
                voteCache.addSkipVote('guild1', 'user2');
                voteCache.startSkipVote('guild1', 'user3', 10);
                const session = voteCache.getSkipVoteSession('guild1');
                expect(session?.votes.size).toBe(1); // Only user3
                expect(session?.votes.has('user3')).toBe(true);
            });
        });

        describe('addSkipVote', () => {
            it('should add a new vote', () => {
                voteCache.startSkipVote('guild1', 'user1', 5);
                const result = voteCache.addSkipVote('guild1', 'user2');
                expect(result?.added).toBe(true);
                expect(result?.voteCount).toBe(2);
                expect(result?.required).toBe(3);
            });

            it('should reject duplicate vote', () => {
                voteCache.startSkipVote('guild1', 'user1', 5);
                const result = voteCache.addSkipVote('guild1', 'user1');
                expect(result?.added).toBe(false);
                expect(result?.message).toBe('Already voted');
            });

            it('should return null if no active session', () => {
                expect(voteCache.addSkipVote('guild1', 'user1')).toBeNull();
            });
        });

        describe('endSkipVote', () => {
            it('should remove the vote session', () => {
                voteCache.startSkipVote('guild1', 'user1', 5);
                const count = voteCache.endSkipVote('guild1');
                expect(count).toBe(1);
                expect(voteCache.hasActiveSkipVote('guild1')).toBe(false);
            });

            it('should return 0 if no session', () => {
                expect(voteCache.endSkipVote('unknown')).toBe(0);
            });

            it('should clear timeout if set', () => {
                voteCache.startSkipVote('guild1', 'user1', 5);
                const timer = setTimeout(() => {}, 60000);
                voteCache.setSkipVoteTimeout('guild1', timer);
                const clearSpy = jest.spyOn(global, 'clearTimeout');
                voteCache.endSkipVote('guild1');
                expect(clearSpy).toHaveBeenCalledWith(timer);
                clearSpy.mockRestore();
            });
        });

        describe('hasActiveSkipVote', () => {
            it('should return true when active', () => {
                voteCache.startSkipVote('guild1', 'user1', 5);
                expect(voteCache.hasActiveSkipVote('guild1')).toBe(true);
            });

            it('should return false when none', () => {
                expect(voteCache.hasActiveSkipVote('guild1')).toBe(false);
            });
        });

        describe('setSkipVoteTimeout', () => {
            it('should store timeout on session', () => {
                voteCache.startSkipVote('guild1', 'user1', 5);
                const timer = setTimeout(() => {}, 60000);
                voteCache.setSkipVoteTimeout('guild1', timer);
                const session = voteCache.getSkipVoteSession('guild1');
                expect(session?.timeout).toBe(timer);
                clearTimeout(timer);
            });

            it('should do nothing without session', () => {
                const timer = setTimeout(() => {}, 60000);
                expect(() => voteCache.setSkipVoteTimeout('unknown', timer)).not.toThrow();
                clearTimeout(timer);
            });
        });

        describe('setSkipVoteMessage', () => {
            it('should store MessageRef', () => {
                voteCache.startSkipVote('guild1', 'user1', 5);
                voteCache.setSkipVoteMessage('guild1', { messageId: 'msg1', channelId: 'ch1' });
                const session = voteCache.getSkipVoteSession('guild1');
                expect(session?.message).toEqual({ messageId: 'msg1', channelId: 'ch1' });
            });

            it('should convert Discord Message-like to MessageRef', () => {
                voteCache.startSkipVote('guild1', 'user1', 5);
                voteCache.setSkipVoteMessage('guild1', { id: 'msg2', channelId: 'ch2' });
                const session = voteCache.getSkipVoteSession('guild1');
                expect(session?.message).toEqual({ messageId: 'msg2', channelId: 'ch2' });
            });
        });

        describe('getRequiredVotes', () => {
            it('should require 60% of listeners (rounded up)', () => {
                expect(voteCache.getRequiredVotes(1)).toBe(1);
                expect(voteCache.getRequiredVotes(2)).toBe(2);
                expect(voteCache.getRequiredVotes(3)).toBe(2);
                expect(voteCache.getRequiredVotes(5)).toBe(3);
                expect(voteCache.getRequiredVotes(10)).toBe(6);
            });
        });

        describe('hasEnoughSkipVotes', () => {
            it('should return true when threshold met', () => {
                voteCache.startSkipVote('guild1', 'user1', 3); // required = 2
                voteCache.addSkipVote('guild1', 'user2');
                expect(voteCache.hasEnoughSkipVotes('guild1')).toBe(true);
            });

            it('should return false when below threshold', () => {
                voteCache.startSkipVote('guild1', 'user1', 5); // required = 3
                expect(voteCache.hasEnoughSkipVotes('guild1')).toBe(false);
            });

            it('should return false with no session', () => {
                expect(voteCache.hasEnoughSkipVotes('unknown')).toBe(false);
            });
        });

        describe('getVoteSkipStatus', () => {
            it('should return active status', () => {
                voteCache.startSkipVote('guild1', 'user1', 5);
                voteCache.addSkipVote('guild1', 'user2');
                const status = voteCache.getVoteSkipStatus('guild1');
                expect(status.active).toBe(true);
                expect(status.count).toBe(2);
                expect(status.required).toBe(3);
            });

            it('should return inactive status with calculated required', () => {
                const status = voteCache.getVoteSkipStatus('guild1', 5);
                expect(status.active).toBe(false);
                expect(status.count).toBe(0);
                expect(status.required).toBe(3);
            });

            it('should return 0 required when no listeners provided', () => {
                const status = voteCache.getVoteSkipStatus('guild1');
                expect(status.required).toBe(0);
            });
        });
    });

    describe('Priority Vote', () => {
        const testTrack = { title: 'Priority Track', url: 'https://yt.com/a', track: { encoded: 'x' } };

        describe('startPriorityVote', () => {
            it('should create a priority vote session', () => {
                const result = voteCache.startPriorityVote('guild1', testTrack, 'user1', 5);
                expect(result.voteCount).toBe(1);
                expect(result.required).toBe(3);
            });

            it('should store the track', () => {
                voteCache.startPriorityVote('guild1', testTrack, 'user1', 5);
                const session = voteCache.getPriorityVoteSession('guild1');
                expect(session?.track).toBe(testTrack);
            });
        });

        describe('addPriorityVote', () => {
            it('should add vote', () => {
                voteCache.startPriorityVote('guild1', testTrack, 'user1', 5);
                const result = voteCache.addPriorityVote('guild1', 'user2');
                expect(result?.added).toBe(true);
                expect(result?.voteCount).toBe(2);
            });

            it('should reject duplicate', () => {
                voteCache.startPriorityVote('guild1', testTrack, 'user1', 5);
                const result = voteCache.addPriorityVote('guild1', 'user1');
                expect(result?.added).toBe(false);
            });

            it('should return null with no session', () => {
                expect(voteCache.addPriorityVote('unknown', 'user1')).toBeNull();
            });
        });

        describe('endPriorityVote', () => {
            it('should return result with pass/fail', () => {
                voteCache.startPriorityVote('guild1', testTrack, 'user1', 3); // required = 2
                voteCache.addPriorityVote('guild1', 'user2');
                const result = voteCache.endPriorityVote('guild1');
                expect(result?.passed).toBe(true);
                expect(result?.track).toBe(testTrack);
                expect(result?.voteCount).toBe(2);
            });

            it('should return failed when not enough votes', () => {
                voteCache.startPriorityVote('guild1', testTrack, 'user1', 5); // required = 3
                const result = voteCache.endPriorityVote('guild1');
                expect(result?.passed).toBe(false);
                expect(result?.voteCount).toBe(1);
            });

            it('should return null with no session', () => {
                expect(voteCache.endPriorityVote('unknown')).toBeNull();
            });

            it('should clear session after ending', () => {
                voteCache.startPriorityVote('guild1', testTrack, 'user1', 5);
                voteCache.endPriorityVote('guild1');
                expect(voteCache.getPriorityVoteSession('guild1')).toBeUndefined();
            });
        });
    });

    describe('cleanup', () => {
        it('should remove stale vote sessions (>5 min)', () => {
            voteCache.startSkipVote('guild1', 'user1', 5);
            const session = voteCache.getSkipVoteSession('guild1')!;
            session.startedAt = Date.now() - 6 * 60 * 1000; // 6 minutes ago
            
            voteCache.cleanup();
            expect(voteCache.hasActiveSkipVote('guild1')).toBe(false);
        });

        it('should keep recent vote sessions', () => {
            voteCache.startSkipVote('guild1', 'user1', 5);
            voteCache.cleanup();
            expect(voteCache.hasActiveSkipVote('guild1')).toBe(true);
        });

        it('should clean stale priority votes too', () => {
            const track = { title: 'T', track: { encoded: 'x' } };
            voteCache.startPriorityVote('guild1', track, 'user1', 5);
            const session = voteCache.getPriorityVoteSession('guild1')!;
            session.startedAt = Date.now() - 6 * 60 * 1000;

            voteCache.cleanup();
            expect(voteCache.getPriorityVoteSession('guild1')).toBeUndefined();
        });
    });

    describe('cleanupGuild', () => {
        it('should end both skip and priority votes for guild', () => {
            voteCache.startSkipVote('guild1', 'user1', 5);
            voteCache.startPriorityVote('guild1', { title: 'T', track: { encoded: 'x' } }, 'user1', 5);
            voteCache.cleanupGuild('guild1');
            expect(voteCache.hasActiveSkipVote('guild1')).toBe(false);
            expect(voteCache.getPriorityVoteSession('guild1')).toBeUndefined();
        });
    });

    describe('getStats', () => {
        it('should count active sessions', () => {
            voteCache.startSkipVote('guild1', 'u1', 5);
            voteCache.startSkipVote('guild2', 'u2', 5);
            voteCache.startPriorityVote('guild3', { title: 'T', track: { encoded: 'x' } }, 'u3', 5);

            const stats = voteCache.getStats();
            expect(stats.activeSkipVotes).toBe(2);
            expect(stats.activePriorityVotes).toBe(1);
        });
    });

    describe('shutdown', () => {
        it('should clear all sessions', () => {
            voteCache.startSkipVote('guild1', 'u1', 5);
            voteCache.startPriorityVote('guild2', { title: 'T', track: { encoded: 'x' } }, 'u2', 5);
            voteCache.shutdown();
            const stats = voteCache.getStats();
            expect(stats.activeSkipVotes).toBe(0);
            expect(stats.activePriorityVotes).toBe(0);
        });
    });
});

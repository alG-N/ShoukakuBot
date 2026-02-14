/**
 * LockdownService Unit Tests
 * Tests for channel/server lockdown, unlock, permission save/restore, index management
 */

// Mock CacheService
const mockPeek = jest.fn();
const mockSet = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        peek: mockPeek,
        set: mockSet,
        delete: mockDelete,
    },
}));

jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
    logger: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
}));

import lockdownService, { LockdownService } from '../../../../src/services/moderation/LockdownService.js';

// Helpers
const createMockChannel = (id: string, name: string, opts: { locked?: boolean; editFails?: boolean } = {}) => {
    const channel = {
        id,
        name,
        type: 0, // GuildText
        guild: {
            id: '111',
            roles: {
                everyone: { id: '111' },
            },
        },
        permissionOverwrites: {
            cache: {
                get: jest.fn().mockReturnValue(
                    opts.locked ? null : {
                        allow: { bitfield: BigInt(0) },
                        deny: { bitfield: BigInt(0) },
                    }
                ),
            },
            edit: opts.editFails
                ? jest.fn().mockRejectedValue(new Error('Missing permissions'))
                : jest.fn().mockResolvedValue(undefined),
        },
        permissionsFor: jest.fn().mockReturnValue({
            has: jest.fn().mockReturnValue(true),
        }),
    } as any;
    return channel;
};

describe('LockdownService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPeek.mockResolvedValue(null);
        mockSet.mockResolvedValue(undefined);
        mockDelete.mockResolvedValue(undefined);
    });

    // --- lockChannel ---
    describe('lockChannel', () => {
        it('should lock a channel successfully', async () => {
            const channel = createMockChannel('ch-1', 'general');

            const result = await lockdownService.lockChannel(channel);

            expect(result.success).toBe(true);
            expect(result.channelId).toBe('ch-1');
            expect(result.channelName).toBe('general');
            expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
                { id: '111' }, // everyone role object
                expect.objectContaining({
                    SendMessages: false,
                    AddReactions: false,
                }),
                expect.any(Object)
            );
        });

        it('should store lockdown state in cache', async () => {
            const channel = createMockChannel('ch-1', 'general');

            await lockdownService.lockChannel(channel);

            expect(mockSet).toHaveBeenCalledWith(
                'lockdown',
                '111:ch-1',
                expect.objectContaining({ locked: true, permissions: expect.any(Object) }),
                86400
            );
        });

        it('should return error if channel is already locked', async () => {
            mockPeek.mockResolvedValueOnce({ locked: true });
            const channel = createMockChannel('ch-1', 'general');

            const result = await lockdownService.lockChannel(channel);

            expect(result.success).toBe(false);
            expect(result.error).toContain('already locked');
        });

        it('should return error on permission edit failure', async () => {
            const channel = createMockChannel('ch-1', 'general', { editFails: true });

            const result = await lockdownService.lockChannel(channel);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing permissions');
        });

        it('should save current permission overwrites', async () => {
            const channel = createMockChannel('ch-1', 'general');
            channel.permissionOverwrites.cache.get.mockReturnValue({
                allow: { bitfield: BigInt(1024) },
                deny: { bitfield: BigInt(2048) },
            });

            await lockdownService.lockChannel(channel);

            const savedState = mockSet.mock.calls[0][2];
            expect(savedState.permissions['111']).toEqual({
                allow: '1024',
                deny: '2048',
            });
        });

        it('should handle null overwrite (no existing perms)', async () => {
            const channel = createMockChannel('ch-1', 'general');
            channel.permissionOverwrites.cache.get.mockReturnValue(null);

            await lockdownService.lockChannel(channel);

            const savedState = mockSet.mock.calls[0][2];
            expect(savedState.permissions['111']).toBeNull();
        });
    });

    // --- unlockChannel ---
    describe('unlockChannel', () => {
        it('should unlock a locked channel', async () => {
            mockPeek.mockResolvedValueOnce({ locked: true, permissions: {} });
            const channel = createMockChannel('ch-1', 'general');

            const result = await lockdownService.unlockChannel(channel);

            expect(result.success).toBe(true);
            expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
                { id: '111' }, // everyone role object
                expect.objectContaining({
                    SendMessages: null,
                    AddReactions: null,
                }),
                expect.any(Object)
            );
        });

        it('should delete lockdown state from cache', async () => {
            mockPeek.mockResolvedValueOnce({ locked: true, permissions: {} });
            const channel = createMockChannel('ch-1', 'general');

            await lockdownService.unlockChannel(channel);

            expect(mockDelete).toHaveBeenCalledWith('lockdown', '111:ch-1');
        });

        it('should return error if channel is not locked', async () => {
            mockPeek.mockResolvedValueOnce(null);
            const channel = createMockChannel('ch-1', 'general');

            const result = await lockdownService.unlockChannel(channel);

            expect(result.success).toBe(false);
            expect(result.error).toContain('not locked');
        });

        it('should return error on permission edit failure', async () => {
            mockPeek.mockResolvedValueOnce({ locked: true, permissions: {} });
            const channel = createMockChannel('ch-1', 'general', { editFails: true });

            const result = await lockdownService.unlockChannel(channel);

            expect(result.success).toBe(false);
        });
    });

    // --- isChannelLocked ---
    describe('isChannelLocked', () => {
        it('should return true when channel is locked', async () => {
            mockPeek.mockResolvedValue({ locked: true });

            const result = await lockdownService.isChannelLocked('111', 'ch-1');

            expect(result).toBe(true);
            expect(mockPeek).toHaveBeenCalledWith('lockdown', '111:ch-1');
        });

        it('should return false when channel is not locked', async () => {
            mockPeek.mockResolvedValue(null);

            const result = await lockdownService.isChannelLocked('111', 'ch-1');

            expect(result).toBe(false);
        });
    });

    // --- getLockedChannels ---
    describe('getLockedChannels', () => {
        it('should return locked channel IDs from index', async () => {
            mockPeek.mockResolvedValue(['ch-1', 'ch-2']);

            const result = await lockdownService.getLockedChannels('111');

            expect(mockPeek).toHaveBeenCalledWith('lockdown', 'index:111');
            expect(result).toEqual(['ch-1', 'ch-2']);
        });

        it('should return empty array when no index', async () => {
            mockPeek.mockResolvedValue(null);

            const result = await lockdownService.getLockedChannels('111');

            expect(result).toEqual([]);
        });
    });

    // --- getLockStatus ---
    describe('getLockStatus', () => {
        it('should return count and channel IDs', async () => {
            mockPeek.mockResolvedValue(['ch-1', 'ch-2', 'ch-3']);

            const result = await lockdownService.getLockStatus('111');

            expect(result.lockedCount).toBe(3);
            expect(result.channelIds).toEqual(['ch-1', 'ch-2', 'ch-3']);
        });
    });

    // --- lockServer ---
    describe('lockServer', () => {
        it('should lock all text channels', async () => {
            const ch1 = createMockChannel('ch-1', 'general');
            const ch2 = createMockChannel('ch-2', 'memes');
            const guild = {
                id: '111',
                channels: {
                    cache: {
                        filter: jest.fn().mockReturnValue(
                            new Map([['ch-1', ch1], ['ch-2', ch2]])
                        ),
                    },
                },
                members: { me: {} },
            } as any;

            // Mock: not already locked
            mockPeek.mockResolvedValue(null);

            const result = await lockdownService.lockServer(guild);

            expect(result.success.length).toBe(2);
            expect(result.failed.length).toBe(0);
        });

        it('should skip excluded channels', async () => {
            const ch1 = createMockChannel('ch-1', 'general');
            const guild = {
                id: '111',
                channels: {
                    cache: {
                        filter: jest.fn().mockReturnValue(new Map([['ch-1', ch1]])),
                    },
                },
                members: { me: {} },
            } as any;
            mockPeek.mockResolvedValue(null);

            const result = await lockdownService.lockServer(guild, 'Lockdown', ['ch-excluded']);

            // The guild.channels.cache.filter function is called with exclude logic
            expect(guild.channels.cache.filter).toHaveBeenCalled();
        });

        it('should skip already locked channels', async () => {
            const ch1 = createMockChannel('ch-1', 'general');
            const guild = {
                id: '111',
                channels: {
                    cache: {
                        filter: jest.fn().mockReturnValue(new Map([['ch-1', ch1]])),
                    },
                },
                members: { me: {} },
            } as any;
            // First peek: index check returns null (for lockServer's peek)
            // channel is checked as locked
            mockPeek.mockResolvedValue({ locked: true });

            const result = await lockdownService.lockServer(guild);

            expect(result.skipped.length).toBe(1);
            expect(result.success.length).toBe(0);
        });
    });

    // --- unlockServer ---
    describe('unlockServer', () => {
        it('should return message when no channels locked', async () => {
            mockPeek.mockResolvedValue(null); // No index

            const guild = { id: '111', channels: { cache: { get: jest.fn() } } } as any;

            const result = await lockdownService.unlockServer(guild);

            expect(result.message).toContain('No locked channels');
        });

        it('should skip channels that no longer exist', async () => {
            // First call: getLockedChannels returns index
            mockPeek.mockResolvedValueOnce(['ch-deleted']);
            
            const guild = {
                id: '111',
                channels: { cache: { get: jest.fn().mockReturnValue(null) } },
            } as any;

            const result = await lockdownService.unlockServer(guild);

            expect(result.skipped.length).toBe(1);
            // Should clean up the Redis entry for deleted channel
            expect(mockDelete).toHaveBeenCalledWith('lockdown', '111:ch-deleted');
        });
    });

    // --- clearGuildData ---
    describe('clearGuildData', () => {
        it('should clear all lockdown data for a guild', async () => {
            mockPeek.mockResolvedValueOnce(['ch-1', 'ch-2']);

            await lockdownService.clearGuildData('111');

            expect(mockDelete).toHaveBeenCalledWith('lockdown', '111:ch-1');
            expect(mockDelete).toHaveBeenCalledWith('lockdown', '111:ch-2');
            expect(mockDelete).toHaveBeenCalledWith('lockdown', 'index:111');
        });

        it('should handle empty channel list', async () => {
            mockPeek.mockResolvedValueOnce([]);

            await lockdownService.clearGuildData('111');

            expect(mockDelete).toHaveBeenCalledWith('lockdown', 'index:111');
        });

        it('should handle errors silently', async () => {
            mockPeek.mockRejectedValueOnce(new Error('Redis error'));

            await lockdownService.clearGuildData('111');

            // Should not throw
        });
    });

    // --- singleton ---
    describe('Singleton', () => {
        it('should export a default singleton instance', () => {
            expect(lockdownService).toBeInstanceOf(LockdownService);
        });
    });
});

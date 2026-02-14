/**
 * GuildDelete Event Unit Tests
 * Tests for guild leave handling and cache cleanup
 */

// Mock Logger
jest.mock('../../../src/core/Logger', () => ({
    __esModule: true,
    default: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        success: jest.fn(),
        logGuildEventDetailed: jest.fn().mockResolvedValue(undefined),
    },
    logger: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        success: jest.fn(),
        logGuildEventDetailed: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock CacheService
const mockDeleteByPrefix = jest.fn().mockResolvedValue(0);
jest.mock('../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        deleteByPrefix: mockDeleteByPrefix,
    },
}));

import logger from '../../../src/core/Logger';
import type { Client, Guild } from 'discord.js';

// Import the event after mocks are in place
import guildDeleteEvent from '../../../src/events/guildDelete';

describe('GuildDeleteEvent', () => {
    const mockClient = {} as Client;
    const mockGuild = {
        id: '123456789',
        name: 'Test Server',
        memberCount: 100,
    } as unknown as Guild;

    beforeEach(() => {
        jest.clearAllMocks();
        mockDeleteByPrefix.mockResolvedValue(0);
    });

    describe('constructor', () => {
        it('should have correct event name', () => {
            expect(guildDeleteEvent.name).toBe('guildDelete');
        });

        it('should not be a once event', () => {
            expect(guildDeleteEvent.once).toBe(false);
        });
    });

    describe('execute()', () => {
        it('should log guild leave', async () => {
            await guildDeleteEvent.execute(mockClient, mockGuild);

            expect(logger.info).toHaveBeenCalledWith(
                'GuildDelete',
                expect.stringContaining('Left server: Test Server (123456789)')
            );
        });

        it('should log detailed embed event', async () => {
            await guildDeleteEvent.execute(mockClient, mockGuild);

            expect(logger.logGuildEventDetailed).toHaveBeenCalledWith('leave', mockGuild);
        });

        it('should clean up all guild-scoped cache namespaces', async () => {
            await guildDeleteEvent.execute(mockClient, mockGuild);

            // Should clean up 7 namespaces
            const expectedNamespaces = ['guild', 'automod', 'snipe', 'lockdown', 'antiraid', 'voice', 'music'];
            expect(mockDeleteByPrefix).toHaveBeenCalledTimes(expectedNamespaces.length);
            for (const ns of expectedNamespaces) {
                expect(mockDeleteByPrefix).toHaveBeenCalledWith(ns, '123456789');
            }
        });

        it('should log cleanup count when entries were deleted', async () => {
            mockDeleteByPrefix.mockResolvedValue(5); // Each namespace returns 5

            await guildDeleteEvent.execute(mockClient, mockGuild);

            expect(logger.debug).toHaveBeenCalledWith(
                'GuildDelete',
                expect.stringContaining('Cleaned up')
            );
        });

        it('should not log cleanup when no entries were deleted', async () => {
            mockDeleteByPrefix.mockResolvedValue(0);

            await guildDeleteEvent.execute(mockClient, mockGuild);

            expect(logger.debug).not.toHaveBeenCalledWith(
                'GuildDelete',
                expect.stringContaining('Cleaned up')
            );
        });

        it('should handle cache cleanup failure gracefully', async () => {
            mockDeleteByPrefix.mockRejectedValue(new Error('Redis connection lost'));

            // Should NOT throw
            await guildDeleteEvent.execute(mockClient, mockGuild);

            expect(logger.warn).toHaveBeenCalledWith(
                'GuildDelete',
                expect.stringContaining('Cache cleanup failed')
            );
        });
    });
});

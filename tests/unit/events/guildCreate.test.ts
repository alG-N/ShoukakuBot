/**
 * GuildCreate Event Unit Tests
 * Tests for guild join handling and setup wizard
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

// Mock SetupWizardService
const mockStartWizard = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/services/guild/SetupWizardService', () => ({
    __esModule: true,
    setupWizardService: {
        startWizard: mockStartWizard,
    },
}));

import logger from '../../../src/core/Logger';
import type { Client, Guild } from 'discord.js';

import guildCreateEvent from '../../../src/events/guildCreate';

describe('GuildCreateEvent', () => {
    const mockClient = {} as Client;
    const mockGuild = {
        id: '123456789',
        name: 'New Server',
        memberCount: 50,
    } as unknown as Guild;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should have correct event name', () => {
            expect(guildCreateEvent.name).toBe('guildCreate');
        });

        it('should not be a once event', () => {
            expect(guildCreateEvent.once).toBe(false);
        });
    });

    describe('execute()', () => {
        it('should log guild join', async () => {
            await guildCreateEvent.execute(mockClient, mockGuild);

            expect(logger.info).toHaveBeenCalledWith(
                'GuildCreate',
                expect.stringContaining('Joined server: New Server (123456789)')
            );
        });

        it('should log detailed guild event', async () => {
            await guildCreateEvent.execute(mockClient, mockGuild);

            expect(logger.logGuildEventDetailed).toHaveBeenCalledWith('join', mockGuild);
        });

        it('should start setup wizard for new guild', async () => {
            await guildCreateEvent.execute(mockClient, mockGuild);

            expect(mockStartWizard).toHaveBeenCalledWith(mockGuild);
        });
    });
});

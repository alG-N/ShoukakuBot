/**
 * DeathBattle Command Unit Tests
 * Tests for the anime-themed death battle game command
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
    },
}));

// Mock metrics
jest.mock('../../../src/core/metrics', () => ({
    __esModule: true,
    trackCommand: jest.fn(),
    commandsActive: { inc: jest.fn(), dec: jest.fn() },
    commandErrorsTotal: { inc: jest.fn() },
}));

// Mock owner config
jest.mock('../../../src/config/owner', () => ({
    __esModule: true,
    isOwner: jest.fn().mockReturnValue(false),
}));

// Mock cooldown
jest.mock('../../../src/utils/common/cooldown', () => ({
    __esModule: true,
    globalCooldownManager: {
        check: jest.fn().mockResolvedValue({ onCooldown: false }),
        set: jest.fn(),
    },
}));

// Mock constants
jest.mock('../../../src/constants', () => ({
    __esModule: true,
    COLORS: {
        SUCCESS: 0x00ff00,
        WARNING: 0xffff00,
        ERROR: 0xff0000,
        PRIMARY: 0x5865F2,
        INFO: 0x3498db,
    },
    TIMEOUTS: { DEFAULT_COOLDOWN: 3 },
    EMOJIS: {},
}));

// Mock errors
jest.mock('../../../src/errors/index', () => ({
    __esModule: true,
    AppError: class AppError extends Error {},
    ValidationError: class ValidationError extends Error {},
    PermissionError: class PermissionError extends Error {},
}));

// Mock access check
const mockCheckAccess = jest.fn();
jest.mock('../../../src/services/index', () => ({
    __esModule: true,
    checkAccess: mockCheckAccess,
    AccessType: { SUB: 'sub' },
}));

// Mock SkillsetService
const mockIsValidSkillset = jest.fn();
const mockGetAllSkillsets = jest.fn();
jest.mock('../../../src/services/fun/deathbattle/SkillsetService', () => ({
    __esModule: true,
    default: {
        isValidSkillset: mockIsValidSkillset,
        getAllSkillsets: mockGetAllSkillsets,
    },
}));

// Mock BattleService
const mockCreateBattle = jest.fn();
const mockIsBattleActive = jest.fn();
const mockExecuteRound = jest.fn();
const mockEndBattle = jest.fn();
const mockGetBattleHistory = jest.fn();
const mockRemoveBattle = jest.fn();
jest.mock('../../../src/services/fun/deathbattle/BattleService', () => ({
    __esModule: true,
    default: {
        createBattle: mockCreateBattle,
        isBattleActive: mockIsBattleActive,
        executeRound: mockExecuteRound,
        endBattle: mockEndBattle,
        getBattleHistory: mockGetBattleHistory,
        removeBattle: mockRemoveBattle,
    },
}));

// Mock embed builder util
const mockBuildErrorEmbed = jest.fn().mockReturnValue({ data: { description: 'error' } });
const mockBuildCountdownEmbed = jest.fn().mockReturnValue({ data: { description: 'countdown' } });
const mockBuildRoundEmbed = jest.fn().mockReturnValue({ data: { description: 'round' } });
const mockBuildWinnerEmbed = jest.fn().mockReturnValue({
    embed: { data: { description: 'winner' } },
    row: { components: [] },
});
const mockBuildBattleLogEmbed = jest.fn().mockReturnValue({
    embed: { data: { description: 'log' } },
    row: null,
});
jest.mock('../../../src/utils/deathbattle/embedBuilder', () => ({
    __esModule: true,
    default: {
        buildErrorEmbed: mockBuildErrorEmbed,
        buildCountdownEmbed: mockBuildCountdownEmbed,
        buildRoundEmbed: mockBuildRoundEmbed,
        buildWinnerEmbed: mockBuildWinnerEmbed,
        buildBattleLogEmbed: mockBuildBattleLogEmbed,
    },
}));

// Mock deathbattle logger
jest.mock('../../../src/utils/deathbattle/logger', () => ({
    __esModule: true,
    default: {
        log: jest.fn(),
    },
}));

// Mock deathbattle config
jest.mock('../../../src/config/deathbattle/index', () => ({
    __esModule: true,
    default: {
        MAX_HP: 10000,
        DEFAULT_HP: 1000,
        COUNTDOWN_SECONDS: 3,
        ROUND_INTERVAL: 2000,
    },
}));

import deathbattleCommand from '../../../src/commands/fun/deathbattle';

// Helper: create mock interaction
function makeInteraction(overrides: Record<string, any> = {}) {
    const replied = { val: false };
    const deferred = { val: false };

    const mockCollector = {
        on: jest.fn().mockReturnThis(),
    };

    const mockMessage = {
        guild: { id: 'guild1' },
        edit: jest.fn().mockResolvedValue(undefined),
        createMessageComponentCollector: jest.fn().mockReturnValue(mockCollector),
    };

    const mockReply = jest.fn().mockImplementation(async () => {
        replied.val = true;
        return mockMessage;
    });
    const mockEditReply = jest.fn().mockResolvedValue(mockMessage);
    const mockDeferReply = jest.fn().mockImplementation(async () => { deferred.val = true; });

    const optionValues: Record<string, any> = {
        opponent: null,
        skillset: 'jjk',
        your_hp: null,
        opponent_hp: null,
        ...overrides.optionValues,
    };

    return {
        user: { id: 'player1', tag: 'Player1#0001', username: 'Player1' },
        guild: {
            id: 'guild1',
            name: 'Test Guild',
            ownerId: 'owner1',
        },
        guildId: 'guild1',
        client: {
            ws: { ping: 42 },
            guilds: { cache: new Map() },
        },
        options: {
            getSubcommand: jest.fn().mockReturnValue(null),
            getString: jest.fn().mockImplementation((name: string, _required?: boolean) => optionValues[name] ?? null),
            getUser: jest.fn().mockImplementation((name: string) => optionValues[name] ?? null),
            getInteger: jest.fn().mockImplementation((name: string) => optionValues[name] ?? null),
            getChannel: jest.fn().mockReturnValue(null),
            getBoolean: jest.fn().mockReturnValue(null),
        },
        reply: mockReply,
        editReply: mockEditReply,
        deferReply: mockDeferReply,
        followUp: jest.fn().mockResolvedValue(undefined),
        fetchReply: jest.fn().mockResolvedValue(mockMessage),
        get replied() { return replied.val; },
        get deferred() { return deferred.val; },
        isRepliable: jest.fn().mockReturnValue(true),
        isChatInputCommand: jest.fn().mockReturnValue(true),
        commandName: 'deathbattle',
        _mockReply: mockReply,
        _mockEditReply: mockEditReply,
        _mockMessage: mockMessage,
        ...overrides,
    } as any;
}

describe('DeathBattleCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockCheckAccess.mockResolvedValue({ blocked: false });
        mockIsValidSkillset.mockReturnValue(true);
        mockGetAllSkillsets.mockReturnValue(['jjk', 'naruto', 'demonslayer', 'onepiece', 'crossover']);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // --- Metadata ---
    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(deathbattleCommand.data.name).toBe('deathbattle');
        });

        it('should have a description', () => {
            expect(deathbattleCommand.data.description).toBeTruthy();
        });

        it('should be in the FUN category', () => {
            expect((deathbattleCommand as any).category).toBe('fun');
        });

        it('should have 30s cooldown', () => {
            expect((deathbattleCommand as any).cooldown).toBe(30);
        });
    });

    // --- Access Control ---
    describe('access control', () => {
        it('should block access when checkAccess returns blocked', async () => {
            mockCheckAccess.mockResolvedValue({
                blocked: true,
                embed: { data: { description: 'No access' } },
            });

            const interaction = makeInteraction({
                optionValues: {
                    opponent: { id: 'opponent1', username: 'Opponent' },
                    skillset: 'jjk',
                },
            });

            await deathbattleCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            expect(call?.ephemeral).toBe(true);
            expect(call?.embeds).toBeDefined();
        });
    });

    // --- Validation ---
    describe('validation', () => {
        it('should reject if no opponent selected', async () => {
            const interaction = makeInteraction({
                optionValues: { opponent: null, skillset: 'jjk' },
            });

            await deathbattleCommand.run(interaction);

            expect(mockBuildErrorEmbed).toHaveBeenCalledWith(
                expect.stringContaining('select someone')
            );
        });

        it('should reject invalid skillset', async () => {
            mockIsValidSkillset.mockReturnValue(false);
            const interaction = makeInteraction({
                optionValues: {
                    opponent: { id: 'opp1', username: 'Opp' },
                    skillset: 'invalid',
                },
            });

            await deathbattleCommand.run(interaction);

            expect(mockBuildErrorEmbed).toHaveBeenCalledWith(
                expect.stringContaining('skillset')
            );
        });

        it('should reject self-battle', async () => {
            const interaction = makeInteraction({
                optionValues: {
                    opponent: { id: 'player1', username: 'Self' },
                    skillset: 'jjk',
                },
            });

            await deathbattleCommand.run(interaction);

            expect(mockBuildErrorEmbed).toHaveBeenCalledWith(
                expect.stringContaining('yourself')
            );
        });

        it('should reject HP above MAX_HP', async () => {
            const interaction = makeInteraction({
                optionValues: {
                    opponent: { id: 'opp1', username: 'Opp' },
                    skillset: 'jjk',
                    your_hp: 999999,
                },
            });

            await deathbattleCommand.run(interaction);

            expect(mockBuildErrorEmbed).toHaveBeenCalledWith(
                expect.stringContaining('HP')
            );
        });
    });

    // --- Battle Creation ---
    describe('battle creation', () => {
        it('should reject if a battle is already active', async () => {
            mockCreateBattle.mockResolvedValue(null);

            const interaction = makeInteraction({
                optionValues: {
                    opponent: { id: 'opp1', username: 'Opp' },
                    skillset: 'jjk',
                },
            });

            await deathbattleCommand.run(interaction);

            expect(mockBuildErrorEmbed).toHaveBeenCalledWith(
                expect.stringContaining('already in progress')
            );
        });

        it('should create battle with correct parameters', async () => {
            const mockBattle = {
                player1: { id: 'player1' },
                player2: { id: 'opp1' },
                player1Health: 1000,
                player2Health: 1000,
                skillsetName: 'jjk',
            };
            mockCreateBattle.mockResolvedValue(mockBattle);

            const interaction = makeInteraction({
                optionValues: {
                    opponent: { id: 'opp1', username: 'Opp' },
                    skillset: 'jjk',
                },
            });

            await deathbattleCommand.run(interaction);

            expect(mockCreateBattle).toHaveBeenCalledWith(
                'guild1',
                expect.objectContaining({ id: 'player1' }),
                expect.objectContaining({ id: 'opp1' }),
                'jjk',
                1000, // DEFAULT_HP
                1000
            );
        });

        it('should use custom HP values when provided', async () => {
            mockCreateBattle.mockResolvedValue({
                player1: { id: 'player1' },
                player2: { id: 'opp1' },
                player1Health: 5000,
                player2Health: 3000,
            });

            const interaction = makeInteraction({
                optionValues: {
                    opponent: { id: 'opp1', username: 'Opp' },
                    skillset: 'naruto',
                    your_hp: 5000,
                    opponent_hp: 3000,
                },
            });

            await deathbattleCommand.run(interaction);

            expect(mockCreateBattle).toHaveBeenCalledWith(
                'guild1',
                expect.anything(),
                expect.anything(),
                'naruto',
                5000,
                3000
            );
        });

        it('should start countdown after battle creation', async () => {
            mockCreateBattle.mockResolvedValue({
                player1: { id: 'player1' },
                player2: { id: 'opp1' },
                player1Health: 1000,
                player2Health: 1000,
            });

            const interaction = makeInteraction({
                optionValues: {
                    opponent: { id: 'opp1', username: 'Opp' },
                    skillset: 'jjk',
                },
            });

            await deathbattleCommand.run(interaction);

            expect(mockBuildCountdownEmbed).toHaveBeenCalled();
            expect(interaction._mockReply).toHaveBeenCalled();
        });

        it('should default opponent HP to player HP when not specified', async () => {
            mockCreateBattle.mockResolvedValue({
                player1: { id: 'player1' },
                player2: { id: 'opp1' },
                player1Health: 5000,
                player2Health: 5000,
            });

            const interaction = makeInteraction({
                optionValues: {
                    opponent: { id: 'opp1', username: 'Opp' },
                    skillset: 'jjk',
                    your_hp: 5000,
                    opponent_hp: null,
                },
            });

            await deathbattleCommand.run(interaction);

            expect(mockCreateBattle).toHaveBeenCalledWith(
                'guild1',
                expect.anything(),
                expect.anything(),
                'jjk',
                5000,
                5000 // Should default to player1 HP
            );
        });
    });

    // --- Skillset choices ---
    describe('skillset choices', () => {
        it('should have 5 skill set options in data', () => {
            const data = deathbattleCommand.data;
            // Check that string option exists with choices
            const options = (data as any).options;
            const skillsetOption = options?.find?.((o: any) => o.name === 'skillset');
            if (skillsetOption) {
                expect(skillsetOption.choices?.length).toBe(5);
            }
        });
    });
});

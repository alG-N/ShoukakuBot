/**
 * Logger Unit Tests
 * Tests for Logger class — level filtering, formatting, convenience methods, Discord queue cap
 */

import { Logger, LOG_LEVELS, LogLevel, LogFormat, LogMetadata, RequestLogOptions, CommandLogOptions } from '../../../src/core/Logger';

// Spy on console methods
let consoleSpy: Record<string, jest.SpyInstance>;

beforeEach(() => {
    consoleSpy = {
        log: jest.spyOn(console, 'log').mockImplementation(),
        info: jest.spyOn(console, 'info').mockImplementation(),
        warn: jest.spyOn(console, 'warn').mockImplementation(),
        error: jest.spyOn(console, 'error').mockImplementation(),
    };
});

afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
});

describe('LOG_LEVELS', () => {
    it('should define all 6 levels', () => {
        const levels: LogLevel[] = ['DEBUG', 'INFO', 'SUCCESS', 'WARN', 'ERROR', 'CRITICAL'];
        levels.forEach(level => {
            expect(LOG_LEVELS[level]).toBeDefined();
            expect(LOG_LEVELS[level].emoji).toBeTruthy();
            expect(typeof LOG_LEVELS[level].color).toBe('number');
            expect(['log', 'info', 'warn', 'error']).toContain(LOG_LEVELS[level].console);
            expect(typeof LOG_LEVELS[level].priority).toBe('number');
            expect(LOG_LEVELS[level].name).toBeTruthy();
        });
    });

    it('should have ascending priority', () => {
        const ordered: LogLevel[] = ['DEBUG', 'INFO', 'SUCCESS', 'WARN', 'ERROR', 'CRITICAL'];
        for (let i = 1; i < ordered.length; i++) {
            expect(LOG_LEVELS[ordered[i]].priority).toBeGreaterThan(
                LOG_LEVELS[ordered[i - 1]].priority
            );
        }
    });
});

describe('Logger', () => {
    let logger: Logger;

    beforeEach(() => {
        logger = new Logger();
    });

    describe('constructor', () => {
        it('should create a Logger instance with defaults', () => {
            expect(logger).toBeInstanceOf(Logger);
        });
    });

    describe('_shouldLog (via console)', () => {
        it('should log at default level (INFO and above)', () => {
            // Default MIN_LOG_LEVEL is 'INFO' (priority 1)
            logger.console('INFO', 'Test', 'info message');
            expect(consoleSpy.info).toHaveBeenCalled();
        });

        it('should suppress DEBUG when min level is INFO', () => {
            // Default min is INFO, so DEBUG (priority 0) should be suppressed
            logger.console('DEBUG', 'Test', 'debug message');
            expect(consoleSpy.log).not.toHaveBeenCalled();
        });

        it('should log ERROR regardless of min level', () => {
            logger.console('ERROR', 'Test', 'error message');
            expect(consoleSpy.error).toHaveBeenCalled();
        });

        it('should log CRITICAL', () => {
            logger.console('CRITICAL', 'Test', 'critical message');
            expect(consoleSpy.error).toHaveBeenCalled();
        });
    });

    describe('format: text', () => {
        it('should produce text format by default', () => {
            logger.setFormat('text');
            logger.console('INFO', 'Category', 'Hello world');

            expect(consoleSpy.info).toHaveBeenCalledTimes(1);
            const output = consoleSpy.info.mock.calls[0][0];
            expect(output).toContain('[Category]');
            expect(output).toContain('Hello world');
            expect(output).toContain('ℹ️');
        });
    });

    describe('format: json', () => {
        it('should produce JSON structured output', () => {
            logger.setFormat('json');
            logger.console('INFO', 'Category', 'Hello');

            const output = consoleSpy.info.mock.calls[0][0];
            const parsed = JSON.parse(output);

            expect(parsed.level).toBe('info');
            expect(parsed.severity).toBe('INFO');
            expect(parsed.category).toBe('Category');
            expect(parsed.message).toBe('Hello');
            expect(parsed.timestamp).toBeTruthy();
            expect(parsed.service).toBeTruthy();
            expect(parsed.environment).toBe('test');
        });

        it('should include metadata in JSON output', () => {
            logger.setFormat('json');
            logger.console('WARN', 'HTTP', 'Request failed', { userId: 'u1', statusCode: 500 as unknown as string });

            const output = consoleSpy.warn.mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.userId).toBe('u1');
        });
    });

    describe('setFormat()', () => {
        it('should switch format dynamically', () => {
            logger.setFormat('json');
            logger.console('INFO', 'A', 'msg1');
            const json = consoleSpy.info.mock.calls[0][0];
            expect(() => JSON.parse(json)).not.toThrow();

            logger.setFormat('text');
            logger.console('INFO', 'B', 'msg2');
            const text = consoleSpy.info.mock.calls[1][0];
            expect(text).toContain('[B]');
        });
    });

    describe('convenience methods', () => {
        const methods: Array<{ name: keyof Logger; level: LogLevel }> = [
            { name: 'info', level: 'INFO' },
            { name: 'success', level: 'SUCCESS' },
            { name: 'warn', level: 'WARN' },
            { name: 'error', level: 'ERROR' },
            { name: 'critical', level: 'CRITICAL' },
        ];

        methods.forEach(({ name, level }) => {
            it(`${String(name)}() should log at ${level}`, () => {
                (logger[name] as Function)('Cat', `${String(name)} message`);
                const consoleMethod = LOG_LEVELS[level].console;
                expect(consoleSpy[consoleMethod]).toHaveBeenCalled();
            });
        });

        it('debug() should be filtered at default level', () => {
            logger.debug('Cat', 'debug message');
            expect(consoleSpy.log).not.toHaveBeenCalled();
        });
    });

    describe('logRequest()', () => {
        it('should log successful request as INFO', () => {
            logger.setFormat('text');
            logger.logRequest({
                method: 'GET',
                url: '/api/test',
                statusCode: 200,
                duration: 42,
            });

            expect(consoleSpy.info).toHaveBeenCalled();
            const output = consoleSpy.info.mock.calls[0][0];
            expect(output).toContain('GET');
            expect(output).toContain('/api/test');
            expect(output).toContain('200');
            expect(output).toContain('42ms');
        });

        it('should log errored request as ERROR', () => {
            logger.logRequest({
                method: 'POST',
                url: '/api/fail',
                statusCode: 500,
                duration: 123,
                error: new Error('Internal'),
            });

            expect(consoleSpy.error).toHaveBeenCalled();
        });
    });

    describe('logCommand()', () => {
        it('should log successful command as INFO', () => {
            logger.setFormat('text');
            logger.logCommand({
                command: 'play',
                userId: 'u1',
                guildId: 'g1',
                duration: 50,
                success: true,
            });

            expect(consoleSpy.info).toHaveBeenCalled();
            const output = consoleSpy.info.mock.calls[0][0];
            expect(output).toContain('play');
            expect(output).toContain('success');
        });

        it('should log failed command as ERROR', () => {
            logger.logCommand({
                command: 'ban',
                userId: 'u1',
                duration: 100,
                success: false,
                error: new Error('No perms'),
            });

            expect(consoleSpy.error).toHaveBeenCalled();
        });
    });

    describe('Discord queue capping', () => {
        it('should cap discord log queue at MAX_DISCORD_QUEUE_SIZE', async () => {
            // Access the internal queue
            const internalQueue = (logger as unknown as { discordLogQueue: unknown[] }).discordLogQueue;

            // Fill beyond max
            for (let i = 0; i < 110; i++) {
                await logger.discord('INFO', `Title ${i}`, `Desc ${i}`);
            }

            // Queue should not exceed MAX_DISCORD_QUEUE_SIZE (100)
            expect(internalQueue.length).toBeLessThanOrEqual(100);
        });
    });

    describe('log()', () => {
        it('should delegate to console()', () => {
            const spy = jest.spyOn(logger, 'console');
            logger.log('WARN', 'Cat', 'message', { key: 'val' });
            expect(spy).toHaveBeenCalledWith('WARN', 'Cat', 'message', { key: 'val' });
            spy.mockRestore();
        });
    });

    describe('performance()', () => {
        it('should warn for slow operations (>5000ms)', () => {
            logger.performance('slowQuery', 6000);
            expect(consoleSpy.warn).toHaveBeenCalled();
            const output = consoleSpy.warn.mock.calls[0][0];
            expect(output).toContain('Slow operation');
        });

        it('should debug for fast operations', () => {
            // DEBUG is filtered at default level so no output,
            // but we can verify by temporarily lowering the level
            const spy = jest.spyOn(logger, 'debug');
            logger.performance('fastQuery', 50);
            expect(spy).toHaveBeenCalledWith('Performance', 'fastQuery: 50ms', {});
            spy.mockRestore();
        });
    });

    describe('initialize()', () => {
        it('should set client and attempt to fetch log channel', () => {
            const mockClient = {
                channels: {
                    fetch: jest.fn().mockResolvedValue(null),
                },
            } as any;

            logger.initialize(mockClient);
            // Should have tried to fetch the log channel
            expect(mockClient.channels.fetch).toHaveBeenCalled();
        });
    });
});

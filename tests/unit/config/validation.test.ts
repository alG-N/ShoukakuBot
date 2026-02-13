/**
 * Config Validation Unit Tests
 * Tests for environment variable validation at startup
 */

import { validateEnvironment, ValidationResult } from '../../../src/config/validation';

describe('Config Validation', () => {
    // Save original env
    const originalEnv = { ...process.env };

    afterEach(() => {
        // Restore env after each test
        process.env = { ...originalEnv };
    });

    describe('validateEnvironment()', () => {
        it('should pass when all required vars are set', () => {
            process.env.BOT_TOKEN = 'test-token';
            process.env.CLIENT_ID = '123456';
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';

            const result = validateEnvironment();

            expect(result.valid).toBe(true);
            expect(result.missing).toHaveLength(0);
        });

        it('should fail when BOT_TOKEN is missing', () => {
            delete process.env.BOT_TOKEN;
            process.env.CLIENT_ID = '123456';
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';

            const result = validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.missing.some(m => m.name === 'BOT_TOKEN')).toBe(true);
        });

        it('should fail when CLIENT_ID is missing', () => {
            process.env.BOT_TOKEN = 'test-token';
            delete process.env.CLIENT_ID;
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';

            const result = validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.missing.some(m => m.name === 'CLIENT_ID')).toBe(true);
        });

        it('should fail when all database vars are missing', () => {
            process.env.BOT_TOKEN = 'test-token';
            process.env.CLIENT_ID = '123456';
            delete process.env.DB_HOST;
            delete process.env.DB_USER;
            delete process.env.DB_PASSWORD;
            delete process.env.DB_NAME;

            const result = validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.missing.filter(m => m.category === 'database')).toHaveLength(4);
        });

        it('should report all missing required vars at once', () => {
            // Remove ALL required vars
            delete process.env.BOT_TOKEN;
            delete process.env.CLIENT_ID;
            delete process.env.DB_HOST;
            delete process.env.DB_USER;
            delete process.env.DB_PASSWORD;
            delete process.env.DB_NAME;

            const result = validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.missing.length).toBe(6); // All 6 required vars
        });

        it('should treat empty string as missing', () => {
            process.env.BOT_TOKEN = '';
            process.env.CLIENT_ID = '123456';
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';

            const result = validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.missing.some(m => m.name === 'BOT_TOKEN')).toBe(true);
        });

        it('should treat whitespace-only string as missing', () => {
            process.env.BOT_TOKEN = '   ';
            process.env.CLIENT_ID = '123456';
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';

            const result = validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.missing.some(m => m.name === 'BOT_TOKEN')).toBe(true);
        });

        it('should generate warnings for missing optional vars', () => {
            process.env.BOT_TOKEN = 'test-token';
            process.env.CLIENT_ID = '123456';
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';
            // Deliberately don't set optional vars
            delete process.env.REDIS_URL;
            delete process.env.GOOGLE_API_KEY;
            delete process.env.STEAM_API_KEY;

            const result = validateEnvironment();

            expect(result.valid).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should categorize warnings correctly', () => {
            process.env.BOT_TOKEN = 'test-token';
            process.env.CLIENT_ID = '123456';
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';
            delete process.env.REDIS_URL;
            delete process.env.LAVALINK_HOST_1;

            const result = validateEnvironment();

            const dbWarnings = result.warnings.filter(w => w.category === 'database');
            const musicWarnings = result.warnings.filter(w => w.category === 'music');

            // REDIS_URL is database category
            expect(dbWarnings.some(w => w.name === 'REDIS_URL')).toBe(true);
            // LAVALINK_HOST_1 is music category
            expect(musicWarnings.some(w => w.name === 'LAVALINK_HOST_1')).toBe(true);
        });

        it('should include description in missing vars', () => {
            delete process.env.BOT_TOKEN;
            process.env.CLIENT_ID = '123456';
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';

            const result = validateEnvironment();

            const botToken = result.missing.find(m => m.name === 'BOT_TOKEN');
            expect(botToken).toBeDefined();
            expect(botToken!.description).toBe('Discord bot token');
            expect(botToken!.category).toBe('core');
        });

        it('should not warn for optional vars that are set', () => {
            process.env.BOT_TOKEN = 'test-token';
            process.env.CLIENT_ID = '123456';
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';
            process.env.REDIS_URL = 'redis://localhost:6379';
            process.env.GOOGLE_API_KEY = 'key-123';

            const result = validateEnvironment();

            expect(result.warnings.some(w => w.name === 'REDIS_URL')).toBe(false);
            expect(result.warnings.some(w => w.name === 'GOOGLE_API_KEY')).toBe(false);
        });

        it('should return correct ValidationResult shape', () => {
            process.env.BOT_TOKEN = 'test-token';
            process.env.CLIENT_ID = '123456';
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';

            const result = validateEnvironment();

            expect(result).toHaveProperty('valid');
            expect(result).toHaveProperty('missing');
            expect(result).toHaveProperty('warnings');
            expect(Array.isArray(result.missing)).toBe(true);
            expect(Array.isArray(result.warnings)).toBe(true);
        });
    });

    describe('DB_PORT optional behavior', () => {
        it('should not require DB_PORT', () => {
            process.env.BOT_TOKEN = 'test-token';
            process.env.CLIENT_ID = '123456';
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';
            delete process.env.DB_PORT;

            const result = validateEnvironment();

            expect(result.valid).toBe(true);
            // DB_PORT should be in warnings, not missing
            expect(result.missing.some(m => m.name === 'DB_PORT')).toBe(false);
        });
    });

    describe('API key categories', () => {
        it('should list all API keys as optional', () => {
            process.env.BOT_TOKEN = 'test-token';
            process.env.CLIENT_ID = '123456';
            process.env.DB_HOST = 'localhost';
            process.env.DB_USER = 'postgres';
            process.env.DB_PASSWORD = 'secret';
            process.env.DB_NAME = 'altergolden';

            const result = validateEnvironment();

            const apiWarnings = result.warnings.filter(w => w.category === 'api');
            const apiNames = apiWarnings.map(w => w.name);

            // These should all be optional warnings, not fatal
            expect(result.valid).toBe(true);
            // At least some API keys should appear in warnings
            expect(apiWarnings.length).toBeGreaterThan(0);
        });
    });
});

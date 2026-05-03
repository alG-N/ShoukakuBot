/**
 * AppError & Subclass Unit Tests
 * Tests for the base error class and all domain-specific error subclasses
 */

import {
    AppError,
    ValidationError,
    NotFoundError,
    PermissionError,
    RateLimitError,
    ExternalServiceError,
    DatabaseError,
    ConfigurationError,
    TimeoutError,
    CooldownError,
} from '../../../src/errors/appError';
import { MusicError } from '../../../src/errors/MusicError';
import { VideoError } from '../../../src/errors/VideoError';
import { ApiError } from '../../../src/errors/ApiError';

describe('AppError', () => {
    describe('constructor', () => {
        it('should create error with default values', () => {
            const error = new AppError('test message');

            expect(error.message).toBe('test message');
            expect(error.code).toBe('UNKNOWN_ERROR');
            expect(error.statusCode).toBe(500);
            expect(error.isOperational).toBe(true);
            expect(error.name).toBe('AppError');
            expect(error.timestamp).toBeInstanceOf(Date);
        });

        it('should create error with custom values', () => {
            const error = new AppError('custom', 'CUSTOM_CODE', 422, false);

            expect(error.message).toBe('custom');
            expect(error.code).toBe('CUSTOM_CODE');
            expect(error.statusCode).toBe(422);
            expect(error.isOperational).toBe(false);
        });

        it('should be instanceof Error', () => {
            const error = new AppError('test');
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(AppError);
        });

        it('should have a stack trace', () => {
            const error = new AppError('test');
            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('AppError');
        });
    });

    describe('toJSON()', () => {
        it('should serialize error to JSON', () => {
            const error = new AppError('test', 'TEST', 400);
            const json = error.toJSON();

            expect(json.name).toBe('AppError');
            expect(json.message).toBe('test');
            expect(json.code).toBe('TEST');
            expect(json.statusCode).toBe(400);
            expect(json.timestamp).toBeInstanceOf(Date);
        });
    });

    describe('isOperationalError()', () => {
        it('should return true for operational AppError', () => {
            const error = new AppError('operational', 'OP', 400, true);
            expect(AppError.isOperationalError(error)).toBe(true);
        });

        it('should return false for non-operational AppError', () => {
            const error = new AppError('programmer error', 'PE', 500, false);
            expect(AppError.isOperationalError(error)).toBe(false);
        });

        it('should return false for plain Error', () => {
            const error = new Error('plain error');
            expect(AppError.isOperationalError(error)).toBe(false);
        });
    });
});

describe('ValidationError', () => {
    it('should set correct defaults', () => {
        const error = new ValidationError('invalid email');

        expect(error.message).toBe('invalid email');
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.statusCode).toBe(400);
        expect(error.field).toBeNull();
        expect(error.name).toBe('ValidationError');
    });

    it('should include field name', () => {
        const error = new ValidationError('invalid email', 'email');
        expect(error.field).toBe('email');
    });

    it('should serialize field in toJSON()', () => {
        const error = new ValidationError('bad value', 'username');
        const json = error.toJSON();

        expect(json.field).toBe('username');
        expect(json.code).toBe('VALIDATION_ERROR');
    });

    it('should be instanceof AppError', () => {
        const error = new ValidationError('test');
        expect(error).toBeInstanceOf(AppError);
        expect(error).toBeInstanceOf(ValidationError);
    });
});

describe('NotFoundError', () => {
    it('should create with default resource name', () => {
        const error = new NotFoundError();

        expect(error.message).toBe('Resource not found');
        expect(error.code).toBe('NOT_FOUND');
        expect(error.statusCode).toBe(404);
        expect(error.resource).toBe('Resource');
    });

    it('should create with custom resource name', () => {
        const error = new NotFoundError('User');

        expect(error.message).toBe('User not found');
        expect(error.resource).toBe('User');
    });

    it('should serialize resource in toJSON()', () => {
        const error = new NotFoundError('Track');
        expect(error.toJSON().resource).toBe('Track');
    });
});

describe('PermissionError', () => {
    it('should create with default message', () => {
        const error = new PermissionError();

        expect(error.message).toBe('You do not have permission to perform this action');
        expect(error.code).toBe('PERMISSION_DENIED');
        expect(error.statusCode).toBe(403);
    });

    it('should accept custom message', () => {
        const error = new PermissionError('Admin required');
        expect(error.message).toBe('Admin required');
    });
});

describe('RateLimitError', () => {
    it('should create with default retry time', () => {
        const error = new RateLimitError();

        expect(error.message).toContain('60 seconds');
        expect(error.code).toBe('RATE_LIMITED');
        expect(error.statusCode).toBe(429);
        expect(error.retryAfter).toBe(60);
    });

    it('should accept custom retry time', () => {
        const error = new RateLimitError(30);

        expect(error.message).toContain('30 seconds');
        expect(error.retryAfter).toBe(30);
    });

    it('should serialize retryAfter in toJSON()', () => {
        const error = new RateLimitError(10);
        expect(error.toJSON().retryAfter).toBe(10);
    });
});

describe('ExternalServiceError', () => {
    it('should include service name in message', () => {
        const error = new ExternalServiceError('Reddit');

        expect(error.message).toBe('Reddit: External service unavailable');
        expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
        expect(error.statusCode).toBe(503);
        expect(error.service).toBe('Reddit');
    });

    it('should accept custom message', () => {
        const error = new ExternalServiceError('Pixiv', 'Rate limited');
        expect(error.message).toBe('Pixiv: Rate limited');
    });

    it('should serialize service in toJSON()', () => {
        const error = new ExternalServiceError('Steam');
        expect(error.toJSON().service).toBe('Steam');
    });
});

describe('DatabaseError', () => {
    it('should create with default message', () => {
        const error = new DatabaseError();

        expect(error.message).toBe('Database operation failed');
        expect(error.code).toBe('DATABASE_ERROR');
        expect(error.statusCode).toBe(500);
        expect(error.operation).toBeNull();
    });

    it('should include operation name', () => {
        const error = new DatabaseError('Connection lost', 'INSERT');
        expect(error.operation).toBe('INSERT');
    });

    it('should serialize operation in toJSON()', () => {
        const error = new DatabaseError('failed', 'SELECT');
        expect(error.toJSON().operation).toBe('SELECT');
    });
});

describe('ConfigurationError', () => {
    it('should create with non-operational flag', () => {
        const error = new ConfigurationError();

        expect(error.message).toBe('Invalid configuration');
        expect(error.code).toBe('CONFIGURATION_ERROR');
        expect(error.statusCode).toBe(500);
        expect(error.isOperational).toBe(false); // Config errors = programmer errors
    });

    it('should accept custom message', () => {
        const error = new ConfigurationError('Missing API key');
        expect(error.message).toBe('Missing API key');
    });
});

describe('TimeoutError', () => {
    it('should create without timeout value', () => {
        const error = new TimeoutError();

        expect(error.message).toBe('Operation timed out');
        expect(error.code).toBe('TIMEOUT');
        expect(error.statusCode).toBe(408);
        expect(error.timeout).toBeNull();
    });

    it('should include timeout value in message', () => {
        const error = new TimeoutError('Database query', 5000);

        expect(error.message).toBe('Database query timed out after 5000ms');
        expect(error.timeout).toBe(5000);
    });

    it('should serialize timeout in toJSON()', () => {
        const error = new TimeoutError('fetch', 3000);
        expect(error.toJSON().timeout).toBe(3000);
    });
});

describe('CooldownError', () => {
    it('should display seconds from milliseconds', () => {
        const error = new CooldownError(5000);

        expect(error.message).toContain('5 seconds');
        expect(error.code).toBe('COOLDOWN');
        expect(error.statusCode).toBe(429);
        expect(error.remainingMs).toBe(5000);
    });

    it('should ceil partial seconds', () => {
        const error = new CooldownError(1500);
        expect(error.message).toContain('2 seconds');
    });

    it('should serialize remainingMs in toJSON()', () => {
        const error = new CooldownError(3000);
        expect(error.toJSON().remainingMs).toBe(3000);
    });
});

describe('MusicError', () => {
    it('should create with default code', () => {
        const error = new MusicError('No player available');

        expect(error.message).toBe('No player available');
        expect(error.code).toBe('MUSIC_ERROR');
        expect(error.statusCode).toBe(400);
        expect(error.name).toBe('MusicError');
    });

    it('should accept specific music error code', () => {
        const error = new MusicError('Not in voice', 'NO_VOICE_CHANNEL');
        expect(error.code).toBe('NO_VOICE_CHANNEL');
    });

    it('should be instanceof AppError', () => {
        const error = new MusicError('test');
        expect(error).toBeInstanceOf(AppError);
        expect(error).toBeInstanceOf(MusicError);
    });
});

describe('VideoError', () => {
    it('should create with default code', () => {
        const error = new VideoError('Video too long');

        expect(error.message).toBe('Video too long');
        expect(error.code).toBe('VIDEO_ERROR');
        expect(error.statusCode).toBe(400);
        expect(error.name).toBe('VideoError');
    });

    it('should accept specific video error code', () => {
        const error = new VideoError('Not found', 'VIDEO_NOT_FOUND');
        expect(error.code).toBe('VIDEO_NOT_FOUND');
    });

    it('should be instanceof AppError', () => {
        const error = new VideoError('test');
        expect(error).toBeInstanceOf(AppError);
        expect(error).toBeInstanceOf(VideoError);
    });
});

describe('ApiError', () => {
    it('should create with default code', () => {
        const error = new ApiError('API failed');

        expect(error.message).toBe('API failed');
        expect(error.code).toBe('API_ERROR');
        expect(error.statusCode).toBe(400);
        expect(error.service).toBeNull();
        expect(error.name).toBe('ApiError');
    });

    it('should accept service name', () => {
        const error = new ApiError('Rate limited', 'API_RATE_LIMITED', 'Reddit');

        expect(error.code).toBe('API_RATE_LIMITED');
        expect(error.service).toBe('Reddit');
    });

    it('should serialize service in toJSON()', () => {
        const error = new ApiError('fail', 'API_ERROR', 'Steam');
        expect(error.toJSON().service).toBe('Steam');
    });

    it('should be instanceof AppError', () => {
        const error = new ApiError('test');
        expect(error).toBeInstanceOf(AppError);
        expect(error).toBeInstanceOf(ApiError);
    });
});

describe('Error hierarchy — instanceof checks in catch blocks', () => {
    it('should catch MusicError as AppError', () => {
        try {
            throw new MusicError('queue empty', 'EMPTY_QUEUE');
        } catch (e) {
            expect(e).toBeInstanceOf(AppError);
            expect((e as AppError).code).toBe('EMPTY_QUEUE');
        }
    });

    it('should catch ApiError as AppError', () => {
        try {
            throw new ApiError('unavailable', 'API_UNAVAILABLE', 'Pixiv');
        } catch (e) {
            expect(e).toBeInstanceOf(AppError);
            expect((e as ApiError).service).toBe('Pixiv');
        }
    });

    it('should differentiate between error types', () => {
        const errors = [
            new ValidationError('bad input'),
            new MusicError('no player'),
            new ApiError('failed'),
            new VideoError('too long'),
        ];

        expect(errors.filter(e => e instanceof ValidationError)).toHaveLength(1);
        expect(errors.filter(e => e instanceof MusicError)).toHaveLength(1);
        expect(errors.filter(e => e instanceof ApiError)).toHaveLength(1);
        expect(errors.filter(e => e instanceof VideoError)).toHaveLength(1);
        expect(errors.filter(e => e instanceof AppError)).toHaveLength(4); // all are AppError
    });
});

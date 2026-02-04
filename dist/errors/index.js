"use strict";
/**
 * Errors Module
 * Central exports for all error classes
 * @module errors
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = exports.VideoError = exports.MusicError = exports.CooldownError = exports.TimeoutError = exports.ConfigurationError = exports.DatabaseError = exports.ExternalServiceError = exports.RateLimitError = exports.PermissionError = exports.NotFoundError = exports.ValidationError = exports.AppError = void 0;
// Base errors (AppError subclasses)
var AppError_1 = require("./AppError");
Object.defineProperty(exports, "AppError", { enumerable: true, get: function () { return AppError_1.AppError; } });
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return AppError_1.ValidationError; } });
Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function () { return AppError_1.NotFoundError; } });
Object.defineProperty(exports, "PermissionError", { enumerable: true, get: function () { return AppError_1.PermissionError; } });
Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function () { return AppError_1.RateLimitError; } });
Object.defineProperty(exports, "ExternalServiceError", { enumerable: true, get: function () { return AppError_1.ExternalServiceError; } });
Object.defineProperty(exports, "DatabaseError", { enumerable: true, get: function () { return AppError_1.DatabaseError; } });
Object.defineProperty(exports, "ConfigurationError", { enumerable: true, get: function () { return AppError_1.ConfigurationError; } });
Object.defineProperty(exports, "TimeoutError", { enumerable: true, get: function () { return AppError_1.TimeoutError; } });
Object.defineProperty(exports, "CooldownError", { enumerable: true, get: function () { return AppError_1.CooldownError; } });
// Domain base errors (for instanceof checks only)
var MusicError_1 = require("./MusicError");
Object.defineProperty(exports, "MusicError", { enumerable: true, get: function () { return MusicError_1.MusicError; } });
var VideoError_1 = require("./VideoError");
Object.defineProperty(exports, "VideoError", { enumerable: true, get: function () { return VideoError_1.VideoError; } });
var ApiError_1 = require("./ApiError");
Object.defineProperty(exports, "ApiError", { enumerable: true, get: function () { return ApiError_1.ApiError; } });
// CommonJS compatibility - import from .ts files
const AppErrorModule = require('./AppError');
const MusicErrorModule = require('./MusicError');
const VideoErrorModule = require('./VideoError');
const ApiErrorModule = require('./ApiError');
module.exports = {
    // Base errors
    ...AppErrorModule,
    // Domain base errors only (subclasses removed in v8.5)
    MusicError: MusicErrorModule.MusicError,
    VideoError: VideoErrorModule.VideoError,
    ApiError: ApiErrorModule.ApiError,
};
//# sourceMappingURL=index.js.map
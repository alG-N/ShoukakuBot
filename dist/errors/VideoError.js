"use strict";
/**
 * Video-specific Error Classes
 * @module errors/VideoError
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoError = void 0;
const AppError_1 = require("./AppError");
/**
 * Base video error - use only for catch blocks or instanceof checks.
 * For throwing errors, prefer `Result.err(ErrorCodes.XXX)` pattern.
 */
class VideoError extends AppError_1.AppError {
    constructor(message, code = 'VIDEO_ERROR') {
        super(message, code, 400);
    }
}
exports.VideoError = VideoError;
// CommonJS compatibility
module.exports = {
    VideoError,
};
//# sourceMappingURL=VideoError.js.map
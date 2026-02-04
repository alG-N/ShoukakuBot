"use strict";
/**
 * Music-specific Error Classes
 * @module errors/MusicError
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MusicError = void 0;
const AppError_1 = require("./AppError");
/**
 * Base music error - use only for catch blocks or instanceof checks.
 * For throwing errors, prefer `Result.err(ErrorCodes.XXX)` pattern.
 */
class MusicError extends AppError_1.AppError {
    constructor(message, code = 'MUSIC_ERROR') {
        super(message, code, 400);
    }
}
exports.MusicError = MusicError;
// CommonJS compatibility
module.exports = {
    MusicError,
};
//# sourceMappingURL=MusicError.js.map
"use strict";
/**
 * API-specific Error Classes
 * @module errors/ApiError
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = void 0;
const AppError_1 = require("./AppError");
/**
 * Base API error - use only for catch blocks or instanceof checks.
 * For throwing errors, prefer `Result.err(ErrorCodes.XXX)` pattern.
 */
class ApiError extends AppError_1.AppError {
    service;
    constructor(message, code = 'API_ERROR', service = null) {
        super(message, code, 400);
        this.service = service;
    }
    toJSON() {
        return {
            ...super.toJSON(),
            service: this.service,
        };
    }
}
exports.ApiError = ApiError;
// CommonJS compatibility
module.exports = {
    ApiError,
};
//# sourceMappingURL=ApiError.js.map
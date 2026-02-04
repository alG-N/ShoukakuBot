"use strict";
/**
 * Database Module
 * Re-exports from PostgreSQL infrastructure layer
 * @module database
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRows = exports.isReady = exports.initialize = exports.healthCheck = exports.close = exports.transaction = exports.upsert = exports.update = exports.insert = exports.getMany = exports.getOne = exports.query = exports.postgres = exports.PostgresDatabase = exports.validateIdentifier = exports.validateTable = exports.TRANSIENT_ERROR_CODES = exports.ALLOWED_TABLES = exports.isDatabaseReady = exports.initializeDatabase = void 0;
const postgres_js_1 = __importStar(require("./postgres.js"));
exports.postgres = postgres_js_1.default;
// RE-EXPORTS FROM POSTGRES
var postgres_js_2 = require("./postgres.js");
Object.defineProperty(exports, "initializeDatabase", { enumerable: true, get: function () { return postgres_js_2.initializeDatabase; } });
Object.defineProperty(exports, "isDatabaseReady", { enumerable: true, get: function () { return postgres_js_2.isDatabaseReady; } });
Object.defineProperty(exports, "ALLOWED_TABLES", { enumerable: true, get: function () { return postgres_js_2.ALLOWED_TABLES; } });
Object.defineProperty(exports, "TRANSIENT_ERROR_CODES", { enumerable: true, get: function () { return postgres_js_2.TRANSIENT_ERROR_CODES; } });
Object.defineProperty(exports, "validateTable", { enumerable: true, get: function () { return postgres_js_2.validateTable; } });
Object.defineProperty(exports, "validateIdentifier", { enumerable: true, get: function () { return postgres_js_2.validateIdentifier; } });
Object.defineProperty(exports, "PostgresDatabase", { enumerable: true, get: function () { return postgres_js_2.PostgresDatabase; } });
// Convenience exports - proxy to postgres instance methods
exports.query = postgres_js_1.default.query.bind(postgres_js_1.default);
exports.getOne = postgres_js_1.default.getOne.bind(postgres_js_1.default);
exports.getMany = postgres_js_1.default.getMany.bind(postgres_js_1.default);
exports.insert = postgres_js_1.default.insert.bind(postgres_js_1.default);
exports.update = postgres_js_1.default.update.bind(postgres_js_1.default);
exports.upsert = postgres_js_1.default.upsert.bind(postgres_js_1.default);
exports.transaction = postgres_js_1.default.transaction.bind(postgres_js_1.default);
exports.close = postgres_js_1.default.close.bind(postgres_js_1.default);
exports.healthCheck = postgres_js_1.default.healthCheck.bind(postgres_js_1.default);
// Aliases for backward compatibility
exports.initialize = postgres_js_1.initializeDatabase;
exports.isReady = postgres_js_1.isDatabaseReady;
exports.deleteRows = postgres_js_1.default.delete.bind(postgres_js_1.default);
// DEFAULT EXPORT
exports.default = postgres_js_1.default;
//# sourceMappingURL=index.js.map
"use strict";
/**
 * Services Module
 * Business logic services organized by feature
 * @module services
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.snipeService = exports.moderationService = exports.GuildSettingsService = exports.EventRegistry = exports.CommandRegistry = exports.createWarningEmbed = exports.createErrorEmbed = exports.checkMaintenance = exports.checkAccess = exports.AccessType = void 0;
// Core Services
__exportStar(require("./registry/index.js"), exports);
__exportStar(require("./guild/index.js"), exports);
__exportStar(require("./moderation/index.js"), exports);
// Feature Services
__exportStar(require("./music/index.js"), exports);
// Note: video and api services still use JavaScript - import them directly when needed
// export * from './video/index.js';
// export * from './api/index.js';
__exportStar(require("./fun/index.js"), exports);
// Middleware (re-export for convenience)
var access_js_1 = require("../middleware/access.js");
Object.defineProperty(exports, "AccessType", { enumerable: true, get: function () { return access_js_1.AccessType; } });
Object.defineProperty(exports, "checkAccess", { enumerable: true, get: function () { return access_js_1.checkAccess; } });
Object.defineProperty(exports, "checkMaintenance", { enumerable: true, get: function () { return access_js_1.checkMaintenance; } });
Object.defineProperty(exports, "createErrorEmbed", { enumerable: true, get: function () { return access_js_1.createErrorEmbed; } });
Object.defineProperty(exports, "createWarningEmbed", { enumerable: true, get: function () { return access_js_1.createWarningEmbed; } });
// Named imports for direct access
const index_js_1 = require("./registry/index.js");
Object.defineProperty(exports, "CommandRegistry", { enumerable: true, get: function () { return index_js_1.CommandRegistry; } });
Object.defineProperty(exports, "EventRegistry", { enumerable: true, get: function () { return index_js_1.EventRegistry; } });
const index_js_2 = require("./guild/index.js");
Object.defineProperty(exports, "GuildSettingsService", { enumerable: true, get: function () { return index_js_2.GuildSettingsService; } });
const index_js_3 = require("./moderation/index.js");
Object.defineProperty(exports, "moderationService", { enumerable: true, get: function () { return index_js_3.moderationService; } });
Object.defineProperty(exports, "snipeService", { enumerable: true, get: function () { return index_js_3.snipeService; } });
//# sourceMappingURL=index.js.map
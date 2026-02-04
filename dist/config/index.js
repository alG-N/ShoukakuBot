"use strict";
/**
 * alterGolden Configuration Module
 * Central export for all configuration files
 * @module config
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
exports.lavalink = exports.video = exports.music = exports.features = exports.services = exports.database = exports.maintenance = exports.owner = exports.bot = void 0;
// Core configs
const bot = __importStar(require("./bot.js"));
exports.bot = bot;
const owner = __importStar(require("./owner.js"));
exports.owner = owner;
const maintenance = __importStar(require("./maintenance.js"));
exports.maintenance = maintenance;
// Infrastructure configs
const database = __importStar(require("./database.js"));
exports.database = database;
const services = __importStar(require("./services.js"));
exports.services = services;
// Feature configs
const features = __importStar(require("./features/index.js"));
exports.features = features;
// Direct exports for convenience
exports.music = features.music, exports.video = features.video, exports.lavalink = features.lavalink;
exports.default = {
    // Core
    bot,
    owner,
    maintenance,
    // Infrastructure
    database,
    services,
    // Features namespace
    features,
    // Direct feature access
    music: features.music,
    video: features.video,
    lavalink: features.lavalink
};
//# sourceMappingURL=index.js.map
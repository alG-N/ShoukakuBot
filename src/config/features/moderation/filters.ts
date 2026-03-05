/**
 * Word Filter Configuration
 * Bad word filtering settings and default patterns
 * @module config/features/moderation/filters
 */
import type { FiltersConfig } from '../../../types/config/moderation.js';

export { type FiltersConfig } from '../../../types/config/moderation.js';
// CONFIG
const filtersConfig: FiltersConfig = {
    // FILTER SETTINGS
    settings: {
        defaultAction: 'delete_warn',
        ignoreCase: true,
        normalizeUnicode: true,
        checkLeetspeak: true,
        stripZalgo: true,
        minWordLength: 2,
        logContent: false,
        logChannel: null
    },
    // MATCH TYPES
    matchTypes: {
        EXACT: 'exact',
        CONTAINS: 'contains',
        WORD: 'word',
        REGEX: 'regex'
    },
    // SEVERITY LEVELS
    severityLevels: {
        1: { name: 'Low', action: 'delete', color: 0xFFFF00 },
        2: { name: 'Medium', action: 'delete_warn', color: 0xFFA500 },
        3: { name: 'High', action: 'delete_warn', color: 0xFF6600 },
        4: { name: 'Severe', action: 'mute', color: 0xFF3300 },
        5: { name: 'Critical', action: 'ban', color: 0xFF0000 }
    },
    // LEETSPEAK SUBSTITUTIONS
    leetspeak: {
        '4': 'a',
        '@': 'a',
        '8': 'b',
        '3': 'e',
        '€': 'e',
        '6': 'g',
        '9': 'g',
        '1': 'i',
        '!': 'i',
        '|': 'i',
        '0': 'o',
        '5': 's',
        '$': 's',
        '7': 't',
        '+': 't',
        '2': 'z'
    },
    // UNICODE NORMALIZATION MAP (Vietnamese, etc.)
    unicodeMap: {
        // Vietnamese
        'đ': 'd', 'Đ': 'd',
        'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
        'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
        'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
        'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
        'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
        'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
        'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
        'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
        'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
        'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
        'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
        'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
        
        // Common accents
        'ñ': 'n', 'ç': 'c', 'ß': 'ss',
        
        // Greek lookalikes
        'α': 'a', 'β': 'b', 'ε': 'e', 'η': 'n', 'ι': 'i',
        'κ': 'k', 'ν': 'n', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u',
        
        // Cyrillic lookalikes  
        'а': 'a', 'в': 'b', 'с': 'c', 'е': 'e', 'н': 'h',
        'к': 'k', 'м': 'm', 'о': 'o', 'р': 'p', 'т': 't', 'х': 'x', 'у': 'y'
    },
    // ZALGO TEXT REGEX
    zalgoPattern: /[\u0300-\u036f\u0489]/g,
    // DEFAULT FILTER PRESETS (can be imported by guilds)
    presets: {
        english_basic: {
            name: 'English Basic',
            description: 'Common English profanity',
            words: []
        },
        
        vietnamese_basic: {
            name: 'Vietnamese Basic', 
            description: 'Common Vietnamese profanity',
            words: []
        },
        
        slurs: {
            name: 'Slurs & Hate Speech',
            description: 'Racial slurs and hate speech',
            severity: 5,
            words: []
        },
        
        scam: {
            name: 'Scam Keywords',
            description: 'Common scam and phishing terms',
            words: [
                { pattern: 'free nitro', matchType: 'contains', severity: 4 },
                { pattern: 'claim your prize', matchType: 'contains', severity: 4 },
                { pattern: 'steam gift', matchType: 'contains', severity: 3 },
                { pattern: 'click here to claim', matchType: 'contains', severity: 4 }
            ]
        }
    },
    // EXEMPT PATTERNS (never filter these)
    exemptPatterns: [
        /https?:\/\/\S+/gi,
        /```[\s\S]*?```/g,
        /`[^`]+`/g
    ],
    // FILTER BYPASS
    bypass: {
        roles: [],
        channels: [],
        users: []
    }
};

export default filtersConfig;




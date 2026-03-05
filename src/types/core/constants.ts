import type { COLORS, COOLDOWNS, EMOJIS } from '../../constants.js';

export type ColorKey = keyof typeof COLORS;
export type ColorValue = typeof COLORS[ColorKey];

export type CooldownCategory = keyof typeof COOLDOWNS;

export type EmojiKey = keyof typeof EMOJIS;

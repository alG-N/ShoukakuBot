import type {
    ActionRowBuilder,
    ButtonBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    User
} from 'discord.js';
import type { Battle, BattleHistoryEntry } from '../../../services/fun/deathbattle/battleService.js';

export interface BattleRoundResult {
    attacker: User;
    defender: User;
    damage: number;
    skill: string;
    effectLogs?: string[];
    historyEntry?: BattleHistoryEntry;
}

export type SkillsetService = {
    isValidSkillset: (name: string) => boolean;
    getAllSkillsets: () => string[];
};

export type BattleService = {
    createBattle: (guildId: string, p1: User, p2: User, skillset: string, hp1: number, hp2: number) => Promise<Battle | null>;
    isBattleActive: (guildId: string) => Promise<boolean>;
    executeRound: (battle: Battle) => BattleRoundResult;
    endBattle: (battleId: string) => Promise<void>;
    getBattleHistory: (guildId: string) => Promise<BattleHistoryEntry[] | null>;
    removeBattle: (guildId: string) => Promise<void>;
};

export type EmbedBuilderService = {
    buildErrorEmbed: (msg: string) => EmbedBuilder;
    buildCountdownEmbed: (battle: Battle, count: number) => EmbedBuilder;
    buildRoundEmbed: (battle: Battle, result: BattleRoundResult) => EmbedBuilder;
    buildWinnerEmbed: (battle: Battle) => { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> };
    buildBattleLogEmbed: (battle: Battle, history: BattleHistoryEntry[], page?: number) => { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> | null };
};

export type LoggerService = {
    log: (msg: string, interaction?: ChatInputCommandInteraction) => void;
};

export interface DeathBattleConfig {
    MAX_HP?: number;
    DEFAULT_HP?: number;
    COUNTDOWN_SECONDS?: number;
    ROUND_INTERVAL?: number;
}
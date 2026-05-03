import type { User } from 'discord.js';
import type { BattleHistoryEntry } from './battle.js';

export interface Player {
    username: string;
}

export interface BattleSkillset {
    displayName: string;
    thumbnail: string;
}

export interface BattleState {
    skillset?: BattleSkillset;
    skillsetName?: string;
    player1: Player | User;
    player2: Player | User;
    player1Health: number;
    player2Health: number;
    player1MaxHp?: number;
    player2MaxHp?: number;
    battleLog: string;
    roundCount?: number;
}

export interface RoundResult {
    attacker: Player | User;
    defender: Player | User;
    damage: number;
    skill: string;
    effectLogs?: string[];
    historyEntry?: BattleHistoryEntry;
}
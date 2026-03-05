import type { User } from 'discord.js';
import type { Skillset } from '../../services/fun/deathbattle/SkillsetService.js';

export interface NamedEffect {
    name: string;
    turns: number;
    value: number;
    source?: string;
}

export interface BattleEffects {
    shrine: number;
    speech: number;
    speechTurns: number;
    binding: boolean;
    burn: number;
    slow: number;
    lightning: number;
    bleed: number;
    poison: number;
    poisonWeaken: number;
    constrict: number;
    constrictDmg: number;
    dodge: number;
    reflect: boolean;
    frozen: number;
    markBoost: number;
    critNext: boolean;
    burnStacks: number;
    momentum: number;
    berserk: boolean;
    speedBoost: number;
    foresight: number;
    transform: number;
    transformBoost: number;
    ghostMode: boolean;
    revive?: boolean;
    illusionCopy?: number;
    trapped?: number;
    waterPrison?: number;
    redirect?: boolean;
    stunned?: number;
    dot?: number;
    dotDmg?: number;
    debuff?: number;
    debuffTurns?: number;
    slowed?: number;
    slowAmount?: number;
    buff?: number;
    buffTurns?: number;
    namedDots: NamedEffect[];
    namedDebuffs: NamedEffect[];
    namedBuffs: NamedEffect[];
    armor: number;
    armorSource?: string;
    [key: string]: number | boolean | undefined | NamedEffect[] | string;
}

export interface BattleHistoryEntry {
    round: number;
    attacker: string;
    action: string;
    baseDamage: number;
    finalDamage: number;
    modifiers: string[];
    effectsApplied: string[];
    p1HpAfter: number;
    p2HpAfter: number;
}

export interface Battle {
    player1: User;
    player2: User;
    skillsetName: string;
    skillset: Skillset | undefined;
    player1Health: number;
    player2Health: number;
    player1MaxHp: number;
    player2MaxHp: number;
    roundCount: number;
    player1Stunned: boolean;
    player2Stunned: boolean;
    player1Immune: boolean;
    player2Immune: boolean;
    usedPowers: string[];
    effects: {
        user1: BattleEffects;
        user2: BattleEffects;
    };
    lastDamageDealt: { user1: number; user2: number };
    battleLog: string;
    interval: NodeJS.Timeout | null;
    revivedOnce: { user1: boolean; user2: boolean };
    history: BattleHistoryEntry[];
}

/**
 * Battle Service for Death Battle
 * Manages combat mechanics and state
 * @module services/fun/deathbattle/BattleService
 */

import type { User } from 'discord.js';
import skillsetService from './SkillsetService.js';
import type { Power, Skillset } from './SkillsetService.js';
import cacheService from '../../../cache/CacheService.js';

// NAMED EFFECT - tracks DoT/debuff with source name
export interface NamedEffect {
    name: string;       // e.g., "Amaterasu", "Wisteria Venom"
    turns: number;      // remaining turns
    value: number;      // damage per turn or debuff multiplier
    source?: string;    // character who applied it
}

// TYPES
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
    // New effects for JJK skillset types
    stunned?: number;
    dot?: number;
    dotDmg?: number;
    debuff?: number;
    debuffTurns?: number;
    slowed?: number;
    slowAmount?: number;
    buff?: number;
    buffTurns?: number;
    // Named effects for detailed tracking
    namedDots: NamedEffect[];
    namedDebuffs: NamedEffect[];
    namedBuffs: NamedEffect[];
    armor: number;          // Damage reduction multiplier (1.0 = no reduction)
    armorSource?: string;   // Source of armor
    [key: string]: number | boolean | undefined | NamedEffect[] | string; // Allow dynamic charge tracking
}

// Battle history entry for logs
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
    // New: Battle history for detailed logs
    history: BattleHistoryEntry[];
}
// DEFAULT EFFECTS
const createDefaultEffects = (): BattleEffects => ({
    shrine: 0,
    speech: 1,
    speechTurns: 0,
    binding: false,
    burn: 0,
    slow: 0,
    lightning: 0,
    bleed: 0,
    poison: 0,
    poisonWeaken: 1,
    constrict: 0,
    constrictDmg: 0,
    dodge: 0,
    reflect: false,
    frozen: 0,
    markBoost: 1,
    critNext: false,
    burnStacks: 0,
    momentum: 0,
    berserk: false,
    speedBoost: 1,
    foresight: 0,
    transform: 0,
    transformBoost: 1,
    ghostMode: false,
    // Named effect arrays
    namedDots: [],
    namedDebuffs: [],
    namedBuffs: [],
    armor: 1.0,
});
// Battle lock TTL: 10 minutes max (battles should never last this long)
const BATTLE_LOCK_TTL = 600;

// BATTLE SERVICE CLASS
class BattleService {
    private activeBattles: Map<string, Battle> = new Map();

    /**
     * Check if a battle is already active in a guild (checks both local Map and Redis lock)
     */
    async isBattleActive(guildId: string): Promise<boolean> {
        // Fast path: check local Map first
        if (this.activeBattles.has(guildId)) return true;

        // Cross-shard check: Redis lock
        try {
            const lock = await cacheService.peek('temp', `battle:active:${guildId}`);
            return lock !== null && lock !== undefined;
        } catch {
            // Redis unavailable — fall back to local-only check
            return false;
        }
    }

    /**
     * Create a new battle between two players.
     * Returns null if a battle is already active in this guild.
     */
    async createBattle(
        guildId: string,
        player1: User,
        player2: User,
        skillsetName: string,
        player1Hp: number,
        player2Hp: number
    ): Promise<Battle | null> {
        // Prevent duplicate battles (local + cross-shard)
        if (await this.isBattleActive(guildId)) {
            return null;
        }

        const skillset = skillsetService.getSkillset(skillsetName);

        const battle: Battle = {
            player1,
            player2,
            skillsetName,
            skillset,
            player1Health: player1Hp,
            player2Health: player2Hp,
            player1MaxHp: player1Hp,
            player2MaxHp: player2Hp,
            roundCount: 1,
            player1Stunned: false,
            player2Stunned: false,
            player1Immune: false,
            player2Immune: false,
            usedPowers: [],
            effects: {
                user1: createDefaultEffects(),
                user2: createDefaultEffects(),
            },
            lastDamageDealt: { user1: 0, user2: 0 },
            battleLog: '',
            interval: null,
            revivedOnce: { user1: false, user2: false },
            history: [],
        };

        this.activeBattles.set(guildId, battle);

        // Set Redis lock for cross-shard awareness
        try {
            await cacheService.set('temp', `battle:active:${guildId}`, true, BATTLE_LOCK_TTL);
        } catch {
            // Redis unavailable — local Map is still set, continue normally
        }

        return battle;
    }

    /**
     * Get an active battle by guild ID
     */
    getBattle(guildId: string): Battle | undefined {
        return this.activeBattles.get(guildId);
    }

    /**
     * Get battle history by guild ID (from Redis/cache)
     */
    async getBattleHistory(guildId: string): Promise<BattleHistoryEntry[] | null> {
        return cacheService.peek<BattleHistoryEntry[]>('temp', `battle:history:${guildId}`);
    }

    /**
     * Save battle history when battle ends (to Redis/cache with 10min TTL)
     */
    async saveBattleHistory(guildId: string, history: BattleHistoryEntry[]): Promise<void> {
        await cacheService.set('temp', `battle:history:${guildId}`, history, 600); // 10 min TTL
    }

    /**
     * Remove a battle and clear its interval + Redis lock
     */
    async removeBattle(guildId: string): Promise<void> {
        const battle = this.activeBattles.get(guildId);
        if (battle?.interval) {
            clearInterval(battle.interval);
        }
        // Save history before removing
        if (battle?.history && battle.history.length > 0) {
            await this.saveBattleHistory(guildId, battle.history);
        }
        this.activeBattles.delete(guildId);

        // Clear Redis lock for cross-shard awareness
        try {
            await cacheService.delete('temp', `battle:active:${guildId}`);
        } catch {
            // Redis unavailable — lock will expire via TTL
        }
    }

    /**
     * Calculate damage based on HP scaling (LOWERED for longer battles)
     * Returns both final damage and breakdown string
     */
    calculateDamageWithBreakdown(
        base: number, 
        hp: number, 
        modifiers: { name: string; value: number }[] = []
    ): { damage: number; breakdown: string; modifiersList: string[] } {
        // HP-based scaling (lowered)
        let scale = 1;
        if (hp > 1000000) scale = 2.5;      // Was 3.5
        else if (hp > 100000) scale = 1.8;   // Was 2.5
        else if (hp > 10000) scale = 1.3;    // Was 1.7
        else if (hp > 1000) scale = 1.0;     // Was 1.2
        else if (hp > 100) scale = 0.8;      // Was 1.0
        else scale = 0.6;                    // Was 0.7
        
        const scaledBase = Math.floor(base * scale);
        let finalDamage = scaledBase;
        const modifiersList: string[] = [];
        
        // Apply all modifiers
        for (const mod of modifiers) {
            if (mod.value !== 1) {
                const change = Math.floor(scaledBase * (mod.value - 1));
                finalDamage = Math.floor(finalDamage * mod.value);
                if (mod.value > 1) {
                    modifiersList.push(`+${Math.round((mod.value - 1) * 100)}% ${mod.name}`);
                } else {
                    modifiersList.push(`${Math.round((mod.value - 1) * 100)}% ${mod.name}`);
                }
            }
        }
        
        // Build breakdown string
        let breakdown = `**${finalDamage}**`;
        if (modifiersList.length > 0) {
            breakdown = `**${finalDamage}** (${scaledBase} base ${modifiersList.join(', ')})`;
        }
        
        return { damage: Math.max(1, finalDamage), breakdown, modifiersList };
    }

    /**
     * Process a turn and deal damage
     */
    dealDamage(battle: Battle, isPlayer1Turn: boolean): { log: string; historyEntry: Partial<BattleHistoryEntry> } {
        const attacker = isPlayer1Turn ? battle.player1 : battle.player2;
        const defender = isPlayer1Turn ? battle.player2 : battle.player1;
        const defenderHp = isPlayer1Turn ? battle.player2Health : battle.player1Health;
        const attackerMaxHp = isPlayer1Turn ? battle.player1MaxHp : battle.player2MaxHp;
        const defenderMaxHp = isPlayer1Turn ? battle.player1MaxHp : battle.player2MaxHp;

        let log = '';
        let damage = 0;
        const modifiers: string[] = [];
        const atkEff = isPlayer1Turn ? battle.effects.user1 : battle.effects.user2;
        const defEff = isPlayer1Turn ? battle.effects.user2 : battle.effects.user1;

        // Dodge check
        if (defEff.dodge > 0) {
            defEff.dodge--;
            return { 
                log: `🏃 ${defender.username} dodged ${attacker.username}'s attack with perfect evasion!`,
                historyEntry: { action: 'Dodged', baseDamage: 0, finalDamage: 0, modifiers: ['Dodge'] }
            };
        }

        // Foresight check
        if (defEff.foresight > 0 && Math.random() < 0.6) {
            defEff.foresight--;
            return { 
                log: `👁️ ${defender.username} saw the future and avoided ${attacker.username}'s attack!`,
                historyEntry: { action: 'Foresight Dodge', baseDamage: 0, finalDamage: 0, modifiers: ['Foresight'] }
            };
        }

        // Build modifier list for damage calculation
        const modifierList: { name: string; value: number }[] = [];
        
        if (atkEff.binding) modifierList.push({ name: 'Binding', value: 1.3 });
        if (atkEff.speech !== 1) modifierList.push({ name: 'Cursed Speech', value: atkEff.speech });
        if (atkEff.poisonWeaken !== 1) modifierList.push({ name: 'Poison Debuff', value: atkEff.poisonWeaken });
        if (atkEff.speedBoost !== 1) modifierList.push({ name: 'Speed', value: atkEff.speedBoost });
        if (atkEff.markBoost !== 1) modifierList.push({ name: 'Mark', value: atkEff.markBoost });
        if (atkEff.transform > 0) modifierList.push({ name: 'Transform', value: atkEff.transformBoost });
        if (atkEff.berserk) modifierList.push({ name: 'Berserk', value: 1.5 });
        if (atkEff.buff && atkEff.buffTurns && atkEff.buffTurns > 0) {
            modifierList.push({ name: 'Buff', value: atkEff.buff as number });
        }
        if (atkEff.slowed && atkEff.slowed > 0) {
            modifierList.push({ name: 'Slowed', value: atkEff.slowAmount || 0.7 });
        }
        if (atkEff.debuff && atkEff.debuffTurns && atkEff.debuffTurns > 0) {
            modifierList.push({ name: 'Debuffed', value: atkEff.debuff as number });
        }
        // Apply defender's armor
        if (defEff.armor && defEff.armor !== 1) {
            modifierList.push({ name: defEff.armorSource || 'Armor', value: defEff.armor });
        }

        // Get random power
        const power = skillsetService.getRandomPower(battle.skillsetName, battle.usedPowers);
        let baseDamage = 0;
        
        if (!power) {
            baseDamage = Math.floor(defenderMaxHp * 0.06) + 8; // Lowered from 0.10
            const result = this.calculateDamageWithBreakdown(baseDamage, defenderMaxHp, modifierList);
            damage = result.damage;
            log = `${attacker.username} used a basic attack for ${result.breakdown} damage!`;
            modifiers.push(...result.modifiersList);
        } else {
            [damage, log, baseDamage] = this.processPowerWithBreakdown(
                power, attacker, defender, battle,
                defenderHp, attackerMaxHp, defenderMaxHp,
                modifierList, atkEff, defEff, isPlayer1Turn
            );
        }

        // Handle reflect
        if (defEff.reflect && damage > 0) {
            const reflectDmg = Math.floor(damage * 0.5);
            if (isPlayer1Turn) battle.player1Health = Math.max(0, battle.player1Health - reflectDmg);
            else battle.player2Health = Math.max(0, battle.player2Health - reflectDmg);
            log += ` ⚡ **${reflectDmg}** reflected!`;
            defEff.reflect = false;
            modifiers.push(`Reflected ${reflectDmg}`);
        }

        // Handle redirect
        if (defEff.redirect && damage > 0) {
            const redirectDmg = Math.floor(damage * 0.5);
            if (isPlayer1Turn) battle.player1Health = Math.max(0, battle.player1Health - redirectDmg);
            else battle.player2Health = Math.max(0, battle.player2Health - redirectDmg);
            log += ` 🔄 **${redirectDmg}** redirected!`;
            defEff.redirect = false;
            modifiers.push(`Redirected ${redirectDmg}`);
        }

        // Apply damage
        if (isPlayer1Turn) {
            battle.player2Health = Math.max(0, battle.player2Health - damage);
            battle.lastDamageDealt.user1 = damage;
        } else {
            battle.player1Health = Math.max(0, battle.player1Health - damage);
            battle.lastDamageDealt.user2 = damage;
        }

        // Build history entry
        const historyEntry: BattleHistoryEntry = {
            round: battle.roundCount,
            attacker: attacker.username,
            action: power?.name || 'Basic Attack',
            baseDamage: baseDamage,
            finalDamage: damage,
            modifiers: modifiers,
            effectsApplied: [],
            p1HpAfter: battle.player1Health,
            p2HpAfter: battle.player2Health
        };

        return { log, historyEntry };
    }

    /**
     * Process a power with damage breakdown (shows modifiers in the log)
     */
    private processPowerWithBreakdown(
        power: Power,
        attacker: User,
        defender: User,
        battle: Battle,
        defenderHp: number,
        attackerMaxHp: number,
        defenderMaxHp: number,
        modifierList: { name: string; value: number }[],
        atkEff: BattleEffects,
        defEff: BattleEffects,
        isPlayer1Turn: boolean
    ): [number, string, number] {
        let damage = 0;
        let baseDamage = 0;
        let log = '';

        // Helper to calculate with breakdown
        const calcWithBreakdown = (base: number): { damage: number; breakdown: string } => {
            baseDamage = base;
            return this.calculateDamageWithBreakdown(base, defenderMaxHp, modifierList);
        };

        switch (power.type) {
            case 'combo': {
                baseDamage = Math.floor(defenderMaxHp * (power.scale || 0.04)) + 8;
                for (let i = 0; i < (power.hits || 1); i++) {
                    damage += this.calculateDamageWithBreakdown(baseDamage, defenderMaxHp, modifierList).damage;
                }
                log = `${attacker.username} used **${power.desc}** hitting ${power.hits}x for **${damage}** total damage!`;
                break;
            }

            case 'execute': {
                const hpPercent = defenderHp / defenderMaxHp;
                if (hpPercent <= (power.threshold || 0.2)) {
                    damage = Math.floor(defenderHp * 0.9);
                    baseDamage = damage;
                    log = `💀 ${attacker.username} **EXECUTED** with ${power.desc} for **${damage}** damage!`;
                } else {
                    const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 12);
                    damage = result.damage;
                    log = `${attacker.username} used ${power.desc} for ${result.breakdown} damage (execute failed)!`;
                }
                break;
            }

            case 'bleed': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.05)) + 8);
                damage = result.damage;
                defEff.bleed = power.turns || 3;
                // Add named DoT
                defEff.namedDots.push({
                    name: power.effectName || 'Bleeding',
                    turns: power.turns || 3,
                    value: Math.floor(defenderMaxHp * 0.04),
                    source: attacker.username
                });
                log = `🩸 ${attacker.username} used **${power.desc}**, dealing ${result.breakdown} + **${power.effectName || 'Bleeding'}** (${power.turns} turns)!`;
                break;
            }

            case 'poison_weaken': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.04)) + 6);
                damage = result.damage;
                defEff.poison = power.turns || 3;
                defEff.poisonWeaken = 1 - (power.weaken || 0.2);
                defEff.namedDots.push({
                    name: power.effectName || 'Poison',
                    turns: power.turns || 3,
                    value: Math.floor(defenderMaxHp * 0.03),
                    source: attacker.username
                });
                defEff.namedDebuffs.push({
                    name: `${power.effectName || 'Poison'} Weaken`,
                    turns: power.turns || 3,
                    value: power.weaken || 0.2,
                    source: attacker.username
                });
                log = `☠️ ${attacker.username} used **${power.desc}**, dealing ${result.breakdown} + **-${Math.floor((power.weaken || 0.2) * 100)}% Weakened**!`;
                break;
            }

            case 'momentum': {
                const momentumBonus = atkEff.momentum * (power.bonus || 0.02);
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * ((power.scale || 0.05) + momentumBonus)) + 12);
                damage = result.damage;
                atkEff.momentum++;
                log = `🔥 ${attacker.username} used **${power.desc}** [Momentum x${atkEff.momentum}] for ${result.breakdown} damage!`;
                break;
            }

            case 'revive': {
                atkEff.revive = true;
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.05)) + 8);
                damage = result.damage;
                log = `✨ ${attacker.username} activated **${power.desc}**! Will revive with ${Math.floor((power.scale || 0.25) * 100)}% HP! Dealt ${result.breakdown}!`;
                break;
            }

            case 'dodge':
                atkEff.dodge = power.turns || 2;
                log = `🏃 ${attacker.username} used **${power.desc}**! Dodging next ${power.turns} attacks!`;
                break;

            case 'lifesteal': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 10);
                damage = result.damage;
                const stolen = Math.floor(damage * (power.steal || 0.3));
                if (isPlayer1Turn) battle.player1Health = Math.min(battle.player1Health + stolen, battle.player1MaxHp);
                else battle.player2Health = Math.min(battle.player2Health + stolen, battle.player2MaxHp);
                log = `🧛 ${attacker.username} used **${power.desc}**, dealing ${result.breakdown} + stealing **${stolen}** HP!`;
                break;
            }

            case 'constrict': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.05)) + 8);
                damage = result.damage;
                defEff.constrict = power.turns || 3;
                defEff.constrictDmg = Math.floor(defenderMaxHp * 0.04);
                defEff.namedDots.push({
                    name: power.effectName || 'Constriction',
                    turns: power.turns || 3,
                    value: defEff.constrictDmg,
                    source: attacker.username
                });
                log = `🐍 ${attacker.username} used **${power.desc}**, dealing ${result.breakdown} + **${power.effectName || 'Constrict'}** (${power.turns} turns)!`;
                break;
            }

            case 'echo': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 10);
                const lastDmg = isPlayer1Turn ? battle.lastDamageDealt.user1 : battle.lastDamageDealt.user2;
                const echoDmg = Math.floor(lastDmg * 0.5);
                damage = result.damage + echoDmg;
                log = `📢 ${attacker.username} used **${power.desc}**, dealing ${result.breakdown} + **${echoDmg}** echo damage!`;
                break;
            }

            case 'reflect': {
                atkEff.reflect = true;
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.04)) + 6);
                damage = result.damage;
                log = `🛡️ ${attacker.username} used **${power.desc}**! Next attack reflects 50%! Dealt ${result.breakdown}!`;
                break;
            }

            case 'berserk': {
                atkEff.berserk = true;
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.07)) + 12);
                damage = result.damage;
                const recoil = Math.floor(attackerMaxHp * (power.recoil || 0.1));
                if (isPlayer1Turn) battle.player1Health = Math.max(0, battle.player1Health - recoil);
                else battle.player2Health = Math.max(0, battle.player2Health - recoil);
                log = `😤 ${attacker.username} went **BERSERK** with ${power.desc}! Dealt ${result.breakdown} but took **${recoil}** self-damage!`;
                break;
            }

            case 'detonate': {
                const burnDmg = (defEff.burnStacks || 0) * Math.floor(defenderMaxHp * 0.03);
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 12);
                damage = result.damage + burnDmg;
                defEff.burnStacks = 0;
                log = `💥 ${attacker.username} used **${power.desc}**, detonating for ${result.breakdown} + **${burnDmg}** burn damage!`;
                break;
            }

            case 'piercing': {
                const pierceMod = [...modifierList, { name: 'Pierce', value: 1 + (power.ignore || 0.3) }];
                const result = this.calculateDamageWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 12, defenderMaxHp, pierceMod);
                damage = result.damage;
                baseDamage = Math.floor(defenderMaxHp * (power.scale || 0.06)) + 12;
                log = `🗡️ ${attacker.username} used **${power.desc}**, piercing for ${result.breakdown} damage!`;
                break;
            }

            case 'counter': {
                const counterDmg = isPlayer1Turn ? battle.lastDamageDealt.user2 : battle.lastDamageDealt.user1;
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.04)) + counterDmg);
                damage = result.damage;
                log = `⚔️ ${attacker.username} **COUNTERED** with ${power.desc} for ${result.breakdown} damage!`;
                break;
            }

            case 'freeze': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.damage || 0.05)) + 8);
                damage = result.damage;
                defEff.frozen = power.turns || 2;
                defEff.namedDebuffs.push({
                    name: power.effectName || 'Frozen',
                    turns: power.turns || 2,
                    value: 1,
                    source: attacker.username
                });
                log = `❄️ ${attacker.username} used **${power.desc}**, dealing ${result.breakdown} + **Frozen** (${power.turns} turns)!`;
                break;
            }

            case 'mark_boost': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 12);
                damage = result.damage;
                atkEff.markBoost = power.boost || 1.3;
                atkEff.namedBuffs.push({
                    name: power.effectName || 'Mark',
                    turns: 99,
                    value: power.boost || 1.3,
                    source: attacker.username
                });
                log = `🎯 ${attacker.username} activated **${power.desc}**! +${Math.floor(((power.boost || 1.3) - 1) * 100)}% damage! Dealt ${result.breakdown}!`;
                break;
            }

            case 'critical': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 12);
                damage = result.damage;
                if (Math.random() < 0.4) {
                    damage = Math.floor(damage * (power.crit || 2));
                    log = `💢 ${attacker.username} landed a **CRITICAL** with ${power.desc} for **${damage}** damage!`;
                } else {
                    log = `${attacker.username} used **${power.desc}** for ${result.breakdown} damage!`;
                }
                break;
            }

            case 'burn_stack': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.05)) + 10);
                damage = result.damage;
                defEff.burnStacks = (defEff.burnStacks || 0) + (power.stacks || 2);
                log = `🔥 ${attacker.username} used **${power.desc}**, dealing ${result.breakdown} + **${power.stacks} burn stacks**!`;
                break;
            }

            case 'bloodpump': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 12);
                damage = result.damage;
                atkEff.speedBoost = power.speed || 1.5;
                atkEff.namedBuffs.push({
                    name: power.effectName || 'Blood Pump',
                    turns: 99,
                    value: power.speed || 1.5,
                    source: attacker.username
                });
                log = `💉 ${attacker.username} activated **${power.desc}**! Speed x${power.speed}! Dealt ${result.breakdown}!`;
                break;
            }

            case 'reality_warp': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 15);
                damage = result.damage;
                if (Math.random() < 0.3) {
                    damage = Math.floor(damage * 1.8);
                    log = `🌀 ${attacker.username} **WARPED REALITY** with ${power.desc}! **${damage}** chaotic damage!`;
                } else {
                    log = `${attacker.username} used **${power.desc}** for ${result.breakdown} damage!`;
                }
                break;
            }

            case 'drain_power': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 12);
                damage = result.damage;
                const selfDrain = Math.floor(attackerMaxHp * (power.self || 0.05));
                if (isPlayer1Turn) battle.player1Health = Math.max(0, battle.player1Health - selfDrain);
                else battle.player2Health = Math.max(0, battle.player2Health - selfDrain);
                defEff.speech = Math.max(0.5, defEff.speech - 0.1);
                log = `🌑 ${attacker.username} used **${power.desc}**, dealing ${result.breakdown}, taking **${selfDrain}** self-damage!`;
                break;
            }

            case 'foresight':
                atkEff.foresight = power.turns || 3;
                log = `👁️ ${attacker.username} activated **${power.desc}**! Can dodge for ${power.turns} turns!`;
                break;

            case 'aerial': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 15);
                damage = result.damage;
                log = `🦅 ${attacker.username} used **${power.desc}**, diving for ${result.breakdown} damage!`;
                break;
            }

            case 'chain_lightning': {
                baseDamage = Math.floor(defenderMaxHp * (power.scale || 0.05)) + 10;
                const baseResult = this.calculateDamageWithBreakdown(baseDamage, defenderMaxHp, modifierList);
                damage = baseResult.damage;
                for (let i = 0; i < (power.chains || 3); i++) {
                    damage += Math.floor(baseResult.damage * 0.5);
                }
                log = `⚡ ${attacker.username} used **${power.desc}**, chaining ${power.chains}x for **${damage}** total damage!`;
                break;
            }

            case 'illusion_copy':
                atkEff.illusionCopy = power.turns || 3;
                log = `👻 ${attacker.username} created **${power.desc}**! May confuse attacks for ${power.turns} turns!`;
                break;

            case 'trap': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.05)) + 8);
                damage = result.damage;
                defEff.trapped = 2;
                log = `🪤 ${attacker.username} set **${power.desc}**, dealing ${result.breakdown} + **Trapped** (2 turns)!`;
                break;
            }

            case 'transform': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 15);
                damage = result.damage;
                atkEff.transform = power.duration || 4;
                atkEff.transformBoost = power.boost || 1.4;
                atkEff.namedBuffs.push({
                    name: power.effectName || 'Transform',
                    turns: power.duration || 4,
                    value: power.boost || 1.4,
                    source: attacker.username
                });
                log = `🔄 ${attacker.username} **TRANSFORMED** with ${power.desc}! +${Math.floor(((power.boost || 1.4) - 1) * 100)}% damage for ${power.duration} turns! Dealt ${result.breakdown}!`;
                break;
            }

            case 'giant_limbs': {
                const giantMod = [...modifierList, { name: 'Giant', value: 1.2 }];
                const result = this.calculateDamageWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 14, defenderMaxHp, giantMod);
                damage = result.damage;
                baseDamage = Math.floor(defenderMaxHp * (power.scale || 0.06)) + 14;
                log = `👊 ${attacker.username} used **${power.desc}**, crushing for ${result.breakdown} damage!`;
                break;
            }

            case 'demon_form': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.07)) + 15);
                damage = result.damage;
                const demonSteal = Math.floor(damage * (power.lifesteal || 0.25));
                if (isPlayer1Turn) battle.player1Health = Math.min(battle.player1Health + demonSteal, battle.player1MaxHp);
                else battle.player2Health = Math.min(battle.player2Health + demonSteal, battle.player2MaxHp);
                log = `👹 ${attacker.username} unleashed **${power.desc}**, dealing ${result.breakdown} + stealing **${demonSteal}** HP!`;
                break;
            }

            case 'laser': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 12);
                damage = result.damage;
                if (power.piercing) {
                    damage = Math.floor(damage * 1.3);
                    log = `💫 ${attacker.username} fired **${power.desc}**, piercing for **${damage}** damage!`;
                } else {
                    log = `💫 ${attacker.username} fired **${power.desc}** for ${result.breakdown} damage!`;
                }
                break;
            }

            case 'ghost': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.05)) + 10);
                damage = result.damage;
                atkEff.ghostMode = true;
                log = `👻 ${attacker.username} entered **${power.desc}**! Became intangible! Dealt ${result.breakdown}!`;
                break;
            }

            case 'water_prison': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.05)) + 10);
                damage = result.damage;
                defEff.waterPrison = power.turns || 3;
                defEff.namedDots.push({
                    name: power.effectName || 'Drowning',
                    turns: power.turns || 3,
                    value: Math.floor(defenderMaxHp * 0.045),
                    source: attacker.username
                });
                log = `🌊 ${attacker.username} trapped in **${power.desc}**, dealing ${result.breakdown} + **Drowning** (${power.turns} turns)!`;
                break;
            }

            case 'redirect': {
                atkEff.redirect = true;
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.04)) + 6);
                damage = result.damage;
                log = `↩️ ${attacker.username} prepared **${power.desc}**! Next attack redirects 50%! Dealt ${result.breakdown}!`;
                break;
            }

            case 'earthquake': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.07)) + 18);
                damage = result.damage;
                if (power.aoe) {
                    damage = Math.floor(damage * 1.15);
                    log = `🌋 ${attacker.username} caused **${power.desc}**, shaking for **${damage}** massive damage!`;
                } else {
                    log = `${attacker.username} used **${power.desc}** for ${result.breakdown} damage!`;
                }
                break;
            }

            case 'damage': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.08)) + 12);
                damage = result.damage;
                log = `⚔️ ${attacker.username} used **${power.desc}** for ${result.breakdown} damage!`;
                break;
            }

            case 'stun': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.04)) + 6);
                damage = result.damage;
                defEff.stunned = power.turns || 1;
                defEff.namedDebuffs.push({
                    name: power.effectName || 'Stunned',
                    turns: power.turns || 1,
                    value: 1,
                    source: attacker.username
                });
                log = `💫 ${attacker.username} used **${power.desc}**, dealing ${result.breakdown} + **Stunned** (${power.turns || 1} turn)!`;
                break;
            }

            case 'dot': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.03)) + 6);
                damage = result.damage;
                defEff.dot = power.turns || 3;
                defEff.dotDmg = Math.floor(defenderMaxHp * (power.scale || 0.04));
                defEff.namedDots.push({
                    name: power.effectName || power.desc,
                    turns: power.turns || 3,
                    value: defEff.dotDmg,
                    source: attacker.username
                });
                log = `🔥 ${attacker.username} used **${power.desc}**, dealing ${result.breakdown} + **${power.effectName || 'DoT'}** (${power.turns || 3} turns)!`;
                break;
            }

            case 'debuff': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.05)) + 8);
                damage = result.damage;
                defEff.debuff = (defEff.debuff || 1) * (power.debuff || 0.7);
                defEff.debuffTurns = power.turns || 2;
                defEff.namedDebuffs.push({
                    name: power.effectName || 'Weakened',
                    turns: power.turns || 2,
                    value: 1 - (power.debuff || 0.7),
                    source: attacker.username
                });
                log = `⬇️ ${attacker.username} used **${power.desc}**, dealing ${result.breakdown} + **-${Math.floor((1 - (power.debuff || 0.7)) * 100)}% Weakened**!`;
                break;
            }

            case 'heal': {
                const healAmount = Math.floor(attackerMaxHp * (power.scale || 0.12));
                if (isPlayer1Turn) battle.player1Health = Math.min(battle.player1Health + healAmount, battle.player1MaxHp);
                else battle.player2Health = Math.min(battle.player2Health + healAmount, battle.player2MaxHp);
                log = `💚 ${attacker.username} used **${power.desc}** and healed **${healAmount}** HP!`;
                break;
            }

            case 'swap': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.06)) + 10);
                damage = result.damage;
                const shouldSwap = Math.random() < 0.35;
                if (shouldSwap) {
                    const atkHpPercent = isPlayer1Turn ? battle.player1Health / battle.player1MaxHp : battle.player2Health / battle.player2MaxHp;
                    const defHpPercent = isPlayer1Turn ? battle.player2Health / battle.player2MaxHp : battle.player1Health / battle.player1MaxHp;
                    if (isPlayer1Turn) {
                        battle.player1Health = Math.floor(battle.player1MaxHp * defHpPercent);
                        battle.player2Health = Math.floor(battle.player2MaxHp * atkHpPercent);
                    } else {
                        battle.player2Health = Math.floor(battle.player2MaxHp * defHpPercent);
                        battle.player1Health = Math.floor(battle.player1MaxHp * atkHpPercent);
                    }
                    log = `🔀 ${attacker.username} used **${power.desc}**! HP swapped! Also dealt ${result.breakdown}!`;
                } else {
                    log = `${attacker.username} used **${power.desc}** for ${result.breakdown} (Swap failed)!`;
                }
                break;
            }

            case 'gamble': {
                const roll = Math.random();
                if (roll < 0.25) {
                    baseDamage = Math.floor(defenderMaxHp * (power.scale || 0.08) * 3) + 25;
                    const result = this.calculateDamageWithBreakdown(baseDamage, defenderMaxHp, modifierList);
                    damage = result.damage;
                    log = `🎰 ${attacker.username} used **${power.desc}** and hit **JACKPOT**! **${damage}** massive damage!`;
                } else if (roll < 0.5) {
                    const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.08)) + 12);
                    damage = result.damage;
                    log = `🎲 ${attacker.username} used **${power.desc}** for ${result.breakdown} damage!`;
                } else {
                    const selfDmg = Math.floor(attackerMaxHp * 0.10);
                    if (isPlayer1Turn) battle.player1Health = Math.max(1, battle.player1Health - selfDmg);
                    else battle.player2Health = Math.max(1, battle.player2Health - selfDmg);
                    log = `💸 ${attacker.username} used **${power.desc}** and lost! Took **${selfDmg}** self-damage!`;
                }
                break;
            }

            case 'charge': {
                const chargeKey = `charge_${power.name}`;
                const chargeValue = atkEff[chargeKey];
                const charges = typeof chargeValue === 'number' ? chargeValue : (power.charges || 2);
                if (charges > 0) {
                    const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.20)) + 20);
                    damage = result.damage;
                    atkEff[chargeKey] = charges - 1;
                    log = `⚡ ${attacker.username} used **${power.desc}**! ${result.breakdown} damage! (${charges - 1} charges left)`;
                } else {
                    const result = calcWithBreakdown(Math.floor(defenderMaxHp * 0.04) + 6);
                    damage = result.damage;
                    log = `${attacker.username} tried **${power.desc}** but is out of charges! ${result.breakdown} weak damage!`;
                }
                break;
            }

            case 'slow': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.05)) + 8);
                damage = result.damage;
                defEff.slowed = power.turns || 2;
                defEff.slowAmount = 0.7;
                defEff.namedDebuffs.push({
                    name: power.effectName || 'Slowed',
                    turns: power.turns || 2,
                    value: 0.3,
                    source: attacker.username
                });
                log = `🐢 ${attacker.username} used **${power.desc}**, dealing ${result.breakdown} + **Slowed** (${power.turns || 2} turns)!`;
                break;
            }

            case 'buff': {
                let healAmount = 0;
                if (power.heal) {
                    healAmount = Math.floor(attackerMaxHp * (power.scale || 0.08));
                    if (isPlayer1Turn) battle.player1Health = Math.min(battle.player1Health + healAmount, battle.player1MaxHp);
                    else battle.player2Health = Math.min(battle.player2Health + healAmount, battle.player2MaxHp);
                }
                atkEff.buff = power.boost || 1.3;
                atkEff.buffTurns = power.turns || 3;
                atkEff.namedBuffs.push({
                    name: power.effectName || 'Buff',
                    turns: power.turns || 3,
                    value: power.boost || 1.3,
                    source: attacker.username
                });
                log = `⬆️ ${attacker.username} used **${power.desc}**! +${Math.floor(((power.boost || 1.3) - 1) * 100)}% damage${healAmount > 0 ? ` + healed **${healAmount}** HP` : ''}!`;
                break;
            }

            case 'sacrifice': {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.25)) + 25);
                damage = result.damage;
                const selfDamage = Math.floor(attackerMaxHp * (power.self || 0.20));
                if (isPlayer1Turn) battle.player1Health = Math.max(1, battle.player1Health - selfDamage);
                else battle.player2Health = Math.max(1, battle.player2Health - selfDamage);
                log = `💀 ${attacker.username} **SACRIFICED** with ${power.desc}! ${result.breakdown} but took **${selfDamage}** self-damage!`;
                break;
            }

            case 'random': {
                const randomMult = 0.8 + Math.random() * 0.6;
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * (power.scale || 0.07) * randomMult) + 10);
                damage = result.damage;
                const summonName = skillsetService.getSummonName(battle.skillsetName, power.name);
                if (summonName !== 'Unknown Summon') {
                    log = `✨ ${attacker.username} summoned **${summonName}** with ${power.desc} for ${result.breakdown} damage!`;
                } else {
                    log = `${attacker.username} used **${power.desc}** for ${result.breakdown} damage!`;
                }
                break;
            }

            case 'phantom': {
                baseDamage = Math.floor(defenderMaxHp * (power.scale || 0.03)) + 6;
                const summonName = skillsetService.getSummonName(battle.skillsetName, power.name);
                for (let i = 0; i < (power.illusions || 3); i++) {
                    damage += this.calculateDamageWithBreakdown(baseDamage, defenderMaxHp, modifierList).damage;
                }
                if (summonName !== 'Unknown Summon') {
                    log = `👻 ${attacker.username} summoned ${power.illusions}x **${summonName}** with ${power.desc}, dealing **${damage}** total!`;
                } else {
                    log = `${attacker.username} created ${power.illusions} phantoms with **${power.desc}**, dealing **${damage}** total!`;
                }
                break;
            }

            default: {
                const result = calcWithBreakdown(Math.floor(defenderMaxHp * 0.06) + 8);
                damage = result.damage;
                log = `${attacker.username} used a combo attack for ${result.breakdown} damage!`;
            }
        }

        return [damage, log, baseDamage];
    }

    /**
     * Build player contexts for iterating both sides of a battle.
     * Used by handleEffects to avoid duplicating user1/user2 logic.
     */
    private getPlayerContexts(battle: Battle): Array<{
        effects: BattleEffects;
        username: string;
        maxHp: number;
        getHp: () => number;
        setHp: (hp: number) => void;
        setStunned: (v: boolean) => void;
    }> {
        return [
            {
                effects: battle.effects.user1,
                username: battle.player1.username,
                maxHp: battle.player1MaxHp,
                getHp: () => battle.player1Health,
                setHp: (hp: number) => { battle.player1Health = hp; },
                setStunned: (v: boolean) => { battle.player1Stunned = v; },
            },
            {
                effects: battle.effects.user2,
                username: battle.player2.username,
                maxHp: battle.player2MaxHp,
                getHp: () => battle.player2Health,
                setHp: (hp: number) => { battle.player2Health = hp; },
                setStunned: (v: boolean) => { battle.player2Stunned = v; },
            },
        ];
    }

    /**
     * Get the opposing player context (shrine damages the OTHER player)
     */
    private getOpponentContext(battle: Battle, index: number): {
        username: string;
        maxHp: number;
        getHp: () => number;
        setHp: (hp: number) => void;
    } {
        if (index === 0) {
            return {
                username: battle.player2.username,
                maxHp: battle.player2MaxHp,
                getHp: () => battle.player2Health,
                setHp: (hp: number) => { battle.player2Health = hp; },
            };
        }
        return {
            username: battle.player1.username,
            maxHp: battle.player1MaxHp,
            getHp: () => battle.player1Health,
            setHp: (hp: number) => { battle.player1Health = hp; },
        };
    }

    /**
     * Process end-of-turn effects
     */
    handleEffects(battle: Battle): string[] {
        const logs: string[] = [];
        const players = this.getPlayerContexts(battle);

        for (const p of players) {
            // Named DoTs (verse-specific names)
            for (const dot of p.effects.namedDots) {
                if (dot.turns > 0) {
                    p.setHp(Math.max(0, p.getHp() - dot.value));
                    logs.push(`🔥 **${dot.name}**: **${p.username}** took **${dot.value}** damage!`);
                    dot.turns--;
                }
            }
            p.effects.namedDots = p.effects.namedDots.filter(d => d.turns > 0);

            // Named Debuffs
            for (const debuff of p.effects.namedDebuffs) {
                if (debuff.turns > 0) {
                    debuff.turns--;
                    if (debuff.turns === 0) {
                        logs.push(`✨ **${p.username}**'s **${debuff.name}** wore off!`);
                    }
                }
            }
            p.effects.namedDebuffs = p.effects.namedDebuffs.filter(d => d.turns > 0);

            // Named Buffs
            for (const buff of p.effects.namedBuffs) {
                if (buff.turns > 0 && buff.turns < 99) {
                    buff.turns--;
                    if (buff.turns === 0) {
                        logs.push(`⬇️ **${p.username}**'s **${buff.name}** expired!`);
                    }
                }
            }
            p.effects.namedBuffs = p.effects.namedBuffs.filter(b => b.turns > 0);
        }

        // Shrine damages the OPPONENT, so needs special handling
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            if (p.effects.shrine > 0) {
                const opp = this.getOpponentContext(battle, i);
                const dmg = Math.max(Math.floor(opp.maxHp * 0.045), 1);
                opp.setHp(Math.max(0, opp.getHp() - dmg));
                logs.push(`⛩️ **Malevolent Shrine**: **${opp.username}** took **${dmg}** cleave damage!`);
                p.effects.shrine--;
            }
        }

        for (const p of players) {
            // Burn (legacy)
            if (p.effects.burn > 0) {
                const burnDmg = Math.floor(p.maxHp * 0.03);
                p.setHp(Math.max(0, p.getHp() - burnDmg));
                logs.push(`🔥 **Burning**: **${p.username}** took **${burnDmg}** burn damage!`);
                p.effects.burn--;
            }

            // Bleed
            if (p.effects.bleed > 0) {
                const bleedDmg = Math.floor(p.maxHp * 0.035);
                p.setHp(Math.max(0, p.getHp() - bleedDmg));
                logs.push(`🩸 **Bleeding**: **${p.username}** took **${bleedDmg}** bleed damage!`);
                p.effects.bleed--;
            }

            // Poison
            if (p.effects.poison > 0) {
                const poisonDmg = Math.floor(p.maxHp * 0.025);
                p.setHp(Math.max(0, p.getHp() - poisonDmg));
                logs.push(`☠️ **Poisoned**: **${p.username}** took **${poisonDmg}** poison damage!`);
                p.effects.poison--;
                if (p.effects.poison === 0) p.effects.poisonWeaken = 1;
            }

            // Constrict
            if (p.effects.constrict > 0) {
                p.setHp(Math.max(0, p.getHp() - p.effects.constrictDmg));
                logs.push(`🐍 **Constricted**: **${p.username}** took **${p.effects.constrictDmg}** damage!`);
                p.effects.constrict--;
            }

            // Frozen
            if (p.effects.frozen > 0) {
                const frozenDmg = Math.floor(p.maxHp * 0.015);
                p.setHp(Math.max(0, p.getHp() - frozenDmg));
                logs.push(`❄️ **Frozen**: **${p.username}** took **${frozenDmg}** freeze damage!`);
                p.effects.frozen--;
            }

            // Water Prison
            if (p.effects.waterPrison && p.effects.waterPrison > 0) {
                const drownDmg = Math.floor(p.maxHp * 0.04);
                p.setHp(Math.max(0, p.getHp() - drownDmg));
                logs.push(`🌊 **Water Prison**: **${p.username}** is drowning for **${drownDmg}** damage!`);
                p.effects.waterPrison--;
            }

            // DoT (generic fallback)
            if (p.effects.dot && p.effects.dot > 0) {
                const dotDmg = p.effects.dotDmg || Math.floor(p.maxHp * 0.035);
                p.setHp(Math.max(0, p.getHp() - dotDmg));
                logs.push(`💀 **DoT**: **${p.username}** took **${dotDmg}** damage!`);
                p.effects.dot--;
                if (p.effects.dot === 0) p.effects.dotDmg = 0;
            }

            // Debuff expiry
            if (p.effects.debuffTurns && p.effects.debuffTurns > 0) {
                p.effects.debuffTurns--;
                if (p.effects.debuffTurns === 0 && p.effects.debuff) {
                    logs.push(`✨ **${p.username}**'s debuff wore off!`);
                    p.effects.speech = 1;
                    p.effects.debuff = 0;
                }
            }

            // Slowed expiry
            if (p.effects.slowed && p.effects.slowed > 0) {
                p.effects.slowed--;
                if (p.effects.slowed === 0) {
                    logs.push(`✨ **${p.username}**'s slow wore off!`);
                    p.effects.slowAmount = 0;
                }
            }

            // Stunned
            if (p.effects.stunned && p.effects.stunned > 0) {
                p.setStunned(true);
                p.effects.stunned--;
                if (p.effects.stunned > 0) {
                    logs.push(`💫 **${p.username}** is stunned! (${p.effects.stunned} turns left)`);
                }
            }

            // Buff expiry
            if (p.effects.buffTurns && p.effects.buffTurns > 0) {
                p.effects.buffTurns--;
                if (p.effects.buffTurns === 0) {
                    logs.push(`⬇️ **${p.username}**'s buff expired!`);
                    p.effects.buff = 0;
                }
            }

            // Speech turns
            if (p.effects.speechTurns > 0) {
                p.effects.speechTurns--;
                if (p.effects.speechTurns === 0) {
                    p.effects.speech = 1;
                }
            }

            // Transform
            if (p.effects.transform > 0) {
                p.effects.transform--;
                if (p.effects.transform === 0) {
                    p.effects.transformBoost = 1;
                    logs.push(`🔄 **${p.username}**'s transformation ended!`);
                }
            }
        }

        return logs;
    }

    /**
     * Check if a player can revive
     */
    checkRevive(battle: Battle, isPlayer1: boolean): boolean {
        const effects = isPlayer1 ? battle.effects.user1 : battle.effects.user2;
        const revived = isPlayer1 ? battle.revivedOnce.user1 : battle.revivedOnce.user2;

        if (effects.revive && !revived) {
            const maxHp = isPlayer1 ? battle.player1MaxHp : battle.player2MaxHp;
            const reviveHp = Math.floor(maxHp * 0.25);

            if (isPlayer1) {
                battle.player1Health = reviveHp;
                battle.revivedOnce.user1 = true;
            } else {
                battle.player2Health = reviveHp;
                battle.revivedOnce.user2 = true;
            }

            effects.revive = false;
            return true;
        }

        return false;
    }

    /**
     * Execute a full battle round - processes both players' turns and effects
     * @returns RoundResult with attacker, defender, damage, and skill used
     */
    executeRound(battle: Battle): { attacker: User; defender: User; damage: number; skill: string; effectLogs: string[]; historyEntry?: BattleHistoryEntry } {
        // Determine who attacks this round (alternating based on round count)
        const isPlayer1Turn = battle.roundCount % 2 === 1;
        const attacker = isPlayer1Turn ? battle.player1 : battle.player2;
        const defender = isPlayer1Turn ? battle.player2 : battle.player1;

        // Check if attacker is stunned
        const attackerStunned = isPlayer1Turn ? battle.player1Stunned : battle.player2Stunned;
        if (attackerStunned) {
            // Clear stun and skip turn
            if (isPlayer1Turn) battle.player1Stunned = false;
            else battle.player2Stunned = false;
            
            battle.roundCount++;
            return {
                attacker,
                defender,
                damage: 0,
                skill: `💫 **${attacker.username}** is stunned - Turn skipped!`,
                effectLogs: []
            };
        }

        // Deal damage and get the log + history entry
        const { log: damageLog, historyEntry } = this.dealDamage(battle, isPlayer1Turn);

        // Extract damage from history entry or log
        const damage = historyEntry.finalDamage || 0;

        // Process end-of-turn effects
        const effectLogs = this.handleEffects(battle);

        // Add effect logs to history entry
        if (historyEntry) {
            historyEntry.effectsApplied = effectLogs.map(l => l.replace(/\*\*/g, ''));
            historyEntry.p1HpAfter = battle.player1Health;
            historyEntry.p2HpAfter = battle.player2Health;
            
            // Add to battle history
            battle.history.push(historyEntry as BattleHistoryEntry);
        }

        // Check for revives if anyone died
        if (battle.player1Health <= 0) {
            const revived = this.checkRevive(battle, true);
            if (revived) {
                effectLogs.push(`✨ **${battle.player1.username}** revived with 25% HP!`);
            }
        }
        if (battle.player2Health <= 0) {
            const revived = this.checkRevive(battle, false);
            if (revived) {
                effectLogs.push(`✨ **${battle.player2.username}** revived with 25% HP!`);
            }
        }

        // Increment round counter
        battle.roundCount++;

        return {
            attacker,
            defender,
            damage,
            skill: damageLog,
            effectLogs,
            historyEntry: historyEntry as BattleHistoryEntry
        };
    }

    /**
     * End a battle and clean up
     */
    async endBattle(battleId: string): Promise<void> {
        // battleId could be guildId in our implementation
        await this.removeBattle(battleId);
    }
}

// Create singleton instance
const battleService = new BattleService();

export { BattleService };
export default battleService;

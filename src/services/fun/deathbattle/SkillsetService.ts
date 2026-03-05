/**
 * Skillset Service for Death Battle
 * Manages different anime skillsets and powers
 * @module services/fun/deathbattle/SkillsetService
 */

import jjkSkillset from '../../../config/deathbattle/skillsets/jjk.js';
import narutoSkillset from '../../../config/deathbattle/skillsets/naruto.js';
import demonSlayerSkillset from '../../../config/deathbattle/skillsets/demonslayer.js';
import onePieceSkillset from '../../../config/deathbattle/skillsets/onepiece.js';
import crossoverSkillset from '../../../config/deathbattle/skillsets/crossover.js';
import type { Power, Skillset } from '../../../config/deathbattle/skillsets/types.js';
export { type Power, type Skillset } from '../../../config/deathbattle/skillsets/types.js';
// SKILLSET SERVICE CLASS
class SkillsetService {
    private skillsets: Map<string, Skillset> = new Map();

    constructor() {
        this.skillsets.set('jjk', jjkSkillset as Skillset);
        this.skillsets.set('naruto', narutoSkillset as Skillset);
        this.skillsets.set('demonslayer', demonSlayerSkillset as Skillset);
        this.skillsets.set('onepiece', onePieceSkillset as Skillset);
        this.skillsets.set('crossover', crossoverSkillset as Skillset);
    }

    /**
     * Get a skillset by name
     */
    getSkillset(name: string): Skillset | undefined {
        return this.skillsets.get(name.toLowerCase());
    }

    /**
     * Get all available skillset names
     */
    getAllSkillsets(): string[] {
        return Array.from(this.skillsets.keys());
    }

    /**
     * Check if a skillset exists
     */
    isValidSkillset(name: string): boolean {
        return this.skillsets.has(name.toLowerCase());
    }

    /**
     * Get a random power from a skillset, avoiding recently used ones
     */
    getRandomPower(skillsetName: string, usedPowers: string[] = []): Power | null {
        const skillset = this.getSkillset(skillsetName);
        if (!skillset) return null;

        // Reset used powers if all have been used
        if (usedPowers.length >= skillset.powers.length) {
            usedPowers.length = 0;
        }

        const available = skillset.powers.filter(p => !usedPowers.includes(p.name));
        if (available.length === 0) return null;
        
        const selected = available[Math.floor(Math.random() * available.length)]!;
        usedPowers.push(selected.name);

        return selected;
    }

    /**
     * Get a random summon name for a power
     */
    getSummonName(skillsetName: string, powerName: string): string {
        const skillset = this.getSkillset(skillsetName);
        if (!skillset || !skillset.summonNames[powerName]) {
            return 'Unknown Summon';
        }

        const summons = skillset.summonNames[powerName]!;
        return summons[Math.floor(Math.random() * summons.length)] || 'Unknown Summon';
    }
}

// Create singleton instance
const skillsetService = new SkillsetService();

export { SkillsetService };
export default skillsetService;




export interface Power {
    name: string;
    char: string;
    type: string;
    scale?: number;
    desc: string;
    heal?: boolean;
    boost?: number;
    turns?: number;
    debuff?: number;
    self?: number;
    hits?: number;
    speed?: number;
    illusions?: number;
    stacks?: number;
    chains?: number;
    duration?: number;
    lifesteal?: number;
    piercing?: boolean;
    damage?: number;
    aoe?: boolean;
    threshold?: number;
    weaken?: number;
    bonus?: number;
    steal?: number;
    ignore?: number;
    crit?: number;
    recoil?: number;
    charges?: number;
    effectName?: string;
}

export interface Skillset {
    name: string;
    displayName: string;
    thumbnail: string;
    powers: Power[];
    summonNames: Record<string, string[]>;
}

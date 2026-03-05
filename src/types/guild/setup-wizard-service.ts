export type SetupStep = 'welcome' | 'automod' | 'features' | 'complete';

export interface AutoModOptions {
    antiSpam: boolean;
    antiInvite: boolean;
    antiCaps: boolean;
    antiMassMention: boolean;
    badWordFilter: boolean;
}

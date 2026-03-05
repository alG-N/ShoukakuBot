import type { SteamGame } from '../steam.js';

export interface SaleState {
    games: SteamGame[];
    currentPage: number;
    minDiscount: number;
    showDetailed: boolean;
}

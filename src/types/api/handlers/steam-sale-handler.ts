import type { SteamGame } from '../models/steam.js';

export interface SaleState {
    games: SteamGame[];
    currentPage: number;
    minDiscount: number;
    showDetailed: boolean;
}

import type { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from 'discord.js';
import type {
    OnThisDayDate,
    OnThisDayEvent,
    OnThisDayResponse,
    WikiArticle,
    WikiArticleResponse,
    WikiSearchResponse,
    WikiSearchResult,
    WikipediaSearchOptions
} from '../api/models/wikipedia.js';

export interface WikipediaService {
    search: (query: string, options?: WikipediaSearchOptions) => Promise<WikiSearchResponse>;
    getArticleSummary: (title: string, language?: string) => Promise<WikiArticleResponse>;
    getRandomArticle: (language?: string) => Promise<WikiArticleResponse>;
    getOnThisDay: (month: number, day: number, language?: string) => Promise<OnThisDayResponse>;
}

export interface WikipediaHandler {
    createSearchResultsEmbed: (query: string, results: WikiSearchResult[]) => EmbedBuilder;
    createRandomArticleEmbed: (article: WikiArticle) => EmbedBuilder;
    createArticleEmbed: (article: WikiArticle | null | undefined) => EmbedBuilder;
    createArticleButtons: (article: WikiArticle, userId: string) => ActionRowBuilder<ButtonBuilder>;
    createSearchSelectMenu: (results: WikiSearchResult[], userId: string, sessionToken: string) => ActionRowBuilder<any> | null;
    createOnThisDayEmbed: (events: OnThisDayEvent[], date: OnThisDayDate) => EmbedBuilder;
}
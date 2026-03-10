import type { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from 'discord.js';
import type { OnThisDayDate, OnThisDayEvent, WikiArticle, WikiSearchResponse, WikiSearchResult } from '../../api/models/wikipedia.js';

export interface WikipediaService {
    search: (query: string) => Promise<WikiSearchResponse>;
    getArticle: (title: string, language: string) => Promise<WikiArticle | null>;
    getRandomArticle: (language: string) => Promise<WikiArticle | null>;
    getOnThisDay: () => Promise<OnThisDayEvent[] | null>;
    autocomplete: (query: string) => Promise<string[]>;
}

export interface WikipediaHandler {
    createSearchResultsEmbed: (query: string, results: WikiSearchResult[]) => EmbedBuilder;
    createArticleEmbed: (article: WikiArticle) => EmbedBuilder;
    createArticleButtons: (article: WikiArticle) => ActionRowBuilder<ButtonBuilder>;
    createOnThisDayEmbed: (events: OnThisDayEvent[], date: OnThisDayDate) => EmbedBuilder;
}

export interface EventStats {
    totalEvents: number;
    activeGuilds: number;
    listenerCount: number;
    eventCounts: Record<string, number>;
}

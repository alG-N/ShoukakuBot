export interface ClientStats {
    guilds: number;
    users: number;
    channels: number;
    memory: {
        heapUsed: string;
        heapTotal: string;
        rss: string;
    };
    uptime: string;
}

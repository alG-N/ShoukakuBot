export interface ErrorDetails {
    stack?: string;
    name?: string;
    [key: string]: unknown;
}

export interface ReplyOptions {
    successMessage?: string;
    ephemeral?: boolean;
}

export interface DiscordReply {
    content: string;
    ephemeral: boolean;
}

export interface ResultJSON<T> {
    success: boolean;
    data: T | null;
    error: string | null;
    code: string | null;
    details?: ErrorDetails | null;
}

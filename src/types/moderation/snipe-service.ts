export interface TrackedAttachment {
    url: string;
    proxyUrl: string;
    name: string;
    type: string | null;
    size: number;
}

export interface TrackedEmbed {
    title?: string;
    description?: string;
    url?: string;
}

export interface TrackedAuthor {
    id: string;
    tag: string;
    displayName: string;
    avatarURL: string | null;
}

export interface TrackedChannel {
    id: string;
    name: string;
}

export interface TrackedMessage {
    id: string;
    content: string;
    author: TrackedAuthor;
    channel: TrackedChannel;
    attachments: TrackedAttachment[];
    embeds: TrackedEmbed[];
    createdAt: number;
    deletedAt: number;
}

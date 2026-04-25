export interface DownloadInfo {
    url?: string;
    filename?: string;
    error?: string;
}

export interface CobaltResponse {
    status?: string;
    url?: string;
    filename?: string;
    error?: { code?: string } | string;
    text?: string;
    picker?: Array<{ type?: string; url?: string; filename?: string }>;
}

export interface CobaltCompleteData {
    path: string;
    size: number;
    filename?: string;
}
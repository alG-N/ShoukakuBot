export interface DownloadResult {
    success: boolean;
    path: string;
    size: number;
    format: string;
    method: string;
}

export interface DirectUrlResult {
    directUrl: string;
    size: string;
    title: string;
    thumbnail: string | null;
    method: string;
}
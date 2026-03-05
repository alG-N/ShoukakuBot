export interface VoteResult {
    added?: boolean;
    voteCount: number;
    required: number;
    message?: string;
}

export interface VoteSkipStatus {
    active?: boolean;
    count: number;
    required: number;
}

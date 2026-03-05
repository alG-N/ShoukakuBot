export interface ParsedPaginationButton {
    prefix: string;
    action: 'first' | 'prev' | 'next' | 'last' | 'page';
    userId: string;
}

export interface PaginationStateEntry<T> {
    value: T;
    timestamp: number;
}

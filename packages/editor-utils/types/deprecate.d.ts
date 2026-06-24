type DeprecationPayload = Partial<{
    suggest: string;
    doc: string;
}>;
export declare const deprecationWarning: (name: any, payload?: DeprecationPayload) => void;
export {};

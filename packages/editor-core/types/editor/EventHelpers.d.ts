import { EditorState, NodeId, NodeEventTypes } from '../interfaces';
export declare function EventHelpers(state: EditorState, eventType: NodeEventTypes): {
    contains(id: NodeId): boolean;
    isEmpty(): boolean;
    first(): any;
    last(): any;
    all(): string[];
    size(): any;
    at(i: number): any;
    raw(): Set<string>;
};

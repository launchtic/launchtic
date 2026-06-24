import React from 'react';
import { NodeId, EditorState, Indicator, Node, Options, NodeEventTypes, NodeSelector, NodeTree, SerializedNodes, SerializedNode, FreshNode } from '../interfaces';
export declare function QueryMethods(state: EditorState): {
    /**
     * Determine the best possible location to drop the source Node relative to the target Node
     *
     * TODO: replace with Positioner.computeIndicator();
     */
    getDropPlaceholder: (source: NodeSelector, target: NodeId, pos: {
        x: number;
        y: number;
    }, nodesToDOM?: (node: Node) => HTMLElement) => Indicator;
    /**
     * Get the current Editor options
     */
    getOptions(): Options;
    getNodes(): import("../interfaces").Nodes;
    /**
     * Helper methods to describe the specified Node
     * @param id
     */
    node(id: NodeId): {
        isCanvas(): boolean;
        isRoot(): boolean;
        isLinkedNode(): boolean;
        isTopLevelNode(): any;
        isDeletable(): boolean;
        isParentOfTopLevelNodes: () => boolean;
        isParentOfTopLevelCanvas(): any;
        isSelected(): boolean;
        isHovered(): boolean;
        isDragged(): boolean;
        get(): Node;
        ancestors(deep?: boolean): NodeId[];
        descendants(deep?: boolean, includeOnly?: "linkedNodes" | "childNodes"): NodeId[];
        linkedNodes(): string[];
        childNodes(): string[];
        isDraggable(onError?: (err: string) => void): boolean;
        isDroppable(selector: NodeSelector, onError?: (err: string) => void): boolean;
        toSerializedNode(): SerializedNode;
        toNodeTree(includeOnly?: "linkedNodes" | "childNodes"): {
            rootNodeId: string;
            nodes: any;
        };
        decendants(deep?: boolean): any;
        isTopLevelCanvas(): boolean;
    };
    /**
     * Returns all the `nodes` in a serialized format
     */
    getSerializedNodes(): SerializedNodes;
    getEvent(eventType: NodeEventTypes): {
        contains(id: NodeId): boolean;
        isEmpty(): boolean;
        first(): any;
        last(): any;
        all(): string[];
        size(): any;
        at(i: number): any;
        raw(): Set<string>;
    };
    /**
     * Retrieve the JSON representation of the editor's Nodes
     */
    serialize(): string;
    parseReactElement: (reactElement: React.ReactElement<any>) => {
        toNodeTree(normalize?: (node: Node, jsx: React.ReactElement<any>) => void): NodeTree;
    };
    parseSerializedNode: (serializedNode: SerializedNode) => {
        toNode(normalize?: (node: Node) => void): Node;
    };
    parseFreshNode: (node: FreshNode) => {
        toNode(normalize?: (node: Node) => void): Node;
    };
    createNode(reactElement: React.ReactElement, extras?: any): any;
    getState(): EditorState;
};

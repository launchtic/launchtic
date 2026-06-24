import { EditorState, NodeId, NodeSelector } from '../interfaces';
export declare function NodeHelpers(state: EditorState, id: NodeId): {
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
    get(): import("../interfaces").Node;
    ancestors(deep?: boolean): NodeId[];
    descendants(deep?: boolean, includeOnly?: "linkedNodes" | "childNodes"): NodeId[];
    linkedNodes(): string[];
    childNodes(): string[];
    isDraggable(onError?: (err: string) => void): boolean;
    isDroppable(selector: NodeSelector, onError?: (err: string) => void): boolean;
    toSerializedNode(): import("../interfaces").SerializedNode;
    toNodeTree(includeOnly?: "linkedNodes" | "childNodes"): {
        rootNodeId: string;
        nodes: any;
    };
    /**
     Deprecated NodeHelpers
     **/
    decendants(deep?: boolean): any;
    isTopLevelCanvas(): boolean;
};

import { DerivedEventHandlers, EventHandlers } from '@craftjs/utils';
import { EditorStore } from '../editor/store';
import { NodeId, NodeTree } from '../interfaces/nodes';
export interface CreateHandlerOptions {
    onCreate: (nodeTree: NodeTree) => void;
}
export declare class CoreEventHandlers<O = {}> extends EventHandlers<{
    store: EditorStore;
    removeHoverOnMouseleave: boolean;
} & O> {
    handlers(): {
        connect: (el: HTMLElement, id: NodeId) => void;
        select: (el: HTMLElement, id: NodeId) => void;
        hover: (el: HTMLElement, id: NodeId) => void;
        drag: (el: HTMLElement, id: NodeId) => void;
        drop: (el: HTMLElement, id: NodeId) => void;
        create: (el: HTMLElement, UserElement: React.ReactElement | (() => NodeTree | React.ReactElement), options?: Partial<CreateHandlerOptions>) => void;
    };
}
export declare abstract class DerivedCoreEventHandlers<O = {}> extends DerivedEventHandlers<CoreEventHandlers, O> {
}

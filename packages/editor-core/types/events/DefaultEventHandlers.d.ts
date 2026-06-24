import React from 'react';
import { CoreEventHandlers, CreateHandlerOptions } from './CoreEventHandlers';
import { Positioner } from './Positioner';
import { NodeId, DragTarget, NodeTree } from '../interfaces';
export type DefaultEventHandlersOptions = {
    isMultiSelectEnabled: (e: MouseEvent) => boolean;
    removeHoverOnMouseleave: boolean;
};
/**
 * Specifies Editor-wide event handlers and connectors
 */
export declare class DefaultEventHandlers<O = {}> extends CoreEventHandlers<DefaultEventHandlersOptions & O> {
    /**
     * Note: Multiple drag shadows (ie: via multiselect in v0.2 and higher) do not look good on Linux Chromium due to way it renders drag shadows in general,
     * so will have to fallback to the single shadow approach above for the time being
     * see: https://bugs.chromium.org/p/chromium/issues/detail?id=550999
     */
    static forceSingleDragShadow: boolean;
    draggedElementShadow: HTMLElement;
    dragTarget: DragTarget;
    positioner: Positioner | null;
    currentSelectedElementIds: any[];
    onDisable(): void;
    handlers(): {
        connect: (el: HTMLElement, id: NodeId) => () => void;
        select: (el: HTMLElement, id: NodeId) => () => void;
        hover: (el: HTMLElement, id: NodeId) => () => void;
        drop: (el: HTMLElement, targetId: NodeId) => () => void;
        drag: (el: HTMLElement, id: NodeId) => () => void;
        create: (el: HTMLElement, userElement: React.ReactElement | (() => NodeTree | React.ReactElement), options?: Partial<CreateHandlerOptions>) => () => void;
    };
    private dropElement;
}

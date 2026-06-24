import { Node } from '../interfaces';
export declare function useInternalNode<S = null>(collect?: (node: Node) => S): Omit<import("../editor/useInternalEditor").useInternalEditorReturnType<S>, "query" | "actions" | "connectors"> & {
    id: string;
    related: boolean;
    inNodeContext: boolean;
    actions: {
        setProp: (cb: any, throttleRate?: number) => void;
        setCustom: (cb: any, throttleRate?: number) => void;
        setHidden: (bool: boolean) => void;
    };
    connectors: import("@craftjs/utils").ChainableConnectors<{
        connect: (dom: HTMLElement) => HTMLElement;
        drag: (dom: HTMLElement) => HTMLElement;
    }, HTMLElement | import("react").ReactElement<unknown, string | import("react").JSXElementConstructor<any>>>;
};

import { Node } from '../interfaces';
/**
 * A Hook to that provides methods and state information related to the corresponding Node that manages the current component.
 * @param collect - Collector function to consume values from the corresponding Node's state
 */
export declare function useNode<S = null>(collect?: (node: Node) => S): Omit<Omit<import("../editor/useInternalEditor").useInternalEditorReturnType<S>, "query" | "actions" | "connectors"> & {
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
}, "actions" | "connectors" | "id" | "related" | "inNodeContext"> & {
    actions: {
        setProp: (cb: any, throttleRate?: number) => void;
        setCustom: (cb: any, throttleRate?: number) => void;
        setHidden: (bool: boolean) => void;
    };
    id: string;
    related: boolean;
    setProp: (cb: (props: Record<string, any>) => void, throttleRate?: number) => void;
    inNodeContext: boolean;
    connectors: import("@craftjs/utils").ChainableConnectors<{
        connect: (dom: HTMLElement) => HTMLElement;
        drag: (dom: HTMLElement) => HTMLElement;
    }, HTMLElement | import("react").ReactElement<unknown, string | import("react").JSXElementConstructor<any>>>;
};

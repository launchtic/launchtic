import { Nodes, NodeSelectorWrapper, NodeSelector } from '../interfaces';
type config = {
    existOnly: boolean;
    idOnly: boolean;
};
export declare const getNodesFromSelector: (nodes: Nodes, selector: NodeSelector, config?: Partial<config>) => NodeSelectorWrapper[];
export {};

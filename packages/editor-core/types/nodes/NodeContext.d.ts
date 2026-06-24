import React from 'react';
import { NodeId } from '../interfaces';
export type NodeContextType = {
    id: NodeId;
    related?: boolean;
};
export declare const NodeContext: React.Context<NodeContextType>;
export type NodeProviderProps = Omit<NodeContextType, 'connectors'> & {
    children?: React.ReactNode;
};
export declare const NodeProvider: ({ id, related, children, }: NodeProviderProps) => React.JSX.Element;

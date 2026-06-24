import React from 'react';
import { NodeData, SerializedNode, ReducedComp } from '../interfaces';
import { Resolver } from '../interfaces';
type DeserialisedType = React.JSX.Element & {
    name: string;
};
export declare const deserializeComp: (data: ReducedComp, resolver: Resolver, index?: number) => DeserialisedType | void;
export declare const deserializeNode: (data: SerializedNode, resolver: Resolver) => Omit<NodeData, "event">;
export {};

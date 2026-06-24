import { NodeData, ReducedComp, SerializedNode } from '../interfaces';
import { Resolver } from '../interfaces';
export declare const serializeComp: (data: Pick<NodeData, "type" | "isCanvas" | "props">, resolver: Resolver) => ReducedComp;
export declare const serializeNode: (data: Omit<NodeData, "event">, resolver: Resolver) => SerializedNode;

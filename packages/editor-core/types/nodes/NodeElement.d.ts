import React from 'react';
import { NodeId } from '../interfaces';
export type NodeElementProps = {
    id: NodeId;
    render?: React.ReactElement;
};
export declare const NodeElement: ({ id, render }: NodeElementProps) => React.JSX.Element;

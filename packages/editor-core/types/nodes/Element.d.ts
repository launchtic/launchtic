import React from 'react';
import { NodeId } from '../interfaces';
export declare const defaultElementProps: {
    is: string;
    canvas: boolean;
    custom: {};
    hidden: boolean;
};
export declare const elementPropToNodeData: {
    is: string;
    canvas: string;
};
export type ElementProps<T extends React.ElementType> = {
    id?: NodeId;
    is?: T;
    custom?: Record<string, any>;
    children?: React.ReactNode;
    canvas?: boolean;
    hidden?: boolean;
} & React.ComponentProps<T>;
export declare function Element<T extends React.ElementType>({ id, children, ...elementProps }: ElementProps<T>): React.JSX.Element;

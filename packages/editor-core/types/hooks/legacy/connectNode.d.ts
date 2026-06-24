import React from 'react';
import { Node } from '../../interfaces';
export declare function connectNode<C>(collect?: (state: Node) => C): (WrappedComponent: React.ElementType) => (props: any) => React.JSX.Element;

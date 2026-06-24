import React from 'react';
import { Node } from '../interfaces';
export declare function parseNodeFromJSX(jsx: React.ReactElement<any> | string, normalize?: (node: Node, jsx: React.ReactElement<any>) => void): Node;

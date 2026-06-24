import * as React from 'react';
import { Options } from '../interfaces';
type EditorProps = Partial<Options> & {
    children?: React.ReactNode;
};
/**
 * A React Component that provides the Editor context
 */
export declare const Editor: ({ children, ...options }: EditorProps) => React.JSX.Element;
export {};

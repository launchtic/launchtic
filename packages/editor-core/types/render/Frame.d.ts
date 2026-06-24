import React from 'react';
import { SerializedNodes } from '../interfaces';
export type FrameProps = {
    children?: React.ReactNode;
    json?: string;
    data?: string | SerializedNodes;
};
/**
 * A React Component that defines the editable area
 */
export declare const Frame: ({ children, json, data }: FrameProps) => React.JSX.Element;

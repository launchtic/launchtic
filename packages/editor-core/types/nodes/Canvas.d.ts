import React from 'react';
import { ElementProps } from './Element';
export type CanvasProps<T extends React.ElementType> = ElementProps<T>;
export declare const deprecateCanvasComponent: () => void;
export declare function Canvas<T extends React.ElementType>({ ...props }: CanvasProps<T>): React.JSX.Element;

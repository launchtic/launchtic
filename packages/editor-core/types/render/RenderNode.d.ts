import React from 'react';
type RenderNodeToElementProps = {
    render?: React.ReactElement;
    children?: React.ReactNode;
};
export declare const RenderNodeToElement: ({ render }: RenderNodeToElementProps) => React.ReactElement<{
    render: React.ReactElement;
}, string | React.JSXElementConstructor<any>>;
export {};

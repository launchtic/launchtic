import React from "react";
import { useNode, UserComponent } from "@craftjs/core";
import styled from "styled-components";
import { useNodeState } from "../../editor/hooks/useNodeState";

const PageWrapper = styled.div<{
  $enabled?: boolean;
}>`
  ${({ $enabled }) => $enabled && `padding-bottom: 50px;`}
`;

const PageEmptyPlaceholder = styled.div`
  display: flex;
  min-height: 50px;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1 1 0%;
  height: 199px;
  border-radius: 2px;
  font-weight: bold;
  background-color: rgba(20, 158, 252, 0.09);
  transition: background-color 0.3s, color 0.3s;
  border: 1px dashed #2196F3;
  color: #2196F3;
  font-size: 14px;
`;

const PageEmptyInner = styled.div``;

interface PageProps {
  children?: React.ReactNode;
}

export const Page: UserComponent<PageProps> = ({ children }) => {
  const {
    connectors: { connect, drag },
    node
  } = useNode((node) => ({
    node: node
  }));

  const { enabled } = useNodeState();
  
  // Check whether the page has any child elements
  const isEmpty = !node.data.nodes || node.data.nodes.length === 0;

  return (
    <PageWrapper
      $enabled={enabled}
      ref={(ref: HTMLDivElement | null) => {
        if (ref) connect(drag(ref));
      }}
    >
      {children || (enabled && isEmpty && (
        <PageEmptyPlaceholder>
          <PageEmptyInner>
              Drag and drop your first element here
          </PageEmptyInner>
        </PageEmptyPlaceholder>
      ))}
    </PageWrapper>
  );
};

Page.craft = {
  props: {}, // Default to 3 columns
  isCanvas: true,
  displayName: "Page",
};
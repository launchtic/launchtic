import React from "react";
import { useNode } from "@launchtic/editor-core";
import styled from "styled-components";
import { useNodeState } from "../../editor/hooks/useNodeState";
import ColumnDrag from "./ColumnDrag"; // Import ColumnDrag component

const ColumnWrapper = styled.div<{
  start: number;
  end: number;
}>`
  display: flex;
  flex-direction: column;
  grid-column: ${({ start, end }) => `${start} / ${Math.min(end, 13)}`};
`;

const EmptyColumnPlaceholder = styled.div`
  display: flex;
  min-height: 50px;
  flex-direction: column;
  font-size: 16px;
  color: rgb(208, 215, 222);
  text-transform: uppercase;
  justify-content: center;
  align-items: center;
  border: 1px dashed rgb(150, 159, 166);
  transition: box-shadow 0.2s, background-image 0.2s, padding-top 0.2s, background-color 0.2s;
  position: relative;
  z-index: 1;
  flex: 1;
`;

const EmptyColumnInner = styled.div``;

interface ColumnProps {
  size: number;
  index: number;
  children?: React.ReactNode;
}

export const Column = ({ size, index, children }: ColumnProps) => {
  const {
    connectors: { connect, drag },
    parent,
    node
  } = useNode((node) => ({
    parent: node.data.parent,
    node: node
  }));

  const { enabled, query } = useNodeState();
  
  // Check whether the column has any child elements
  const isEmpty = !node.data.nodes || node.data.nodes.length === 0;

  // Get all Columns in the parent Row
  const childrenNodes = parent ? query.node(parent).childNodes : [];
  const childIds = typeof childrenNodes === "function" ? childrenNodes() : childrenNodes;

  // Compute the start position based on the total size of preceding columns
  const start = childIds
    .slice(0, index)
    .reduce((sum: number, childId: string) => {
      const childNode = query.node(childId).get();
      // Only count the size of Column nodes
      if (childNode?.data?.displayName === "Column") {
        return sum + (childNode?.data.props.size || 1);
      }
      return sum;
    }, 1);

  // Compute the end position
  const end = start + size;

  return (
      <ColumnWrapper
        ref={(nodeRef) => {
          if (nodeRef) connect(drag(nodeRef));
        }}
        start={start}
        end={end}
      >
        <ColumnDrag elementType="Column" isEmpty={isEmpty}>
        {/* Render children if present; otherwise show a placeholder when the column is empty */}
        {children || (enabled && isEmpty && (
          <EmptyColumnPlaceholder>
            <EmptyColumnInner />
          </EmptyColumnPlaceholder>
        ))}
        </ColumnDrag>
      </ColumnWrapper>
  );
};

Column.craft = {
  props: {
    size: 4,
    index: 0
  },
  rules: {
    canMoveIn: (nodes: any[]) =>
      nodes.every((node: any) => node.data.displayName !== 'Section'),
  },
  isCanvas: true,
  displayName: "Column",
};
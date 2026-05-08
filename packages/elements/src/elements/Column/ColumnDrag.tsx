import React from "react";
import styled, { css } from "styled-components";
import { useAppContext } from "../../contexts/AppContext";
import { useNode, useEditor } from "@craftjs/core";

interface DragWrapperStyledProps {
  $isDragging: boolean;
  $isDropTarget: boolean;
  $dropPosition?: "before" | "after" | "inside" | null;
  $dropTargetType?: string | null;
  $elementType: string;
  $isEmpty: boolean;
}

const StyledDragWrapper = styled.div<DragWrapperStyledProps>`
  transition: box-shadow 0.3s, background-color 0.3s, padding 0.3s;
  position: relative;
  
  ${({ $isDragging, $isEmpty, $elementType, $isDropTarget }) => 
    $isDragging && $isDropTarget &&  $isEmpty && $elementType === "Column" &&
    css`
      outline-offset: -1px;
      outline: rgb(20, 158, 252) dotted 1px;
      background-color: rgba(75, 182, 255, 0.1);
      background-image: repeating-linear-gradient(transparent, transparent 50%, rgba(75, 182, 255, 0.8) calc(50% - 5px), rgba(75, 182, 255, 0.8) calc(50% + 5px), transparent calc(50% + 5px), transparent);
      display: inherit;
      position: relative;
      z-index: 1;
    `}
`;

export const ColumnDrag: React.FC<{
  children: React.ReactNode;
  elementType: string;
  isEmpty: boolean;
}> = ({ children, elementType, isEmpty }) => {
  const { id } = useNode();
  const { query, enabled } = useEditor((state) => ({
    enabled: state.options.enabled
  }));

  const { dragDrop } = useAppContext();
  const { isDragging, dropIndicator } = dragDrop;

  // Determine the drop target based on the column ID, position, and index
  const isDropTarget = (() => {
    // Base condition: Section cannot be nested inside a Column
    if (!dropIndicator || dropIndicator?.draggedNodeType == "Section" || elementType !== 'Column') return false;

    // If the parent is not a Row, return false
    const node = query.node(id).get();
    const parentId = node.data.parent;
    if (!parentId) return false;

    const parentNode = query.node(parentId).get();
    if (parentNode.data.name !== 'Row') return false;

    // Only treat as a drop target when this exact column is the target
    if (dropIndicator.targetId === id) {
      // This column is the direct target (typically a drop-inside)
      return true;
    }

    // If the parent Row is the target, figure out exactly which column is the drop target
    if (dropIndicator.targetId === parentId) {
      // Get the child nodes of the Row (parent)
      const rowChildNodes = parentNode.data.nodes || [];

      // Find the index of the current column among the Row's children
      const currentColumnIndex = rowChildNodes.indexOf(id);

      // Determine the drop position by index
      return (
        (dropIndicator.position === 'before' && currentColumnIndex === dropIndicator.dropIndex) ||
        (dropIndicator.position === 'after' && currentColumnIndex === dropIndicator.dropIndex - 1)
      );
    }
    
    return false;
  })();

  if (!enabled || !isEmpty) {
    return <>{children}</>;
  }

  return (
    <StyledDragWrapper
      $isDragging={isDragging}
      $isDropTarget={isDropTarget}
      $dropPosition={dropIndicator?.position}
      $dropTargetType={dropIndicator?.targetType}
      $elementType={elementType}
      $isEmpty={isEmpty}
    >
      {children}
    </StyledDragWrapper>
  );
};

export default ColumnDrag;
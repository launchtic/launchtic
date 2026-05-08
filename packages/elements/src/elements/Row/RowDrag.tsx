import React from "react";
import styled, { css } from "styled-components";
import { useAppContext } from "../../contexts/AppContext";
import { useNode, useEditor } from "@craftjs/core";

interface DragWrapperStyledProps {
  $isDragging: boolean;
  $isDropTarget: boolean;
  $dropPosition?: "before" | "after" | null;
  $dropTargetType?: string | null;
  $elementType: string;
}

const StyledDragWrapper = styled.div<DragWrapperStyledProps>`
  transition: box-shadow 0.3s, background-color 0.3s, padding 0.3s;
  position: relative;
  
  /* While dragging a Row element, show a dotted outline around it */
  ${({ $isDragging, $elementType }) =>
    $isDragging && $elementType === "Row" &&
    css`
      outline: 1px dashed rgb(150, 159, 166);
      &::before,
      &::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        height: 5px;
        z-index: 99;
        pointer-events: none;
      }
      
      &::before {
        top: -5px;
      }
      
      &::after {
        bottom: -5px;
      }
    `}
  
  /* Stronger highlight when this node is the target and the Section is the parent */
  ${({ $isDragging, $isDropTarget, $dropPosition, $dropTargetType, $elementType }) => 
    $isDragging && $isDropTarget && (
      ($dropTargetType === "Section" && $elementType === "Row") ||
      ($dropTargetType === "Column" && $elementType === "Row")
    ) && css`
      /* Highlight before the element */
      ${$dropPosition === "before" && css`
        &::before {
          background-color: rgb(20, 158, 252);
          height: 5px;
          opacity: 1;
        }
      `}
      
      /* Highlight after the element */
      ${$dropPosition === "after" && css`
        &::after {
          background-color: rgb(20, 158, 252);
          height: 5px;
          opacity: 1;
        }
      `}
    `}

`;

export const RowDrag: React.FC<{
  children: React.ReactNode;
  elementType: string;
}> = ({ children, elementType }) => {
  const { id } = useNode();
  const { query, enabled } = useEditor((state) => ({
    enabled: state.options.enabled
  }));

  const { dragDrop } = useAppContext();
  const { isDragging, dropIndicator } = dragDrop;

  // Determine the drop target based on the row ID, position, and index
  const isDropTarget = (() => {
    // Base condition: a Section cannot be nested inside another Section
    if (!dropIndicator || dropIndicator?.draggedNodeType == "Section" || elementType !== 'Row') return false;

    // If the parent is not a Section, return false
    const node = query.node(id).get();
    const parentId = node.data.parent;
    if (!parentId) return false;

    const parentNode = query.node(parentId).get();
    // The parent must be a Section OR a Column (for nested rows)
    const isValidParent = parentNode.data.name === 'Section' || parentNode.data.name === 'Column';
    if (!isValidParent) return false;

    // Check whether the current Section is the one being targeted
    if (dropIndicator.targetId !== parentId) return false;

    // Get the child nodes of the Section (parent)
    const sectionChildNodes = parentNode.data.nodes || [];

    // Find the index of this row among the Section's children
    const currentRowIndex = sectionChildNodes.indexOf(id);

    // Determine the drop position
    return (
      (dropIndicator.position === 'before' && currentRowIndex === dropIndicator.dropIndex) ||
      (dropIndicator.position === 'after' && currentRowIndex === dropIndicator.dropIndex - 1)
    );
  })();

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <StyledDragWrapper
      $isDragging={isDragging}
      $isDropTarget={isDropTarget}
      $dropPosition={dropIndicator?.position}
      $dropTargetType={dropIndicator?.targetType}
      $elementType={elementType}
    >
      {children}
    </StyledDragWrapper>
  );
};

export default RowDrag;
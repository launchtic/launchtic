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
  ${({ $isDragging, $elementType }) =>
    $isDragging && $elementType === "Section" &&
    css`
      &::before,
      &::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        height: 5px;
        background-color:rgb(124, 198, 248);
        z-index: 99;
        opacity: 0.2;
        pointer-events: none;
      }
    `}
  
  /* Stronger highlight when this node is the target and the Page is the parent */
  ${({ $isDragging, $isDropTarget, $dropPosition, $dropTargetType, $elementType }) => 
    $isDragging && $isDropTarget && $dropTargetType === "Page" && $elementType === "Section" &&
    css`
      /* Highlight before the element */
      ${$dropPosition === "before" && css`
        &::before {
          background-color: rgb(20, 158, 252);
          height: 5px;
          opacity: 0.8;
        }
       
      `}
      
      ${$dropPosition === "after" && css`
        &::after {
          background-color: rgb(20, 158, 252);
          height: 5px;
          opacity: 0.8;
        }
        
      `}
    `}
`;

export const SectionDrag: React.FC<{
  children: React.ReactNode;
  elementType: string;
}> = ({ children, elementType }) => {
  const { id } = useNode();
  const { query, enabled } = useEditor((state) => ({
    enabled: state.options.enabled
  }));

  const { dragDrop } = useAppContext();
  const { isDragging, dropIndicator } = dragDrop;

  // Determine the drop target based on the section ID, position, and index
  const isDropTarget = (() => {
    // Base condition
    if (!dropIndicator || elementType !== 'Section') return false;

    // Get the children of ROOT
    const rootNode = query.node('ROOT').get();
    const childNodes = rootNode.data.nodes || [];

    // Find the index of this section among ROOT's children
    const currentSectionIndex = childNodes.indexOf(id);

    // Determine the drop position
    return (
      (dropIndicator.position === 'before' && currentSectionIndex === dropIndicator.dropIndex) ||
      (dropIndicator.position === 'after' && currentSectionIndex === dropIndicator.dropIndex - 1)
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

export default SectionDrag;
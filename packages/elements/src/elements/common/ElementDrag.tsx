import React from "react";
import styled, { css } from "styled-components";
import { useAppContext } from "../../contexts/AppContext";
import { useNode, useEditor } from "@launchtic/editor-core";

interface DragWrapperStyledProps {
  $isDragging: boolean;
  $isDropTarget: boolean;
  $dropPosition?: "before" | "after" | "inside" | null;
  $dropTargetType?: string | null;
  $elementType: string;
}

const StyledDragWrapper = styled.div<DragWrapperStyledProps>`
  transition: outline 0.2s, box-shadow 0.3s;
  position: relative;

  ${({ $isDragging }) =>
    $isDragging &&
    css`
      outline: 1px dashed rgba(150, 159, 166, 0.7);
      &::before,
      &::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        z-index: 99;
        pointer-events: none;
      }
    `}

  ${({ $isDragging, $isDropTarget, $dropPosition }) =>
    $isDragging && $isDropTarget &&
    css`
      ${$dropPosition === "before" && css`
        background-color: rgba(75, 182, 255, 0.1);
        &::before {
          outline: rgb(20, 158, 252) solid 2px;
        }
      `}

      ${$dropPosition === "after" && css`
        background-color: rgba(75, 182, 255, 0.1);
        &::after {
          outline: rgb(20, 158, 252) solid 2px;
        }
      `}
    `}
`;

export const ElementDrag: React.FC<{
  children: React.ReactNode;
  elementType: string;
}> = ({ children, elementType }) => {
  const { id } = useNode();
  const { query, enabled } = useEditor((state) => ({
    enabled: state.options.enabled
  }));

  const { dragDrop } = useAppContext();
  const { isDragging, dropIndicator } = dragDrop;

  const isDropTarget = (() => {
    if (!dropIndicator) return false;

    if (dropIndicator.targetId === id) {
      return true;
    }

    const node = query.node(id).get();
    const parentId = node.data.parent;

    if (!parentId) return false;
    if (dropIndicator.targetId !== parentId) return false;

    const parentNode = query.node(parentId).get();
    if (!parentNode) return false;

    const parentChildNodes = parentNode.data.nodes || [];
    const currentElementIndex = parentChildNodes.indexOf(id);

    return (
      (dropIndicator.position === 'before' && currentElementIndex === dropIndicator.dropIndex) ||
      (dropIndicator.position === 'after' && currentElementIndex === dropIndicator.dropIndex - 1)
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

export default ElementDrag;

import React, { useRef, useEffect } from "react";
import styled from "styled-components";
import { useEditor } from "@craftjs/core";

const ResizerDiv = styled.div`
  width: 3px;
  position: absolute;
  top: 0;
  height: 100%;
  background: #2196F3;
  cursor: col-resize;
  z-index: 12;
  transition: background-color 0.2s ease-in-out;

  &::after {
    content: "";
    position: absolute;
    top: calc(50% - 10px);
    left: -2px;
    width: 6px;
    height: 20px;
    border-radius: 1px;
    background-color:rgb(4, 117, 209);
  }
`;

interface ResizerProps {
  index: number;
  parentId: string;
}

export const Resizer: React.FC<ResizerProps> = ({ index, parentId }) => {
  const { query, actions } = useEditor();
  const resizerRef = useRef<HTMLDivElement>(null);

  // Get the list of Columns inside the Row
  const childNodes = query.node(parentId).descendants().filter(nodeId => {
    const node = query.node(nodeId).get();
    return node?.data?.displayName === "Column";
  });

  useEffect(() => {
    if (!resizerRef.current || !childNodes.length || index >= childNodes.length - 1) return;

    // Get the current column
    const currentColumnId = childNodes[index];
    const currentColumnDOM = query.node(currentColumnId).get()?.dom;
    
    if (!currentColumnDOM) return;
    
    // Compute the position between the two columns
    const currentRect = currentColumnDOM.getBoundingClientRect();
    const parentRect = currentColumnDOM.parentElement?.getBoundingClientRect();
    
    if (!parentRect) return;
    
    // Set position
    const leftPosition = currentRect.right - parentRect.left;
    resizerRef.current.style.left = `${leftPosition}px`;
  }, [childNodes, index, query]);

  if (childNodes.length <= 1 || index >= childNodes.length - 1) {
    return null;
  }

  const handleResize = (index: number, diff: number) => {
    if (index >= childNodes.length - 1) return;

    const currentColumnId = childNodes[index];
    const nextColumnId = childNodes[index + 1];

    const currentSize = query.node(currentColumnId).get()?.data.props.size || 1;
    const nextSize = query.node(nextColumnId).get()?.data.props.size || 1;

    if ((diff > 0 && nextSize - diff < 1) || (diff < 0 && currentSize + diff < 1)) return;

    const newCurrentSize = currentSize + diff;
    const newNextSize = nextSize - diff;

    if (newCurrentSize + newNextSize > 12) return;

    actions.setProp(currentColumnId, (props: any) => { props.size = newCurrentSize; });
    actions.setProp(nextColumnId, (props: any) => { props.size = newNextSize; });
  };

  const onResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    // Hide the resize handle while dragging starts
    if (resizerRef.current) {
      resizerRef.current.style.visibility = 'hidden';
    }
    
    let startX = e.clientX;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const diff = Math.round((moveEvent.clientX - startX) / 18);
      if (diff !== 0) {
        handleResize(index, diff);
        startX += diff * 18;
      }
    };

    const onMouseUp = () => {
      // Update position and show the resize handle again
      if (resizerRef.current) {
        // Wait one frame for the DOM to update
        requestAnimationFrame(() => {
          const currentColumnId = childNodes[index];
          const currentColumnDOM = query.node(currentColumnId).get()?.dom;
          
          if (currentColumnDOM) {
            const currentRect = currentColumnDOM.getBoundingClientRect();
            const parentRect = currentColumnDOM.parentElement?.getBoundingClientRect();
            
            if (parentRect && resizerRef.current) {
              const leftPosition = currentRect.right - parentRect.left;
              resizerRef.current.style.left = `${leftPosition}px`;
              resizerRef.current.style.visibility = 'visible';
            }
          }
        });
      }
      
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <ResizerDiv 
      ref={resizerRef} 
      onMouseDown={onResizeStart}
    />
  );
};
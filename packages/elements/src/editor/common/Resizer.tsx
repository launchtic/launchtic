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

  const onResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();

    // Hide the resize handle while dragging.
    if (resizerRef.current) resizerRef.current.style.visibility = 'hidden';

    const ids = childNodes;
    const curId = ids[index];
    const nextId = ids[index + 1];
    const getDom = (cid: string) => query.node(cid).get()?.dom as HTMLElement | undefined;
    const curDom = getDom(curId);
    const nextDom = getDom(nextId);
    const origCur = query.node(curId).get()?.data.props.size || 1;
    const origNext = query.node(nextId).get()?.data.props.size || 1;
    const pairTotal = origCur + origNext;
    // Grid start of the current column (1 + sizes of all preceding columns).
    // Only the pair's boundary moves while resizing — the columns after the pair
    // don't shift because curSize + nextSize stays constant.
    let startCol = 1;
    for (let k = 0; k < index; k++) startCol += (query.node(ids[k]).get()?.data.props.size || 1);

    const startX = e.clientX;
    let curSize = origCur;
    let nextSize = origNext;

    // Preview by writing grid-column DIRECTLY on the two column DOMs — no setProp,
    // so Craft doesn't re-render the columns' (heavy) children on every step. That
    // per-step re-render was the resize lag. We commit the size once on release.
    const onMouseMove = (moveEvent: MouseEvent) => {
      const diff = Math.round((moveEvent.clientX - startX) / 18);
      let c = origCur + diff;
      let n = origNext - diff;
      if (c < 1) { c = 1; n = pairTotal - 1; }
      if (n < 1) { n = 1; c = pairTotal - 1; }
      if (c === curSize && n === nextSize) return;
      curSize = c; nextSize = n;
      if (curDom)  curDom.style.gridColumn  = `${startCol} / ${Math.min(startCol + curSize, 13)}`;
      if (nextDom) nextDom.style.gridColumn = `${startCol + curSize} / ${Math.min(startCol + curSize + nextSize, 13)}`;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      // Commit the final sizes once (single re-render).
      if (curSize !== origCur || nextSize !== origNext) {
        actions.setProp(curId, (props: any) => { props.size = curSize; });
        actions.setProp(nextId, (props: any) => { props.size = nextSize; });
      }

      // After the prop-driven re-render takes over, drop the inline previews and
      // reposition the handle.
      requestAnimationFrame(() => {
        if (curDom) curDom.style.gridColumn = "";
        if (nextDom) nextDom.style.gridColumn = "";
        const dom = getDom(curId);
        const parentRect = dom?.parentElement?.getBoundingClientRect();
        if (resizerRef.current) {
          if (dom && parentRect) {
            resizerRef.current.style.left = `${dom.getBoundingClientRect().right - parentRect.left}px`;
          }
          resizerRef.current.style.visibility = 'visible';
        }
      });
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
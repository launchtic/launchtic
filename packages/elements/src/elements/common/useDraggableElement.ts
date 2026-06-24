import { useState, useEffect, useCallback, useRef } from "react";
import { useNode } from "@launchtic/editor-core";
import { v4 as uuidv4 } from "uuid";

export const useDraggableElement = <T extends Record<string, any>>(prefix: string, propKey: keyof T) => {
  const { actions, connectors } = useNode();
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  const [elementId] = useState(() => {
    return `${prefix}-${Math.random().toString(16).substring(2, 10)}`;
  });

  const UUIDWrapper = useRef(uuidv4()).current;

  const refCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setElement(node);
      connectors.connect(connectors.drag(node));
    }
  }, [connectors]);

  useEffect(() => {
    actions.setProp((props: T) => {
      if (!props[propKey]) {
        props[propKey] = elementId as T[keyof T];
      }
    }, 500);
  }, [elementId, actions, propKey]);

  return { ref: refCallback, elementId, UUIDWrapper };
};

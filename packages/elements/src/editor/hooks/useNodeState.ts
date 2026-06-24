import { useNode, useEditor } from "@launchtic/editor-core";
import { useAppContext } from "../../contexts/AppContext";

export const useNodeState = () => {
  const { id } = useNode();
  const { actions, query } = useEditor();

  const { isActive } = useEditor((state) => ({
    isActive: state.events.selected?.has(id),
  }));

  const { isHover, displayName } = useNode((node) => ({
    isHover: node.events.hovered,
    displayName: node.data.displayName || null,
  }));

  const { enabled } = useEditor((state) => ({
    enabled: state.options.enabled,
  }));

  return {
    id,
    isActive,
    isHover,
    enabled,
    displayName,

    actions,
    query
  };
};

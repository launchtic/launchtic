import React from "react";
import { useEditor } from "@craftjs/core";
import styled from "styled-components";
import { LightButton } from "./layout/EditorUI";

// Styled component cho SettingsPanel
const PanelContainer = styled.div`
  background-color: #ffffff;
  padding: 20px;
  border-left: 1px solid #ccc;
`;


export const SettingsPanel: React.FC = () => {
  const { selected, actions } = useEditor((state, query) => {
    const [currentNodeId] = state.events.selected;
    if (!currentNodeId) return { selected: null };

    return {
      selected: {
        id: currentNodeId,
        name: state.nodes[currentNodeId]?.data?.displayName || "Unnamed Node",
        settings: state.nodes[currentNodeId]?.related?.settings,
        isDeletable: query.node(currentNodeId).isDeletable(),
      },
    };
  });

  return selected ? (
    <PanelContainer>
      <LightButton $small onClick={() => actions.clearEvents()}>⬅ Back to elements</LightButton>
      <p>Selected: {selected.name}</p>
      {selected.settings && React.createElement(selected.settings)}
    </PanelContainer>
  ) : (
    <PanelContainer>
      <p>No element selected</p>
    </PanelContainer>
  );
};

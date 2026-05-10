// src/components/editor/Header.tsx
import React, { useMemo } from "react";

declare global { interface Window { data?: any } }
import { useEditor } from "@craftjs/core";
import { useEditorContext } from "../../contexts/EditorContext";
import {
  HeaderContainer,
  HeaderSettingsWrapper,
  HeaderBrandWrapper,
  BreadcrumbsWrapper,
  BreadcrumbsItem,
  LightButton,
  HeaderActionsWrapper,
} from "./common/EditorUI";

const Header: React.FC = () => {
  // Simple and clean — only pull what we need
  const { selectedNodeId, actions, query, canUndo, canRedo } = useEditor((state, query) => ({
    selectedNodeId: Array.from(state.events.selected)[0] || null,
    canUndo: query.history.canUndo(),
    canRedo: query.history.canRedo(),
  }));

  // Clean: consume from context only — no props needed
  const { updatePage, isSaving, hasUnsavedChanges } = useEditorContext();

  // Memoize breadcrumbs computation
  const breadcrumbLayers = useMemo(() => {
    if (!selectedNodeId) return [];
    
    let currentNodeId: string | null = selectedNodeId;
    let layers: { id: string; name: string }[] = [];
    let count = 0;
  
    while (currentNodeId && count < 5) {
      try {
        const node = query.node(currentNodeId).get();
        if (!node) break;
  
        if (node.data.displayName !== "Page") {
          layers.unshift({ id: node.id, name: node.data.displayName || node.id });
          count++;
        }
  
        currentNodeId = node.data.parent || null;
      } catch (error) {
        console.warn("Error building breadcrumbs:", error);
        break;
      }
    }
  
    return layers;
  }, [selectedNodeId, query]);

  const handleSave = async () => {
    try {
      const content = query.serialize();
      await updatePage(content);
    } catch (error) {
      console.error("❌ Save failed:", error);
      alert(error instanceof Error ? error.message : 'Save failed');
    }
  };

  const handleBack = () => {
    const backUrl = window.data?.backUrl;
    if (backUrl) {
      window.location.href = backUrl;
    } else {
      window.history.back();
    }
  };

  const handlePreview = () => {
    const previewUrl = window.data?.previewUrl;
    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSelectLayer = (nodeId: string) => {
    actions.selectNode(nodeId);
  };

  return (
    <HeaderContainer>
      <HeaderBrandWrapper>
        <img
          src={window.data?.logoFavicon || '/logo-light.svg'}
          alt="launchtic"
          onError={(e) => { e.currentTarget.src = '/logo-light.svg'; }}
        />
      </HeaderBrandWrapper>
      <HeaderSettingsWrapper>
        <LightButton $small disabled={!canUndo} onClick={() => actions.history.undo()}>
          <i className="fa-solid fa-rotate-left"></i>
        </LightButton>
        <LightButton $small disabled={!canRedo} onClick={() => actions.history.redo()}>
          <i className="fa-solid fa-rotate-right"></i>
        </LightButton>
      </HeaderSettingsWrapper>

      <BreadcrumbsWrapper>
        {breadcrumbLayers.length > 0 &&
          breadcrumbLayers.map((layer) => (
            <BreadcrumbsItem
              key={layer.id}
              onClick={() => handleSelectLayer(layer.id)}
              $active={layer.id === selectedNodeId}
            >
              {layer.name}
            </BreadcrumbsItem>
          ))}
      </BreadcrumbsWrapper>

      <HeaderActionsWrapper>
        <LightButton $small onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <i className="fa-solid fa-spinner fa-spin"></i>
              <span style={{ marginLeft: '5px' }}>Saving...</span>
            </>
          ) : (
            <>
              <i className="fa-solid fa-save"></i>
              <span style={{ marginLeft: '5px' }}>Save</span>
              {hasUnsavedChanges && <span style={{ color: '#ff6b6b', marginLeft: '3px' }}>•</span>}
            </>
          )}
        </LightButton>
        
        <LightButton $small onClick={handlePreview} disabled={!window.data?.previewUrl} title="View live page">
          <i className="fa-solid fa-eye"></i>
        </LightButton>
        
        <LightButton $small onClick={handleBack}>
          <i className="fas fa-sign-out-alt"></i>
        </LightButton>
      </HeaderActionsWrapper>
    </HeaderContainer>
  );
};

export default Header;
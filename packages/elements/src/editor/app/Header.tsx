import React, { useMemo, useEffect, useState } from "react";

declare global { interface Window { data?: any } }
import { useEditor } from "@launchtic/editor-core";
import { useEditorContext } from "./EditorContext";
import {
  HeaderContainer,
  HeaderSettingsWrapper,
  HeaderBrandWrapper,
  BreadcrumbsWrapper,
  BreadcrumbsItem,
  LightButton,
  HeaderActionsWrapper,
} from "./layout/EditorUI";
import AiRewriteModal from "./AiRewriteModal";
import AiEditModal, { AI_EDIT_EVENT, type AiEditTarget } from "./AiEditModal";

const Header: React.FC = () => {
  const [showAiRewrite, setShowAiRewrite] = useState(false);
  const [aiEditTarget, setAiEditTarget] = useState<AiEditTarget | null>(null);

  useEffect(() => {
    const open = (e: Event) => setAiEditTarget((e as CustomEvent<AiEditTarget>).detail);
    window.addEventListener(AI_EDIT_EVENT, open);
    return () => window.removeEventListener(AI_EDIT_EVENT, open);
  }, []);
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

  // Keyboard shortcuts: Ctrl/Cmd+S = save, Ctrl/Cmd+Z = undo, Shift+Z or Y = redo.
  // Undo/redo defer to the focused text field's native undo (TipTap / inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        if (!isSaving) handleSave();
        return;
      }
      if (k !== "z" && k !== "y") return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable || ae.closest?.(".ProseMirror"))) return;
      if (k === "z" && !e.shiftKey) { e.preventDefault(); if (canUndo) actions.history.undo(); }
      else { e.preventDefault(); if (canRedo) actions.history.redo(); } // Shift+Z or Y
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSaving, canUndo, canRedo, actions]);

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
        {/* Logo precedence (white-label support — set by EditorApp via
            injectWindowData when the embedding app passes brand props):
              1. window.data.brandLogoUrl  — agency override (light variant
                 preferred since editor chrome is dark)
              2. window.data.logoFavicon   — legacy / favicon fallback
              3. /logo-light.svg           — built-in launchtic mark
            alt text follows brandName when supplied, else "launchtic". */}
        <img
          onClick={handleBack}
          src={window.data?.brandLogoUrl || window.data?.logoFavicon || '/logo-light.svg'}
          alt={window.data?.brandName || 'launchtic'}
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
        <LightButton $small onClick={() => setShowAiRewrite(true)} title="Rewrite copy with AI">
          <i className="fa-solid fa-wand-magic-sparkles"></i>
          <span style={{ marginLeft: '5px' }}>AI</span>
        </LightButton>
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
      {showAiRewrite && <AiRewriteModal onClose={() => setShowAiRewrite(false)} />}
      {aiEditTarget && <AiEditModal target={aiEditTarget} onClose={() => setAiEditTarget(null)} />}
    </HeaderContainer>
  );
};

export default Header;
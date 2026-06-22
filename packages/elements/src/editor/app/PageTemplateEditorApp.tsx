"use client";

import React, { useMemo, useEffect, useRef, useCallback } from "react";
import { Editor, Frame, Element, useEditor } from "@craftjs/core";
import "./historyLimit"; // caps the craft undo/redo timeline (memory)

import {
  Page, Section, Row, Column, Text, Headline, Button, Image, Icon, Video,
  BulletedList, Field, Checkbox, FAQ, Menu, Countdown,
  PaymentButton, PaymentMethod, OfferPrice, Coupon, OrderBump, PhysicalProduct,
  AcceptOfferButton, DeclineOfferButton,
  AppProvider, useAppContext, getValidCraftContent,
} from "../../index";

import { EditorProvider, useEditorContext } from "./EditorContext";
import CustomEventHandlers from "./CustomEventHandlers";
import Header from "./Header";
import Sidebar from "./Sidebar";
import {
  LayoutUi, ContentUi, PageUi, PageWrapper, BodyUI, DeviceWorkAreaUi, MobilePhoneUi,
} from "./layout/EditorUI";

type Props = { templateId: string; workspaceSlug: string };

function injectWindowData(templateId: string, pageJson: string, workspaceSlug: string, stepType: string = "OPTIN") {
  (window as any).data = {
    pageRender: false,
    pageData: { code: templateId, content: pageJson, type: "page", stepType, meta: null },
    saveUrl:        `/api/page-templates/${templateId}`,
    uploadImageUrl: `/api/media/upload`,
    deleteImageUrl: `/api/media/delete`,
    getImagesUrl:   `/api/media`,
    csrfToken: "",
    payment: undefined,
    previewUrl: "",
    // Settings moved from tab-query (?tab=page-templates) to per-tab sub-pages
    // (/settings/page-templates) — keep the back link in sync.
    backUrl: `/${workspaceSlug}/settings/page-templates`,
  };
}

// Debounced autosave — serializes only when saving (never per change), so it
// adds no per-edit cost. Saves ~3s after a change settles.
const AutoSave: React.FC = () => {
  const { query } = useEditor();
  const { hasUnsavedChanges, isSaving, updatePage } = useEditorContext();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasUnsavedChanges || isSaving) return;
    timerRef.current = setTimeout(() => {
      updatePage(query.serialize()).catch(() => { /* surfaced by Save button state */ });
    }, 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [hasUnsavedChanges, isSaving, updatePage, query]);
  return null;
};

// Memoized canvas so save-state changes (isSaving/hasUnsavedChanges/autosave)
// don't cascade Frame → every node → every editor. Re-renders only on
// viewMode/content change. Craft keeps live node state internally.
const EditorCanvas = React.memo(function EditorCanvas({
  viewMode, content,
}: { viewMode: "mobile" | "desktop"; content: string }) {
  return (
    <MobilePhoneUi $viewMode={viewMode}>
      <DeviceWorkAreaUi $viewMode={viewMode}>
        <PageUi>
          <PageWrapper>
            <BodyUI $viewMode={viewMode}>
              <Frame data={getValidCraftContent(content)}>
                <Element is={Page} canvas />
              </Frame>
            </BodyUI>
          </PageWrapper>
        </PageUi>
      </DeviceWorkAreaUi>
    </MobilePhoneUi>
  );
});

const EditorInner: React.FC = () => {
  const appContext = useAppContext();
  const { viewMode, isSidebarCollapsed } = appContext;
  const { isLoading, pageData, hasUnsavedChanges, markAsChanged } = useEditorContext();

  const resolver = useMemo(() => ({
    OrderBump, PhysicalProduct, Field, Checkbox, Text, Button, Headline,
    BulletedList, Image, Icon, Video, Section, Row, Column,
    Page, FAQ, Menu, Countdown, PaymentButton, PaymentMethod, Coupon, OfferPrice,
    AcceptOfferButton, DeclineOfferButton,
  }), []);

  // Stable handlers factory — see EditorApp.tsx for the full reasoning.
  // A new CustomEventHandlers instance per render detaches Craft.js's drop
  // handler mid-drag in production, breaking drag-and-drop.
  const appContextRef = useRef(appContext);
  appContextRef.current = appContext;
  const stableAppContext = useMemo(() => ({
    setIsDragging: (v: boolean) => appContextRef.current.setIsDragging(v),
    setDropTargets: (v: any) => appContextRef.current.setDropTargets(v),
    setDropIndicator: (v: any) => appContextRef.current.setDropIndicator(v),
  }), []);
  const handlersInstanceRef = useRef<CustomEventHandlers | null>(null);
  const createHandlers = useCallback((store: any) => {
    if (!handlersInstanceRef.current) {
      handlersInstanceRef.current = new CustomEventHandlers(
        { store, isMultiSelectEnabled: () => false, removeHoverOnMouseleave: true },
        stableAppContext as any,
      );
    }
    return handlersInstanceRef.current;
  }, [stableAppContext]);
  useEffect(() => () => {
    handlersInstanceRef.current?.destroy();
    handlersInstanceRef.current = null;
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  if (isLoading) {
    return <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", color:"#666" }}>Loading...</div>;
  }

  return (
    <Editor
      handlers={createHandlers}
      enabled={true}
      resolver={resolver}
      onNodesChange={markAsChanged}
    >
      <AutoSave />
      <LayoutUi $isSidebarCollapsed={isSidebarCollapsed}>
        <Header />
        <Sidebar />
        <ContentUi>
          <EditorCanvas viewMode={viewMode} content={pageData.content} />
        </ContentUi>
      </LayoutUi>
    </Editor>
  );
};

export default function PageTemplateEditorApp({ templateId, workspaceSlug }: Props) {
  const [ready, setReady] = React.useState(false);

  useEffect(() => {
    fetch(`/api/page-templates/${templateId}`)
      .then((r) => r.json())
      .then((res) => {
        const template = res.data ?? res;
        const pageJson = typeof template.pageJson === "string"
          ? template.pageJson
          : JSON.stringify(template.pageJson ?? {});
        // injectWindowData signature: (templateId, pageJson, workspaceSlug, stepType)
        // Previous bug: passed template.type into the workspaceSlug slot, so
        // backUrl became `/OPTIN/settings...`. Fixed: pass workspaceSlug prop
        // explicitly, template.type as the 4th arg.
        injectWindowData(templateId, pageJson, workspaceSlug, template.type ?? "OPTIN");
        setReady(true);
      })
      .catch(() => { injectWindowData(templateId, "", workspaceSlug, "OPTIN"); setReady(true); });
  }, [templateId, workspaceSlug]);

  if (!ready) {
    return <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", color:"#666" }}>...</div>;
  }

  return (
    <EditorProvider>
      <AppProvider>
        <EditorInner />
      </AppProvider>
    </EditorProvider>
  );
}

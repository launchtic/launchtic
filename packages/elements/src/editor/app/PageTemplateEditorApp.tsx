"use client";

import React, { useMemo, useEffect, useRef, useCallback } from "react";
import { Editor, Frame, Element } from "@craftjs/core";

import {
  Page, Section, Row, Column, Text, Headline, Button, Image, Icon, Video,
  BulletedList, Field, Checkbox, FAQ, Menu, Countdown,
  PaymentButton, PaymentMethod, OfferPrice, Coupon, OrderBump, PhysicalProduct,
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
    backUrl: `/${workspaceSlug}/settings?tab=page-templates`,
  };
}

const EditorInner: React.FC = () => {
  const appContext = useAppContext();
  const { viewMode, isSidebarCollapsed } = appContext;
  const { isLoading, pageData, hasUnsavedChanges, markAsChanged } = useEditorContext();

  const resolver = useMemo(() => ({
    OrderBump, PhysicalProduct, Field, Checkbox, Text, Button, Headline,
    BulletedList, Image, Icon, Video, Section, Row, Column,
    Page, FAQ, Menu, Countdown, PaymentButton, PaymentMethod, Coupon, OfferPrice,
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
      <LayoutUi $isSidebarCollapsed={isSidebarCollapsed}>
        <Header />
        <Sidebar />
        <ContentUi>
          <MobilePhoneUi $viewMode={viewMode}>
            <DeviceWorkAreaUi $viewMode={viewMode}>
              <PageUi>
                <PageWrapper>
                  <BodyUI $viewMode={viewMode}>
                    <Frame data={getValidCraftContent(pageData.content)}>
                      <Element is={Page} canvas />
                    </Frame>
                  </BodyUI>
                </PageWrapper>
              </PageUi>
            </DeviceWorkAreaUi>
          </MobilePhoneUi>
        </ContentUi>
      </LayoutUi>
    </Editor>
  );
};

export default function PageTemplateEditorApp({ templateId }: Props) {
  const [ready, setReady] = React.useState(false);

  useEffect(() => {
    fetch(`/api/page-templates/${templateId}`)
      .then((r) => r.json())
      .then((res) => {
        const template = res.data ?? res;
        const pageJson = typeof template.pageJson === "string"
          ? template.pageJson
          : JSON.stringify(template.pageJson ?? {});
        injectWindowData(templateId, pageJson, template.type ?? "OPTIN");
        setReady(true);
      })
      .catch(() => { injectWindowData(templateId, "", "OPTIN"); setReady(true); });
  }, [templateId]);

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

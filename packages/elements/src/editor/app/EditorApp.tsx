"use client";

import React, { useMemo, useEffect, useRef, useCallback } from "react";
import { Editor, Frame, Element } from "@craftjs/core";

// Elements from this package
import {
  Page,
  Section,
  Row,
  Column,
  Text,
  Headline,
  Button,
  Image,
  Icon,
  Video,
  BulletedList,
  Field,
  Checkbox,
  FAQ,
  Menu,
  Countdown,
  PaymentButton,
  PaymentMethod,
  OfferPrice,
  Coupon,
  OrderBump,
  PhysicalProduct,
  AcceptOfferButton,
  DeclineOfferButton,
  AppProvider,
  useAppContext,
  getValidCraftContent,
  PageFontApplier,
} from "../../index";

// Editor UI
import { EditorProvider, useEditorContext } from "./EditorContext";
import CustomEventHandlers from "./CustomEventHandlers";
import Header from "./Header";
import Sidebar from "./Sidebar";
import {
  LayoutUi,
  ContentUi,
  PageUi,
  PageWrapper,
  BodyUI,
  DeviceWorkAreaUi,
  MobilePhoneUi,
} from "./layout/EditorUI";

type Props = {
  funnelStepId: string;
  rendererUrl: string;
  workspaceSlug: string;
  // White-label overrides forwarded by the embedding app (web side reads
  // them from Organization.brandingConfig when plan grants whiteLabel).
  // Both optional — when null/undefined the editor falls back to the
  // launchtic mark + alt text.
  brandLogoUrl?: string | null;
  brandName?:    string | null;
  // A/B testing: when set, the editor loads & saves THIS variant's page
  // instead of the step's main page. Step-level data (type, meta, products,
  // slug) is still read from the step — variants only differ in pageJson.
  variantId?:    string | null;
};

function stepViewUrl(rendererUrl: string, primaryDomain: string | null, slug: string) {
  if (primaryDomain) {
    const { port, protocol } = new URL(rendererUrl);
    const portSuffix = port ? `:${port}` : "";
    return `${protocol}//${primaryDomain}${portSuffix}/${slug}`;
  }
  return `${rendererUrl}/${slug}`;
}

// Inject window.data for EditorContext + Header to read.
// `brandLogoUrl` + `brandName` are read by Header.tsx for white-label.
function injectWindowData(
  funnelStepId: string,
  pageJson: string,
  stepType = "OPTIN",
  meta: Record<string, unknown> | null = null,
  paymentData?: any,
  previewUrl?: string,
  backUrl?: string,
  brandLogoUrl?: string | null,
  brandName?:    string | null,
  // Where pageJson saves go. Defaults to the step; A/B variant editing
  // points it at the variant endpoint.
  saveUrl?: string,
) {
  (window as any).data = {
    pageRender: false,
    pageData: {
      code:     funnelStepId,
      content:  pageJson,
      type:     "page",
      stepType,
      meta,
    },
    saveUrl:        saveUrl ?? `/api/funnel-steps/${funnelStepId}`,
    uploadImageUrl: `/api/media/upload`,
    deleteImageUrl: `/api/media/delete`,
    getImagesUrl:   `/api/media`,
    csrfToken: "",
    payment: paymentData ?? undefined,
    previewUrl: previewUrl ?? "",
    backUrl: backUrl ?? "",
    brandLogoUrl: brandLogoUrl ?? null,
    brandName:    brandName    ?? null,
  };
}

// Inner component — reads context
const EditorInner: React.FC = () => {
  const appContext = useAppContext();
  const { viewMode, isSidebarCollapsed } = appContext;
  const { isLoading, pageData, hasUnsavedChanges, markAsChanged, meta } = useEditorContext();
  const pageFont = (meta?.font ?? null) as { fontType?: string; fontFamily?: string; fontStyle?: string } | null;

  const resolver = useMemo(() => ({
    OrderBump, PhysicalProduct, Field, Checkbox, Text, Button, Headline,
    BulletedList, Image, Icon, Video, Section, Row, Column,
    Page, FAQ, Menu, Countdown, PaymentButton, PaymentMethod,
    Coupon, OfferPrice, AcceptOfferButton, DeclineOfferButton,
  }), []);

  // Keep a stable reference to appContext so the handlers factory below
  // can stay referentially stable across renders. Re-creating the handlers
  // mid-drag (e.g. when onNodesChange triggers a re-render between dragover
  // and drop) detaches Craft.js's drop handler from the canvas and the
  // drop event lands on a fresh instance with empty state — breaking
  // drag-and-drop in production builds where the React scheduler flushes
  // state updates more aggressively than in dev.
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
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", color: "#666" }}>
        Loading...
      </div>
    );
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
                    <PageFontApplier font={pageFont}>
                      <Frame data={getValidCraftContent(pageData.content)}>
                        <Element is={Page} canvas />
                      </Frame>
                    </PageFontApplier>
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

// Outer component — fetches page JSON from API then injects window.data
export default function EditorApp({ funnelStepId, rendererUrl, workspaceSlug, brandLogoUrl, brandName, variantId }: Props) {
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/funnel-steps/${funnelStepId}`)
      .then((r) => r.json())
      .then(async (res) => {
        if (res.success) {
          const step = res.data;
          let pageJson = typeof step.pageJson === "string"
            ? step.pageJson
            : JSON.stringify(step.pageJson ?? {});

          // A/B variant editing: load THIS variant's page and redirect saves
          // to the variant endpoint. Step type/meta/products (below) stay
          // step-scoped. Falls back to the step page if the variant fails.
          let saveUrl: string | undefined;
          if (variantId) {
            try {
              const vres = await fetch(`/api/step-variants/${variantId}`).then((r) => r.json());
              if (vres.success && vres.data) {
                pageJson = typeof vres.data.pageJson === "string"
                  ? vres.data.pageJson
                  : JSON.stringify(vres.data.pageJson ?? {});
                saveUrl = `/api/step-variants/${variantId}`;
              }
            } catch { /* keep step page + default saveUrl */ }
          }

          let paymentData: any = undefined;
          if (step.type === "CHECKOUT") {
            const [plansRes, physProdRes, bumpsRes] = await Promise.all([
              fetch(`/api/funnel-steps/${funnelStepId}/price-plans`).then((r) => r.json()),
              step.offerType === "PHYSICAL" && step.physicalProductId
                ? fetch(`/api/physical-products/${step.physicalProductId}`).then((r) => r.json())
                : Promise.resolve(null),
              fetch(`/api/funnel-steps/${funnelStepId}/order-bumps`).then((r) => r.json()),
            ]);

            const currency = step.funnel?.currency ?? "usd";
            const pricePlans = (Array.isArray(plansRes) ? plansRes : []).map((p: any) => ({
              id: p.id,
              name: p.name,
              description: p.description ?? undefined,
              type: p.type,
              directChargeAmount: p.amount,
              currency,
              interval: p.interval ?? undefined,
              trialDays: p.trialDays ?? undefined,
              isLimited: false,
              taxBehavior: "EXCLUSIVE",
            }));

            let physicalProduct = undefined;
            if (physProdRes && !physProdRes.error) {
              physicalProduct = {
                id: physProdRes.id,
                name: physProdRes.name,
                description: physProdRes.description,
                images: physProdRes.images ?? [],
                price: physProdRes.price,
                currency: physProdRes.currency,
                tax: physProdRes.tax ?? 0,
                taxBehavior: physProdRes.taxBehavior ?? "EXCLUSIVE",
                disableShipping: physProdRes.disableShipping ?? false,
                options: physProdRes.options ?? [],
                variants: physProdRes.variants ?? [],
              };
            }

            const rawBumps = Array.isArray(bumpsRes) ? bumpsRes : [];

            // Fetch physical products for PHYSICAL bumps
            const physicalBumpProductIds = rawBumps
              .filter((b: any) => b.offerType === "PHYSICAL" && b.physicalProductId)
              .map((b: any) => b.physicalProductId as string);
            const physProdMap: Record<string, any> = {};
            await Promise.all(physicalBumpProductIds.map(async (pid: string) => {
              const res = await fetch(`/api/physical-products/${pid}`).then(r => r.json());
              if (res && !res.error) physProdMap[pid] = res;
            }));

            const orderBumps = rawBumps.map((b: any) => {
              const plan = b.pricePlans?.[0] ?? null;
              const physProd = b.physicalProductId ? (physProdMap[b.physicalProductId] ?? null) : null;
              return {
                id: b.id,
                name: b.name,
                headline: b.headline ?? null,
                offerType: b.offerType ?? null,
                shippingFee: b.shippingFee ?? 0,
                pricePlan: plan ? {
                  id: plan.id, name: plan.name, type: plan.type,
                  amount: plan.amount, currency: plan.currency,
                  interval: plan.interval ?? null, trialDays: plan.trialDays ?? null,
                } : null,
                physicalProduct: physProd
                  ? { id: physProd.id, price: physProd.price, currency: physProd.currency }
                  : null,
              };
            });

            paymentData = {
              paymentMethods: ["stripe"],
              offer: { pricePlans },
              currency,
              checkedPlanId: pricePlans[0]?.id ?? "",
              selectedPaymentMethod: "stripe",
              physicalProduct,
              orderBumps,
            };
          } else if ((step.type === "UPSELL" || step.type === "DOWNSELL")
                     && step.offerType === "PHYSICAL"
                     && step.physicalProductId) {
            // Editor preview for PHYSICAL upsell/downsell. Mirrors the renderer's
            // page-loader.ts PHYSICAL branch so PhysicalProduct + OfferPrice
            // elements read variants/price/shipping from window.data.payment
            // exactly like they do on the published page.
            const physProdRes = await fetch(`/api/physical-products/${step.physicalProductId}`).then((r) => r.json());
            if (physProdRes && !physProdRes.error) {
              const currency    = step.funnel?.currency ?? "usd";
              const shippingFee = step.shippingFee ?? 0;
              paymentData = {
                paymentMethods: ["stripe"],
                offer: { pricePlans: [] },
                currency,
                checkedPlanId: "",
                selectedPaymentMethod: "stripe",
                physicalProduct: {
                  id: physProdRes.id,
                  name: physProdRes.name,
                  description: physProdRes.description,
                  images: physProdRes.images ?? [],
                  price: physProdRes.price,
                  currency: physProdRes.currency,
                  tax: physProdRes.tax ?? 0,
                  taxBehavior: physProdRes.taxBehavior ?? "EXCLUSIVE",
                  disableShipping: physProdRes.disableShipping ?? false,
                  options: physProdRes.options ?? [],
                  variants: physProdRes.variants ?? [],
                },
                shippingFee,
                orderBumps: [],
              };
            }
          }

          const previewUrl = step.slug ? stepViewUrl(rendererUrl, step.funnel?.primaryDomain ?? null, step.slug) : "";
          const backUrl = step.funnel?.id ? `/${workspaceSlug}/funnels/${step.funnel.id}` : `/${workspaceSlug}/funnels`;
          injectWindowData(funnelStepId, pageJson, step.type, step.meta, paymentData, previewUrl, backUrl, brandLogoUrl, brandName, saveUrl);
          setReady(true);
        } else {
          injectWindowData(funnelStepId, "", "OPTIN", null, undefined, undefined, undefined, brandLogoUrl, brandName);
          setReady(true);
        }
      })
      .catch(() => {
        injectWindowData(funnelStepId, "", "OPTIN", null, undefined, undefined, undefined, brandLogoUrl, brandName);
        setReady(true);
      });
    // brandLogoUrl + brandName are stable per render (server-side resolved
    // before mount), so re-including them in deps is purely defensive.
  }, [funnelStepId, rendererUrl, brandLogoUrl, brandName, variantId]);

  if (error) {
    return <div style={{ padding: 24, color: "red" }}>Error: {error}</div>;
  }

  if (!ready) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", color: "#666" }}>
        ...
      </div>
    );
  }

  return (
    <EditorProvider>
      <AppProvider>
        <EditorInner />
      </AppProvider>
    </EditorProvider>
  );
}

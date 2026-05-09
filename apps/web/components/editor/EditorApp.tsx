"use client";

import React, { useMemo, useEffect } from "react";
import { Editor, Frame, Element } from "@craftjs/core";

// Elements from shared package
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
  AppProvider,
  useAppContext,
  getValidCraftContent,
  PageFontApplier,
} from "@launchtic/elements";

// Editor UI
import { EditorProvider, useEditorContext } from "../../contexts/EditorContext";
import CustomEventHandlers from "./handlers/CustomEventHandlers";
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
} from "./common/EditorUI";

type Props = {
  funnelStepId: string;
  rendererUrl: string;
};

function stepViewUrl(rendererUrl: string, primaryDomain: string | null, slug: string) {
  if (primaryDomain) {
    const { port, protocol } = new URL(rendererUrl);
    const portSuffix = port ? `:${port}` : "";
    return `${protocol}//${primaryDomain}${portSuffix}/${slug}`;
  }
  return `${rendererUrl}/${slug}`;
}

// Inject window.data for EditorContext to read
function injectWindowData(
  funnelStepId: string,
  pageJson: string,
  stepType = "OPTIN",
  meta: Record<string, unknown> | null = null,
  paymentData?: any,
  previewUrl?: string,
  backUrl?: string,
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
    saveUrl:        `/api/funnel-steps/${funnelStepId}`,
    uploadImageUrl: `/api/media/upload`,
    deleteImageUrl: `/api/media/delete`,
    getImagesUrl:   `/api/media`,
    csrfToken: "",
    payment: paymentData ?? undefined,
    previewUrl: previewUrl ?? "",
    backUrl: backUrl ?? "",
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
    Coupon, OfferPrice,
  }), []);

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
      handlers={(store) =>
        new CustomEventHandlers(
          { store, isMultiSelectEnabled: () => false, removeHoverOnMouseleave: true },
          appContext
        )
      }
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
export default function EditorApp({ funnelStepId, rendererUrl }: Props) {
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/funnel-steps/${funnelStepId}`)
      .then((r) => r.json())
      .then(async (res) => {
        if (res.success) {
          const step = res.data;
          const pageJson = typeof step.pageJson === "string"
            ? step.pageJson
            : JSON.stringify(step.pageJson ?? {});

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
          }

          const previewUrl = step.slug ? stepViewUrl(rendererUrl, step.funnel?.primaryDomain ?? null, step.slug) : "";
          const backUrl = step.funnelId ? `/funnels/${step.funnelId}` : "/funnels";
          injectWindowData(funnelStepId, pageJson, step.type, step.meta, paymentData, previewUrl, backUrl);
          setReady(true);
        } else {
          injectWindowData(funnelStepId, "");
          setReady(true);
        }
      })
      .catch(() => {
        injectWindowData(funnelStepId, "");
        setReady(true);
      });
  }, [funnelStepId, rendererUrl]);

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

import React, { useEffect, useRef, useState } from "react";
import { collectFormData, validateFormData } from "../../utils/formHelpers";
import { useEditor } from "@launchtic/editor-core";
import { usePageRender } from "../../contexts/PageRenderContext";
import { useSafePayment } from "../../contexts/PaymentContext";

interface Props {
  onError?: (msg: string) => void;
  onSuccess?: (nextStepUrl: string | null) => void;
  onProcessing?: (loading: boolean) => void;
}

declare global {
  interface Window { paypal?: any; data?: any; }
}

export function PayPalButtonWrapper({ onError, onSuccess, onProcessing }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const { query } = useEditor();
  const pageRenderContext = usePageRender();

  // Get live payment context state
  const {
    selectedPlan,
    couponCode,
    selectedBumpIds,
    physicalSelection,
    isPhysicalProduct,
    basePrice,
    couponDiscountAmount,
  } = useSafePayment();

  // Keep a ref so PayPal async callbacks always read current values
  const paymentStateRef = useRef({
    selectedPlan,
    couponCode,
    selectedBumpIds,
    physicalSelection,
    isPhysicalProduct,
  });
  useEffect(() => {
    paymentStateRef.current = { selectedPlan, couponCode, selectedBumpIds, physicalSelection, isPhysicalProduct };
  }, [selectedPlan, couponCode, selectedBumpIds, physicalSelection, isPhysicalProduct]);

  // Load PayPal SDK once. Currency must match what the order/subscription request will use,
  // otherwise PayPal rejects with "Expected currency from order api call to be USD, got XYZ".
  useEffect(() => {
    const clientId = window.data?.payment?.paypalClientId;
    if (!clientId) return;
    if (window.paypal) { setSdkReady(true); return; }

    const sdkCurrency = (
      isPhysicalProduct
        ? (window as any)?.data?.payment?.physicalProduct?.currency
        : selectedPlan?.currency
    )?.toUpperCase() ?? "USD";

    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&vault=true&components=buttons&currency=${sdkCurrency}`;
    script.dataset["sdkIntegrationSource"] = "button-factory";
    script.onload  = () => setSdkReady(true);
    script.onerror = () => onError?.("Failed to load PayPal SDK");
    document.body.appendChild(script);
  }, []);

  // Effective recurring amount after coupon. If $0 forever, treat as one-time (only bump charged today).
  const effectiveSubAmount = isPhysicalProduct ? 0 : Math.max(0, basePrice - couponDiscountAmount);
  const isSubscription = selectedPlan?.type !== "ONE_TIME" && selectedPlan?.type != null && effectiveSubAmount > 0;

  useEffect(() => {
    if (!sdkReady || !containerRef.current || !window.paypal) return;
    containerRef.current.innerHTML = "";

    const commonOptions = {
      style: { layout: "vertical" as const, color: "gold" as const, shape: "rect" as const, label: "paypal" as const },
      onCancel: () => onProcessing?.(false),
      onError:  (err: any) => { onProcessing?.(false); onError?.(err?.message ?? "PayPal error"); },
    };

    if (isSubscription) {
      window.paypal.Buttons({
        ...commonOptions,
        vault: true,
        createSubscription: async () => {
          const { paypalSubscriptionId } = await initiateCheckout(
            query, pageRenderContext, paymentStateRef, onError, onProcessing,
          );
          if (!paypalSubscriptionId) throw new Error("No subscription ID");
          return paypalSubscriptionId;
        },
        onApprove: async (data: any) => {
          try {
            onProcessing?.(true);
            const res = await fetch("/api/checkout/activate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paypalSubscriptionId: data.subscriptionID,
              }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error ?? "Activation failed");
            onSuccess?.(result.data?.nextStepUrl ?? null);
          } catch (err: any) {
            onError?.(err.message ?? "PayPal subscription activation failed");
          } finally {
            onProcessing?.(false);
          }
        },
      }).render(containerRef.current);
    } else {
      window.paypal.Buttons({
        ...commonOptions,
        createOrder: async () => {
          const { paypalOrderId } = await initiateCheckout(
            query, pageRenderContext, paymentStateRef, onError, onProcessing,
          );
          if (!paypalOrderId) throw new Error("No PayPal order ID");
          return paypalOrderId;
        },
        onApprove: async (data: any) => {
          try {
            onProcessing?.(true);
            const res = await fetch("/api/checkout/capture", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paypalOrderId: data.orderID,
              }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error ?? "Capture failed");
            onSuccess?.(result.data?.nextStepUrl ?? null);
          } catch (err: any) {
            onError?.(err.message ?? "PayPal capture failed");
          } finally {
            onProcessing?.(false);
          }
        },
      }).render(containerRef.current);
    }
  }, [sdkReady, isSubscription]);

  return <div ref={containerRef} style={{ minHeight: 45 }} />;
}

// ─── initiateCheckout ─────────────────────────────────────────────────────────

async function initiateCheckout(
  query: any,
  pageRenderContext: any,
  paymentStateRef: React.RefObject<{
    selectedPlan: any;
    couponCode: string;
    selectedBumpIds: string[];
    physicalSelection: any;
    isPhysicalProduct: boolean;
  }>,
  onError?: (msg: string) => void,
  onProcessing?: (v: boolean) => void,
): Promise<{ paypalOrderId?: string; paypalSubscriptionId?: string }> {

  // Validate form fields
  const { formData, fieldInfo } = collectFormData(query);
  const errors = validateFormData(formData, fieldInfo);
  if (Object.keys(errors).length > 0) {
    if (pageRenderContext?.setErrors) pageRenderContext.setErrors(errors);
    throw new Error("Please fill in all required fields");
  }

  onProcessing?.(true);

  // Read CURRENT payment state from ref (not stale closure)
  const state = paymentStateRef.current;
  const checkedPlanId    = state.selectedPlan?.id ?? window.data?.payment?.checkedPlanId;
  const couponCode       = state.couponCode || null;
  const orderBumpIds     = state.selectedBumpIds?.length ? state.selectedBumpIds : undefined;
  const isPhysical       = state.isPhysicalProduct;
  const physicalSelection = state.physicalSelection;

  const res = await fetch("/api/checkout/intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      funnelStepId:    window.data?.funnelStepId,
      pricePlanId:     checkedPlanId,
      paymentMethod:   "paypal",
      paymentMethodId: null,
      physicalProduct: isPhysical ? {
        id:        window.data?.payment?.physicalProduct?.id,
        variantId: physicalSelection?.variantId ?? null,
        quantity:  physicalSelection?.quantity ?? 1,
        unitPrice: physicalSelection?.unitPrice ?? 0,
      } : undefined,
      customer: {
        email:         formData.email,
        firstName:     formData.firstName,
        lastName:      formData.lastName,
        phone:         formData.phone,
        country:       formData.country,
        city:          formData.city,
        postalCode:    formData.postalCode,
        streetAddress: formData.streetAddress,
        streetNumber:  formData.streetNumber,
        neighborhood:  formData.neighborhood,
        state:         formData.stateProvince,
        company:       formData.companyName,
        taxNumber:     formData.taxNumber,
      },
      shipping: formData.streetAddress ? {
        line1:       formData.streetAddress,
        city:        formData.city,
        postal_code: formData.postalCode,
        country:     formData.country,
      } : undefined,
      couponCode,
      orderBumpIds,
    }),
  });

  const result = await res.json();
  if (!result.success) throw new Error(result.error ?? "Failed to initialize PayPal");

  return {
    paypalOrderId:        result.paypalOrderId,
    paypalSubscriptionId: result.paypalSubscriptionId,
  };
}

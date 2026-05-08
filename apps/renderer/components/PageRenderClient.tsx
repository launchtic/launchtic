"use client";

import { useMemo, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Editor, Frame, Element } from "@craftjs/core";
import DevTestFill from "./DevTestFill";

// Elements
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
  FAQ,
  Menu,
  Field,
  Checkbox,
  Countdown,
  PaymentButton,
  PaymentMethod,
  Coupon,
  OfferPrice,
  OrderBump,
  PhysicalProduct,
  // Contexts
  AppProvider,
  PageRenderProvider,
  PaymentProvider,
  // Utils
  getValidCraftContent,
  PageFontApplier,
} from "@launchtic/elements";

type PageData = {
  funnelStepId: string;
  nextStepUrl: string | null;
  pageJson: Record<string, unknown>;
  payment?: any;
  meta?: Record<string, unknown> | null;
};

export default function PageRenderClient({ pageData }: { pageData: PageData }) {
  // Inject window.data so PaymentContext + PageRenderContext work correctly
  if (typeof window !== "undefined") {
    (window as any).data = {
      funnelStepId: pageData.funnelStepId,
      nextStepUrl: pageData.nextStepUrl,
      payment: pageData.payment ?? null,
    };
  }

  // Initialize Stripe and expose on window for StripeCardWrapper
  useEffect(() => {
    const publishableKey = pageData.payment?.stripePublicKey;
    if (!publishableKey) return;

    const promise = loadStripe(publishableKey);
    (window as any).__stripePromise = promise;

    promise.then((stripe) => {
      (window as any).__stripe = stripe;
      (window as any).__stripeReady = true;
    }).catch((err) => {
      (window as any).__stripeError = err;
    });
  }, [pageData.payment?.stripePublicKey]);

  const resolver = useMemo(() => ({
    Page, Section, Row, Column,
    Text, Headline, Button, Image, Video, BulletedList, Icon,
    FAQ, Menu, Field, Checkbox, Countdown,
    PaymentButton, PaymentMethod, Coupon, OfferPrice, OrderBump, PhysicalProduct,
  }), []);

  const pageFont = (pageData.meta as any)?.font ?? null;

  return (
    <PaymentProvider>
      <AppProvider>
        <PageRenderProvider>
          <Editor enabled={false} resolver={resolver}>
            <PageFontApplier font={pageFont}>
              <Frame data={getValidCraftContent(JSON.stringify(pageData.pageJson))}>
                <Element is={Page} canvas />
              </Frame>
            </PageFontApplier>
          </Editor>
        </PageRenderProvider>
      </AppProvider>
      <DevTestFill />
      {/* Honeypot — hidden from humans, bots that auto-fill all inputs will
          populate this and the API will reject the submission. */}
      <input
        type="text"
        id="lt-website"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        defaultValue=""
        style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </PaymentProvider>
  );
}

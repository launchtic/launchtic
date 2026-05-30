import { useState } from "react";
import { UserComponent } from "@craftjs/core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { ButtonProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { ButtonSettings } from "../Button/ButtonSettings";
import { getValueByViewMode, getAppearanceByViewMode, getBoxShadowValue } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { UpsellPayPalModal } from "./UpsellPayPalModal";
import { UpsellAddressModal, type ShippingAddress } from "./UpsellAddressModal";
import { useSafePayment } from "../../contexts/PaymentContext";

// Offer buttons for UPSELL / DOWNSELL steps. They reuse the regular Button's
// settings panel + styling, but their click does a one-click (off-session)
// purchase ("Accept") or simply routes to the decline branch ("Decline").
// Both read window.data.upsell (injected by the renderer for these steps).

const StyledButton = styled.button<{
  $color?: string; $mobileColor?: string;
  $hoverBackgroundColor?: string; $hoverTextColor?: string;
  $hoverTransform?: string;
  $padding?: ButtonProps["padding"]; $mobilePadding?: ButtonProps["mobilePadding"];
  $fontSize?: number; $mobileFontSize?: number;
  $backgroundColor?: string; $mobileBackgroundColor?: string;
  $lineHeight?: number; $mobileLineHeight?: number;
  $letterSpacing?: number; $mobileLetterSpacing?: number;
  $fontFamily?: string; $fontStyle?: string;
  $width?: string; $mobileWidth?: string;
  $alignSelf?: string; $mobileAlignSelf?: string;
  $boxShadow?: string; $mobileBoxShadow?: string;
  $border?: ButtonProps["border"]; $mobileBorder?: ButtonProps["mobileBorder"];
}>`
  opacity: 1;
  cursor: pointer;
  transition: 0.3s;
  text-decoration: none;
  text-align: center;
  display: inline-block;

  &:disabled { opacity: 0.7; cursor: not-allowed; }

  ${({ $color, $width, $padding, $fontSize, $backgroundColor, $lineHeight, $letterSpacing, $fontFamily, $fontStyle, $boxShadow, $alignSelf }) => css`
    ${$color && `color: ${$color};`}
    ${$alignSelf && `align-self: ${$alignSelf};`}
    ${$width && `width: ${$width === "full" ? "100%" : "auto"};`}
    ${$padding && `padding: ${$padding.paddingTop}px ${$padding.paddingRight}px ${$padding.paddingBottom}px ${$padding.paddingLeft}px;`}
    ${$fontSize && `font-size: ${$fontSize}px;`}
    ${$backgroundColor && `background-color: ${$backgroundColor};`}
    ${$lineHeight && `line-height: ${$lineHeight}px;`}
    ${$letterSpacing !== undefined && `letter-spacing: ${$letterSpacing}px;`}
    ${$fontFamily ? `font-family: ${$fontFamily};` : ""}
    ${$fontStyle?.includes("italic") ? `font-style: italic;` : ""}
    ${$fontStyle ? `font-weight: ${$fontStyle.replace("italic", "")};` : ""}
    ${$boxShadow && `box-shadow: ${getBoxShadowValue($boxShadow)};`}
  `}

  ${({ $border }) => $border && css`
    ${$border.style && `border-style: ${$border.style};`}
    ${$border.color && `border-color: ${$border.color};`}
    ${$border.radius !== undefined && `border-radius: ${$border.radius}px;`}
    ${$border.type === "fullBorder" && $border.width && `border-width: ${$border.width}px;`}
    ${$border.type === "bottomOnly" && $border.width && `border-width: 0px 0px ${$border.width}px;`}
    ${$border.type === "topOnly" && $border.width && `border-width: ${$border.width}px 0px 0px;`}
    ${$border.type === "topAndBottom" && $border.width && `border-width: ${$border.width}px 0px;`}
  `}

  ${({ $hoverBackgroundColor, $hoverTransform, $hoverTextColor }) => css`
    &:hover {
      ${$hoverBackgroundColor && `background: ${$hoverBackgroundColor};`}
      ${$hoverTextColor && `color: ${$hoverTextColor};`}
      ${$hoverTransform && `background: ${$hoverTransform};`}
    }
  `}

  @media (max-width: 800px) {
    ${({ $mobilePadding, $mobileFontSize, $mobileBackgroundColor, $mobileLineHeight, $mobileLetterSpacing, $mobileAlignSelf, $mobileWidth, $mobileBoxShadow }) => css`
      ${$mobileAlignSelf && `align-self: ${$mobileAlignSelf};`}
      ${$mobileWidth && `width: ${$mobileWidth === "full" ? "100%" : "auto"};`}
      ${$mobileFontSize && `font-size: ${$mobileFontSize}px;`}
      ${$mobileBackgroundColor && `background-color: ${$mobileBackgroundColor};`}
      ${$mobileLineHeight && `line-height: ${$mobileLineHeight}px;`}
      ${$mobileLetterSpacing !== undefined && `letter-spacing: ${$mobileLetterSpacing}px;`}
      ${$mobilePadding && `padding: ${$mobilePadding.paddingTop}px ${$mobilePadding.paddingRight}px ${$mobilePadding.paddingBottom}px ${$mobilePadding.paddingLeft}px;`}
      ${$mobileBoxShadow && `box-shadow: ${getBoxShadowValue($mobileBoxShadow)};`}
    `}
    ${({ $mobileBorder }) => $mobileBorder && css`
      ${$mobileBorder.style && `border-style: ${$mobileBorder.style};`}
      ${$mobileBorder.color && `border-color: ${$mobileBorder.color};`}
      ${$mobileBorder.radius !== undefined && `border-radius: ${$mobileBorder.radius}px;`}
      ${$mobileBorder.type === "fullBorder" && $mobileBorder.width && `border-width: ${$mobileBorder.width}px;`}
    `}
  }
`;

const ButtonTextWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
`;

const ButtonError = styled.div`
  margin-top: 8px;
  font-size: 13px;
  color: #ff1800;
  text-align: center;
`;

function redirect(url: string | null | undefined) {
  if (url) window.location.href = url;
}

// Shared renderer for both offer buttons. `kind` switches the click behavior.
function OfferButtonView({ props, kind, indicatorName }: {
  props: ButtonProps; kind: "accept" | "decline"; indicatorName: string;
}) {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("button", "htmlAttrId");
  const { isActive, isHover, enabled } = useNodeState();
  // Read selection + computed prices from PaymentContext — for PHYSICAL upsell
  // offers we need variantId/qty (driven by the PhysicalProduct element) and
  // the basePrice/shippingFee/finalPrice to render the breakdown above the
  // Accept button. Safe to call on DIGITAL pages too; the context just isn't read.
  const payment = useSafePayment();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPayPal, setShowPayPal] = useState(false);
  // PHYSICAL upsell on a digital-main checkout: server returns `requiresShipping`
  // and we collect the address inline before re-POSTing the charge. We hold
  // onto it so a downstream PayPal "pay again" fallback can use it too.
  const [showAddress, setShowAddress] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [inlineShipTo, setInlineShipTo] = useState<ShippingAddress | null>(null);

  const rp = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    mobileMargin: props.mobileMargin,
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    mobilePadding: props.mobilePadding,
    backgroundColor: getValueByViewMode(viewMode, props.backgroundColor, props.mobileBackgroundColor),
    mobileBackgroundColor: props.mobileBackgroundColor,
    fontSize: getValueByViewMode(viewMode, props.fontSize, props.mobileFontSize),
    mobileFontSize: props.mobileFontSize,
    lineHeight: getValueByViewMode(viewMode, props.lineHeight, props.mobileLineHeight),
    mobileLineHeight: props.mobileLineHeight,
    letterSpacing: getValueByViewMode(viewMode, props.letterSpacing, props.mobileLetterSpacing),
    mobileLetterSpacing: props.mobileLetterSpacing,
    fontFamily: props.fontFamily,
    fontStyle: props.fontStyle,
    alignSelf: getValueByViewMode(viewMode, props.alignSelf, props.mobileAlignSelf),
    mobileAlignSelf: props.mobileAlignSelf,
    boxShadow: getValueByViewMode(viewMode, props.boxShadow, props.mobileBoxShadow),
    mobileBoxShadow: props.mobileBoxShadow,
    border: getValueByViewMode(viewMode, props.border, props.mobileBorder),
    mobileBorder: props.mobileBorder,
    htmlAttrId: props.htmlAttrId,
    text: props.text || (kind === "accept" ? "Yes, add it to my order" : "No thanks"),
    width: getValueByViewMode(viewMode, props.width, props.mobileWidth),
    mobileWidth: props.mobileWidth,
    color: getValueByViewMode(viewMode, props.color, props.mobileColor),
    mobileColor: props.mobileColor,
    hover: props.hover || {},
  };

  // The Accept POST is extracted into a thunk so the address modal can re-run
  // it with the just-collected `inlineShipTo` without duplicating any of the
  // response handling (success / requiresShipping / requiresPayment / decline).
  async function performAccept(inlineShipToArg?: ShippingAddress) {
    const data = (window as any).data ?? {};
    const upsell = data.upsell ?? null;
    if (!upsell || !data.funnelStepId) {
      setError("This offer is not configured. Please contact support.");
      return;
    }

    // Snapshot any freshly-collected address into state so the PayPal "pay
    // again" fallback below can re-use it without prompting the buyer twice.
    if (inlineShipToArg) setInlineShipTo(inlineShipToArg);
    const effectiveShipTo = inlineShipToArg ?? inlineShipTo;

    // Body shape depends on offer kind:
    //   digital  → { funnelStepId, pricePlanId }
    //   physical → { funnelStepId, physicalProductId, variantId, quantity, inlineShipTo? }
    // physicalSelection comes from PaymentContext (PhysicalProduct element writes
    // variantId + qty there as the visitor picks options on this page).
    let body: Record<string, unknown>;
    if (upsell.kind === "physical") {
      if (!upsell.physicalProductId) {
        setError("This offer is not configured. Please contact support.");
        return;
      }
      body = {
        funnelStepId:      data.funnelStepId,
        physicalProductId: upsell.physicalProductId,
        variantId:         payment.physicalSelection.variantId,
        quantity:          payment.physicalSelection.quantity,
        ...(effectiveShipTo ? { inlineShipTo: effectiveShipTo } : {}),
      };
    } else {
      if (!upsell.pricePlanId) {
        setError("This offer is not configured. Please contact support.");
        return;
      }
      body = { funnelStepId: data.funnelStepId, pricePlanId: upsell.pricePlanId };
    }

    setError(null);
    setAddressError(null);
    if (inlineShipToArg) setAddressBusy(true); else setLoading(true);

    try {
      const res = await fetch("/api/checkout/upsell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json?.success && json.nextStepUrl) {
        redirect(json.nextStepUrl);
        return;
      }
      // PHYSICAL on a digital-main checkout — server has no shippingAddress
      // to reuse. Open the inline modal; modal submit calls back into this
      // function with the collected address.
      if (json?.requiresShipping) {
        setShowAddress(true);
        setLoading(false);
        setAddressBusy(false);
        return;
      }
      // One-click not possible (PayPal main purchase / no saved card / SCA fail).
      // If PayPal is configured, open the "pay again" modal; otherwise route to
      // decline so the funnel is never blocked.
      if (json?.requiresPayment && upsell?.paypalClientId) {
        setShowPayPal(true);
        setLoading(false);
        setAddressBusy(false);
        return;
      }
      redirect(json?.declineUrl ?? upsell.declineUrl ?? data.nextStepUrl);
    } catch {
      const msg = "Something went wrong. Please try again.";
      if (inlineShipToArg) setAddressError(msg); else setError(msg);
      setLoading(false);
      setAddressBusy(false);
    }
  }

  async function handleClick(e: React.MouseEvent) {
    if (enabled) { e.preventDefault(); return; } // editor mode — no action
    e.preventDefault();
    if (loading || showPayPal || showAddress) return;

    const data = (window as any).data ?? {};
    const upsell = data.upsell ?? null;

    if (kind === "decline") {
      redirect(upsell?.declineUrl ?? data.nextStepUrl);
      return;
    }
    await performAccept();
  }

  return (
    <>
    <DelayedRender delay={rp.delay}>
      <ElementDrag elementType={kind === "accept" ? "AcceptOfferButton" : "DeclineOfferButton"}>
        <ElementWrapper
          ref={ref}
          id={enabled ? UUIDWrapper : undefined}
          $enabled={enabled}
          $isHover={isHover}
          $isActive={isActive}
          $margin={rp.margin}
          $mobileMargin={rp.mobileMargin}
          $appearance={rp.appearance}
          $cssDefault="display: flex; flex-direction: column;"
        >
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={indicatorName} /> : null}
          <StyledButton
            type="button"
            id={rp.htmlAttrId || elementId}
            onClick={handleClick}
            disabled={loading || undefined}
            aria-busy={loading || undefined}
            $color={rp.color}
            $mobileColor={rp.mobileColor}
            $hoverBackgroundColor={rp.hover.backgroundColor}
            $hoverTextColor={rp.hover.textColor}
            $hoverTransform={rp.hover.transform}
            $padding={rp.padding}
            $mobilePadding={rp.mobilePadding}
            $fontSize={rp.fontSize}
            $mobileFontSize={rp.mobileFontSize}
            $backgroundColor={rp.backgroundColor}
            $mobileBackgroundColor={rp.mobileBackgroundColor}
            $lineHeight={rp.lineHeight}
            $mobileLineHeight={rp.mobileLineHeight}
            $letterSpacing={rp.letterSpacing}
            $mobileLetterSpacing={rp.mobileLetterSpacing}
            $fontFamily={rp.fontFamily}
            $fontStyle={rp.fontStyle}
            $width={rp.width}
            $mobileWidth={rp.mobileWidth}
            $alignSelf={rp.alignSelf}
            $mobileAlignSelf={rp.mobileAlignSelf}
            $boxShadow={rp.boxShadow}
            $mobileBoxShadow={rp.mobileBoxShadow}
            $border={rp.border}
            $mobileBorder={rp.mobileBorder}
          >
            <ButtonTextWrapper>{loading ? "Processing..." : rp.text}</ButtonTextWrapper>
          </StyledButton>
          {error && <ButtonError>{error}</ButtonError>}
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
    {showPayPal && <UpsellPayPalModal inlineShipTo={inlineShipTo} onClose={() => setShowPayPal(false)} />}
    {showAddress && (
      <UpsellAddressModal
        busy={addressBusy}
        error={addressError}
        onSubmit={(addr) => performAccept(addr)}
        onClose={() => { setShowAddress(false); setAddressBusy(false); setAddressError(null); }}
      />
    )}
    </>
  );
}

// Offer buttons reuse the Button styling panel but hide the Action/redirect
// section — their click behavior is fixed (charge / navigate).
const OfferButtonSettings: React.FC = () => <ButtonSettings showAction={false} />;

export const AcceptOfferButton: UserComponent<ButtonProps> = (props) => (
  <OfferButtonView props={props} kind="accept" indicatorName="Accept offer button" />
);
AcceptOfferButton.craft = {
  props: { ...DEFAULT_STYLES.button, text: "Yes, add it to my order" },
  related: { settings: OfferButtonSettings },
  displayName: "Accept offer button",
};

export const DeclineOfferButton: UserComponent<ButtonProps> = (props) => (
  <OfferButtonView props={props} kind="decline" indicatorName="Decline offer button" />
);
DeclineOfferButton.craft = {
  props: { ...DEFAULT_STYLES.button, text: "No thanks", backgroundColor: "transparent", color: "#6b7280" },
  related: { settings: OfferButtonSettings },
  displayName: "Decline offer button",
};

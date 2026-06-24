import React from "react";
import { UserComponent } from "@launchtic/editor-core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { OfferPriceProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { OfferPriceSettings } from "./OfferPriceSettings";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { useSafePayment } from "../../contexts/PaymentContext";
import { getValueByViewMode, getAppearanceByViewMode, formatPrice } from "../../utils/helpers";

// Styled Components
const PricePlanListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const PricePlanContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const PricePlanItemContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 10px 0 4px 0;
  cursor: pointer;
`;

const PricePlanNameContainer = styled.div<{
  $fontSize?: number;
  $mobileFontSize?: number;
  $lineHeight?: number;
  $mobileLineHeight?: number;
  $color?: string;
  $mobileColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
}>`
  ${({ $fontSize, $lineHeight, $color, $fontFamily, $fontStyle }) => css`
    ${$fontSize && `font-size: ${$fontSize}px;`}
    ${$lineHeight && `line-height: ${$lineHeight}px;`}
    ${$color && `color: ${$color};`}
    ${$fontFamily ? `font-family: ${$fontFamily};` : ""}
    ${$fontStyle?.includes("italic") ? `font-style: italic;` : ""}
    ${$fontStyle ? `font-weight: ${$fontStyle.replace("italic", "")};` : ""}
  `}

  @media (max-width: 800px) {
    ${({ $mobileFontSize, $mobileLineHeight }) => css`
      ${$mobileFontSize && `font-size: ${$mobileFontSize}px;`}
      ${$mobileLineHeight && `line-height: ${$mobileLineHeight}px;`}
    `}
  }
`;

const PricePlanAmountContainer = styled.div<{
  $fontSize?: number;
  $mobileFontSize?: number;
  $lineHeight?: number;
  $mobileLineHeight?: number;
  $color?: string;
  $mobileColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
}>`
  display: flex;
  align-items: center;
  gap: 5px;
  
  ${({ $fontSize, $lineHeight, $color, $fontFamily, $fontStyle }) => css`
    ${$fontSize && `font-size: ${$fontSize}px;`}
    ${$lineHeight && `line-height: ${$lineHeight}px;`}
    ${$color && `color: ${$color};`}
    ${$fontFamily ? `font-family: ${$fontFamily};` : ""}
    ${$fontStyle?.includes("italic") ? `font-style: italic;` : ""}
    ${$fontStyle ? `font-weight: ${$fontStyle.replace("italic", "")};` : ""}
  `}

  @media (max-width: 800px) {
    ${({ $mobileFontSize, $mobileLineHeight }) => css`
      ${$mobileFontSize && `font-size: ${$mobileFontSize}px;`}
      ${$mobileLineHeight && `line-height: ${$mobileLineHeight}px;`}
    `}
  }
`;

const PricePlanDescriptionContainer = styled.div<{
  $fontSize?: number;
  $mobileFontSize?: number;
  $lineHeight?: number;
  $mobileLineHeight?: number;
  $color?: string;
  $mobileColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
}>`
  display: flex;
  align-items: center;
  margin-left: 23px;
  margin-bottom: 6px;
  gap: 5px;
  
  ${({ $fontSize, $lineHeight, $color, $fontFamily, $fontStyle }) => css`
    ${$fontSize && `font-size: ${$fontSize}px;`}
    ${$lineHeight && `line-height: ${$lineHeight}px;`}
    ${$color && `color: ${$color};`}
    ${$fontFamily ? `font-family: ${$fontFamily};` : ""}
    ${$fontStyle?.includes("italic") ? `font-style: italic;` : ""}
    ${$fontStyle ? `font-weight: ${$fontStyle.replace("italic", "")};` : ""}
  `}

  @media (max-width: 800px) {
    ${({ $mobileFontSize, $mobileLineHeight }) => css`
      ${$mobileFontSize && `font-size: ${$mobileFontSize}px;`}
      ${$mobileLineHeight && `line-height: ${$mobileLineHeight}px;`}
    `}
  }
`;

const PricePlanLabel = styled.label`
  display: flex;
  align-items: center;
  cursor: pointer;
  gap: 10px;
`;

const PricePlanRadio = styled.input`
`;

const CurrencyBadge = styled.div<{
  $color?: string;
  $mobileColor?: string;
}>`
  padding: 3px 6px;
  border-radius: 5px;
  text-transform: uppercase;
  margin-right: 5px;
  line-height: 10px;
  font-size: 10px;
  font-weight: bold;
  ${({$color }) => css`
    ${$color && `color: ${$color};`}
    ${$color && `background-color: ${$color.includes('rgba(') 
      ? $color.replace(/,\s*[\d.]+\)$/, ', 0.2)')
      : $color.replace(', 1)', ', 0.2)')
    };`}
  `}

  @media (max-width: 800px) {
    ${({$mobileColor }) => css`
      ${$mobileColor && `background-color: ${$mobileColor.includes('rgba(')
        ? $mobileColor.replace(/,\s*[\d.]+\)$/, ', 0.2)')
        : $mobileColor.replace(', 1)', ', 0.2)')
      };`}
    `}
  }
`;

// Price Summary Styled Components
const PriceSummaryContainer = styled.div`
`;

const PriceSummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
`;


const PriceSummaryLabel = styled.div<{
  $fontSize?: number;
  $mobileFontSize?: number;
  $lineHeight?: number;
  $mobileLineHeight?: number;
  $color?: string;
  $mobileColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
}>`
  ${({ $fontSize, $lineHeight, $color, $fontFamily, $fontStyle }) => css`
    ${$fontSize && `font-size: ${$fontSize}px;`}
    ${$lineHeight && `line-height: ${$lineHeight}px;`}
    ${$color && `color: ${$color};`}
    ${$fontFamily ? `font-family: ${$fontFamily};` : ""}
    ${$fontStyle?.includes("italic") ? `font-style: italic;` : ""}
    ${$fontStyle ? `font-weight: ${$fontStyle.replace("italic", "")};` : ""}
  `}

  @media (max-width: 800px) {
    ${({ $mobileFontSize, $mobileLineHeight }) => css`
      ${$mobileFontSize && `font-size: ${$mobileFontSize}px;`}
      ${$mobileLineHeight && `line-height: ${$mobileLineHeight}px;`}
    `}
  }
`;


const PriceSummaryValue = styled.div<{
  $fontSize?: number;
  $mobileFontSize?: number;
  $color?: string;
  $mobileColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
}>`
  ${({ $fontSize, $color, $fontFamily, $fontStyle }) => css`
    ${$fontSize && `font-size: ${$fontSize}px;`}
    ${$color && `color: ${$color};`}
    ${$fontFamily ? `font-family: ${$fontFamily};` : ""}
    ${$fontStyle?.includes("italic") ? `font-style: italic;` : ""}
    ${$fontStyle ? `font-weight: ${$fontStyle.replace("italic", "")};` : ""}
  `}

  @media (max-width: 800px) {
    ${({ $mobileFontSize }) => css`
      ${$mobileFontSize && `font-size: ${$mobileFontSize}px;`}
    `}
  }
`;

const PriceSummaryTotal = styled(PriceSummaryValue)`
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 4px;
`;

const PriceSummaryDivider = styled.div<{
  $color?: string;
}>`
  height: 1px;
  margin: 10px 0;

  ${({$color}) => css`
    ${$color && `background-color: ${$color};`}
  `}
`;

const SubRow = styled(PriceSummaryRow)`
  padding-left: 16px;
  opacity: 0.75;
`;

const DiscountValue = styled(PriceSummaryValue)`
  color: #16a34a;
`;

// OfferPrice Component
export const OfferPrice: UserComponent<OfferPriceProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("offerPrice", "htmlAttrId");
  
  // Use Safe Payment Context (works in both editor and render mode)
  const {
    selectedPlan,
    selectPlan,
    availablePlans,
    basePrice,
    couponCode,
    couponDiscountAmount,
    bumpTotal,
    finalPrice,
    isCouponValid,
    isPhysicalProduct,
    taxAmount,
    shippingFee,
    physicalSelection,
    availableBumps,
    selectedBumpIds,
  } = useSafePayment();

  const selectedBumps = availableBumps.filter(b => selectedBumpIds.includes(b.id));

  // Define resolved props based on current view mode
  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    backgroundColor: getValueByViewMode(viewMode, props.backgroundColor, props.mobileBackgroundColor),
    
    // Price plan name props
    pricePlanNameFontSize: getValueByViewMode(viewMode, props.pricePlanNameFontSize, props.mobilePricePlanNameFontSize),
    pricePlanNameLineHeight: getValueByViewMode(viewMode, props.pricePlanNameLineHeight, props.mobilePricePlanNameLineHeight),
    pricePlanNameColor: getValueByViewMode(viewMode, props.pricePlanNameColor, props.mobilePricePlanNameColor),
    pricePlanNameFontFamily: props.pricePlanNameFontFamily,
    pricePlanNameFontStyle: props.pricePlanNameFontStyle,
    
    // Amount props
    amountFontSize: getValueByViewMode(viewMode, props.amountFontSize, props.mobileAmountFontSize),
    amountLineHeight: getValueByViewMode(viewMode, props.amountLineHeight, props.mobileAmountLineHeight),
    amountColor: getValueByViewMode(viewMode, props.amountColor, props.mobileAmountColor),
    amountFontFamily: props.amountFontFamily,
    amountFontStyle: props.amountFontStyle,
    
    // Price description props
    priceDescriptionFontSize: getValueByViewMode(viewMode, props.priceDescriptionFontSize, props.mobilePriceDescriptionFontSize),
    priceDescriptionLineHeight: getValueByViewMode(viewMode, props.priceDescriptionLineHeight, props.mobilePriceDescriptionLineHeight),
    priceDescriptionColor: getValueByViewMode(viewMode, props.priceDescriptionColor, props.mobilePriceDescriptionColor),
    priceDescriptionFontFamily: props.priceDescriptionFontFamily,
    priceDescriptionFontStyle: props.priceDescriptionFontStyle,
    
    // Other props
    htmlAttrId: props.htmlAttrId,
    pricePlanDescription: props.pricePlanDescription,
    mobileMargin: props.mobileMargin,
    mobileBackgroundColor: props.mobileBackgroundColor,
    mobilePricePlanNameFontSize: props.mobilePricePlanNameFontSize,
    mobilePricePlanNameLineHeight: props.mobilePricePlanNameLineHeight,  
    mobilePricePlanNameColor: props.mobilePricePlanNameColor,
    mobileAmountFontSize: props.mobileAmountFontSize,
    mobileAmountLineHeight: props.mobileAmountLineHeight,              
    mobileAmountColor: props.mobileAmountColor,
    mobilePriceDescriptionFontSize: props.mobilePriceDescriptionFontSize,
    mobilePriceDescriptionLineHeight: props.mobilePriceDescriptionLineHeight,
    mobilePriceDescriptionColor: props.mobilePriceDescriptionColor,

  };

  const { isActive, isHover, enabled } = useNodeState();

  // Use price plans from context
  const pricePlans = availablePlans;
  const checkedPlanId = selectedPlan?.id || null;

  // Handle radio button change
  const handlePlanChange = (planId: number | string) => {
    const plan = pricePlans.find(p => p.id === planId);
    if (plan) {
      selectPlan(plan);
    }
  };
  
  // Shared style props helpers
  const labelStyleProps = {
    $fontSize: resolvedProps.pricePlanNameFontSize,
    $mobileFontSize: resolvedProps.mobilePricePlanNameFontSize,
    $lineHeight: resolvedProps.pricePlanNameLineHeight,
    $mobileLineHeight: resolvedProps.mobilePricePlanNameLineHeight,
    $color: resolvedProps.pricePlanNameColor,
    $mobileColor: resolvedProps.mobilePricePlanNameColor,
    $fontFamily: resolvedProps.pricePlanNameFontFamily,
    $fontStyle: resolvedProps.pricePlanNameFontStyle,
  };

  const valueStyleProps = {
    $fontSize: resolvedProps.amountFontSize,
    $mobileFontSize: resolvedProps.mobileAmountFontSize,
    $color: resolvedProps.amountColor,
    $mobileColor: resolvedProps.mobileAmountColor,
    $fontFamily: resolvedProps.amountFontFamily,
    $fontStyle: resolvedProps.amountFontStyle,
  };

  // Pre-compute digital plan breakdown (used in plan loop + renderPriceSummary)
  const isSub = selectedPlan?.type === "SUBSCRIPTION" || selectedPlan?.type === "FREE_TRIAL";
  const hasTrial = isSub && (selectedPlan?.trialDays ?? 0) > 0;
  const afterDiscount = Math.max(0, basePrice - couponDiscountAmount);
  const planInterval = selectedPlan?.interval ?? 'month';
  const subtotalText = hasTrial
    ? `Free for ${selectedPlan?.trialDays} days, then ${formatPrice(afterDiscount, selectedPlan?.currency ?? 'usd')} every ${planInterval}`
    : `${formatPrice(afterDiscount, selectedPlan?.currency ?? 'usd')}${isSub ? `/${planInterval}` : ''}`;

  // Render Price Summary
  const renderPriceSummary = () => {
    // ── PHYSICAL ────────────────────────────────────────────────────────────
    if (isPhysicalProduct) {
      const { quantity, unitPrice } = physicalSelection;
      const currency = (window as any)?.data?.payment?.physicalProduct?.currency ?? "usd";
      const productName = (window as any)?.data?.payment?.physicalProduct?.name ?? "Product";
      const subtotal = unitPrice * quantity;

      const todayTotal = Math.max(0, subtotal + shippingFee - couponDiscountAmount)
        + selectedBumps.reduce((s, b) => {
          const isBumpSub = b.type === 'SUBSCRIPTION' || b.type === 'FREE_TRIAL';
          if (isBumpSub && (b.trialDays ?? 0) > 0) return s;
          return s + b.amount + b.shippingFee;
        }, 0);

      return (
        <PriceSummaryContainer>
          {/* Product row */}
          <PriceSummaryRow>
            <PriceSummaryLabel {...labelStyleProps}>
              {quantity > 1 ? `${productName} ×${quantity}:` : `${productName}:`}
            </PriceSummaryLabel>
            <PriceSummaryValue {...valueStyleProps}>{formatPrice(subtotal, currency)}</PriceSummaryValue>
          </PriceSummaryRow>

          {shippingFee > 0 && (
            <SubRow>
              <PriceSummaryLabel {...labelStyleProps}>Shipping:</PriceSummaryLabel>
              <PriceSummaryValue {...valueStyleProps}>{formatPrice(shippingFee, currency)}</PriceSummaryValue>
            </SubRow>
          )}

          {isCouponValid && couponDiscountAmount > 0 && (
            <SubRow>
              <PriceSummaryLabel {...labelStyleProps}>Coupon ({couponCode}):</PriceSummaryLabel>
              <DiscountValue {...valueStyleProps}>-{formatPrice(couponDiscountAmount, currency)}</DiscountValue>
            </SubRow>
          )}

          {/* Bump rows */}
          {selectedBumps.map(bump => {
            const isBumpSub = bump.type === 'SUBSCRIPTION' || bump.type === 'FREE_TRIAL';
            const hasBumpTrial = isBumpSub && (bump.trialDays ?? 0) > 0;
            const bumpValueText = hasBumpTrial
              ? `${bump.trialDays} days free, then ${formatPrice(bump.amount, bump.currency)}/${bump.interval ?? 'month'}`
              : isBumpSub
                ? `${formatPrice(bump.amount, bump.currency)}/${bump.interval ?? 'month'}`
                : `+${formatPrice(bump.amount, bump.currency)}`;
            return (
              <React.Fragment key={bump.id}>
                <PriceSummaryRow>
                  <PriceSummaryLabel {...labelStyleProps}>{bump.displayName}:</PriceSummaryLabel>
                  <PriceSummaryValue {...valueStyleProps}>{bumpValueText}</PriceSummaryValue>
                </PriceSummaryRow>
                {!isBumpSub && bump.shippingFee > 0 && (
                  <SubRow>
                    <PriceSummaryLabel {...labelStyleProps}>Shipping:</PriceSummaryLabel>
                    <PriceSummaryValue {...valueStyleProps}>+{formatPrice(bump.shippingFee, bump.currency)}</PriceSummaryValue>
                  </SubRow>
                )}
              </React.Fragment>
            );
          })}

          <PriceSummaryDivider $color={resolvedProps.pricePlanNameColor} />

          <PriceSummaryRow>
            <PriceSummaryLabel {...labelStyleProps}>
              Total due today:
            </PriceSummaryLabel>
            <PriceSummaryTotal {...valueStyleProps}>
              <CurrencyBadge $color={resolvedProps.amountColor} $mobileColor={resolvedProps.mobileAmountColor}>
                {currency}
              </CurrencyBadge>
              {formatPrice(todayTotal, currency)}
            </PriceSummaryTotal>
          </PriceSummaryRow>
        </PriceSummaryContainer>
      );
    }

    // ── DIGITAL ─────────────────────────────────────────────────────────────
    if (!selectedPlan) return null;

    const mainToday = hasTrial ? 0 : afterDiscount;
    const bumpChargeToday = selectedBumps.reduce((s, b) => {
      if (b.trialDays && b.trialDays > 0) return s;
      return s + b.amount + b.shippingFee;
    }, 0);
    const todayTotal = mainToday + bumpChargeToday;

    return (
      <PriceSummaryContainer>
        {/* Bump rows — each with its own interval, no discount applied */}
        {selectedBumps.map(bump => {
          const isSubBump = bump.type === 'SUBSCRIPTION' || bump.type === 'FREE_TRIAL';
          const hasBumpTrial = isSubBump && (bump.trialDays ?? 0) > 0;
          const bumpInterval = isSubBump ? `/${bump.interval ?? 'month'}` : '';
          const bumpValueText = hasBumpTrial
            ? `${bump.trialDays} days free, then ${formatPrice(bump.amount, bump.currency)}/${bump.interval ?? 'month'}`
            : isSubBump
              ? `${formatPrice(bump.amount, bump.currency)}/${bump.interval ?? 'month'}`
              : `+${formatPrice(bump.amount, bump.currency)}`;
          return (
            <React.Fragment key={bump.id}>
              <PriceSummaryRow>
                <PriceSummaryLabel {...labelStyleProps}>{bump.displayName}:</PriceSummaryLabel>
                <PriceSummaryValue {...valueStyleProps}>{bumpValueText}</PriceSummaryValue>
              </PriceSummaryRow>
              {bump.shippingFee > 0 && (
                <SubRow>
                  <PriceSummaryLabel {...labelStyleProps}>Shipping:</PriceSummaryLabel>
                  <PriceSummaryValue {...valueStyleProps}>+{formatPrice(bump.shippingFee, bump.currency)}</PriceSummaryValue>
                </SubRow>
              )}
            </React.Fragment>
          );
        })}

        <PriceSummaryDivider $color={resolvedProps.pricePlanNameColor} />

        {/* Total due today */}
        <PriceSummaryRow>
          <PriceSummaryLabel {...labelStyleProps}>Total due today:</PriceSummaryLabel>
          <PriceSummaryTotal {...valueStyleProps}>
            <CurrencyBadge $color={resolvedProps.amountColor} $mobileColor={resolvedProps.mobileAmountColor}>
              {selectedPlan.currency}
            </CurrencyBadge>
            {formatPrice(todayTotal, selectedPlan.currency)}
          </PriceSummaryTotal>
        </PriceSummaryRow>

      </PriceSummaryContainer>
    );
  };
  
  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="OfferPrice">
        <ElementWrapper
          ref={ref}
          id={enabled ? UUIDWrapper : undefined}
          $enabled={enabled}
          $isHover={isHover}
          $isActive={isActive}
          $margin={resolvedProps.margin}
          $mobileMargin={resolvedProps.mobileMargin}
          $appearance={resolvedProps.appearance}
          $cssDefault="display: flex; flex-direction: column;"
        >
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"OfferPrice"} /> : null}
          
          <PricePlanListContainer
            id={resolvedProps.htmlAttrId || elementId}
            data-test-element="offer-price"
          >
            {isPhysicalProduct ? (
              // Physical product mode: no plan radio selection, just show the price summary
              renderPriceSummary()
            ) : pricePlans && pricePlans.length > 0 ? (
              <>
                {pricePlans.map((plan: any) => (
                  <PricePlanContainer key={plan.id}>
                    <PricePlanItemContainer onClick={() => handlePlanChange(plan.id)}>
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <PricePlanNameContainer
                          $fontSize={resolvedProps.pricePlanNameFontSize}
                          $mobileFontSize={resolvedProps.mobilePricePlanNameFontSize}
                          $lineHeight={resolvedProps.pricePlanNameLineHeight}
                          $mobileLineHeight={resolvedProps.mobilePricePlanNameLineHeight}
                          $color={resolvedProps.pricePlanNameColor}
                          $mobileColor={resolvedProps.mobilePricePlanNameColor}
                          $fontFamily={resolvedProps.pricePlanNameFontFamily}
                          $fontStyle={resolvedProps.pricePlanNameFontStyle}
                          data-id={`offer-price-${plan.id}`}
                        >
                          <PricePlanLabel>
                            <PricePlanRadio
                              type="radio"
                              name="price-plan"
                              value={plan.id}
                              checked={checkedPlanId === plan.id}
                              onChange={() => handlePlanChange(plan.id)}
                            />
                            <div>{plan.name}</div>
                          </PricePlanLabel>
                        </PricePlanNameContainer>

                        {(plan.description || resolvedProps.pricePlanDescription) && (
                          <PricePlanDescriptionContainer
                            $fontSize={resolvedProps.priceDescriptionFontSize}
                            $mobileFontSize={resolvedProps.mobilePriceDescriptionFontSize}
                            $lineHeight={resolvedProps.priceDescriptionLineHeight}
                            $mobileLineHeight={resolvedProps.mobilePriceDescriptionLineHeight}
                            $color={resolvedProps.priceDescriptionColor}
                            $mobileColor={resolvedProps.mobilePriceDescriptionColor}
                            $fontFamily={resolvedProps.priceDescriptionFontFamily}
                            $fontStyle={resolvedProps.priceDescriptionFontStyle}
                          >
                            {plan.description || resolvedProps.pricePlanDescription}
                          </PricePlanDescriptionContainer>
                        )}
                      </div>

                      <PricePlanAmountContainer
                        $fontSize={resolvedProps.amountFontSize}
                        $mobileFontSize={resolvedProps.mobileAmountFontSize}
                        $lineHeight={resolvedProps.amountLineHeight}
                        $mobileLineHeight={resolvedProps.mobileAmountLineHeight}
                        $color={resolvedProps.amountColor}
                        $mobileColor={resolvedProps.mobileAmountColor}
                        $fontFamily={resolvedProps.amountFontFamily}
                        $fontStyle={resolvedProps.amountFontStyle}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {plan.trialDays > 0 ? (
                            <span style={{ whiteSpace: 'nowrap' }}>
                              {plan.trialDays} days free, then {formatPrice(plan.directChargeAmount, plan.currency)}/{plan.interval ?? 'month'}
                            </span>
                          ) : (
                            <>
                              {formatPrice(plan.directChargeAmount, plan.currency)}
                              {plan.interval && (
                                <span>/{plan.interval}</span>
                              )}
                            </>
                          )}
                        </div>
                      </PricePlanAmountContainer>
                    </PricePlanItemContainer>

                    {/* Coupon + Subtotal under selected plan (renderer only) */}
                    {!enabled && checkedPlanId === plan.id && isCouponValid && couponDiscountAmount > 0 && (
                      <>
                        <PricePlanItemContainer style={{ padding: '2px 0', cursor: 'default' }}>
                          <div style={{ flex: 1 }}>
                            <PricePlanNameContainer {...labelStyleProps} style={{ color: '#16a34a' }}>
                              Coupon
                            </PricePlanNameContainer>
                          </div>
                          <PricePlanAmountContainer {...valueStyleProps} style={{ color: '#16a34a' }}>
                            -{formatPrice(couponDiscountAmount, plan.currency)}
                          </PricePlanAmountContainer>
                        </PricePlanItemContainer>
                        <PricePlanItemContainer style={{ padding: '2px 0', cursor: 'default' }}>
                          <div style={{ flex: 1 }}>
                            <PricePlanNameContainer {...labelStyleProps}>
                              Subtotal:
                            </PricePlanNameContainer>
                          </div>
                          <PricePlanAmountContainer {...valueStyleProps}>
                            {subtotalText}
                          </PricePlanAmountContainer>
                        </PricePlanItemContainer>
                      </>
                    )}

                  </PricePlanContainer>
                ))}

                {/* Price Summary - Only show when not in editor mode */}
                {!enabled && renderPriceSummary()}
              </>
            ) : (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#666',
                border: '2px dashed #ddd',
                borderRadius: '8px'
              }}>
                <p>No price plans available</p>
                <small>Please add price plans to display pricing options</small>
              </div>
            )}
          </PricePlanListContainer>
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

OfferPrice.craft = {
  props: { ...DEFAULT_STYLES.offerPrice },
  related: { settings: OfferPriceSettings },
  displayName: "OfferPrice",
};
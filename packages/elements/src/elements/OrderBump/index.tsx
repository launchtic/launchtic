import { useState } from "react";
import { UserComponent } from "@craftjs/core";
import styled, { css, keyframes } from "styled-components";
import { OrderBumpProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { OrderBumpSettings } from "./OrderBumpSettings";
import { getValueByViewMode, getAppearanceByViewMode, getBoxShadowValue } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { Indicator } from "../../editor/common/Indicator";
import { useSafePayment } from "../../contexts/PaymentContext";

// Animation keyframes for arrow
const arrowAnimation = keyframes`
  to {
    transform: scale(1.2);
  }
`;

// Styled components
const OrderBumpContainer = styled.div<{
  $padding?: OrderBumpProps["padding"];
  $mobilePadding?: OrderBumpProps["mobilePadding"];
  $backgroundColor?: string;
  $mobileBackgroundColor?: string;
  $border?: OrderBumpProps["border"];
  $mobileBorder?: OrderBumpProps["mobileBorder"];
  $boxShadow?: string;
  $mobileBoxShadow?: string;
}>`
  ${({ $padding }) => css`
    ${$padding &&
    `padding: ${$padding.paddingTop}px ${$padding.paddingRight}px ${$padding.paddingBottom}px ${$padding.paddingLeft}px;`}
  `}
  
  ${({ $backgroundColor }) => $backgroundColor && `background-color: ${$backgroundColor};`}
  
  ${({ $border }) => {
    if (!$border) return '';
    return css`
      border: ${$border.width}px ${$border.style} ${$border.color};
      border-radius: ${$border.radius}px;
    `;
  }}
  
  ${({ $boxShadow }) => $boxShadow && `box-shadow: ${getBoxShadowValue($boxShadow)};`}

  @media (max-width: 800px) {
    ${({ $mobilePadding }) => css`
      ${$mobilePadding &&
      `padding: ${$mobilePadding.paddingTop}px ${$mobilePadding.paddingRight}px ${$mobilePadding.paddingBottom}px ${$mobilePadding.paddingLeft}px;`}
    `}
    
    ${({ $mobileBackgroundColor, $backgroundColor }) => {
      const bgColor = $mobileBackgroundColor || $backgroundColor;
      return bgColor && `background-color: ${bgColor};`;
    }}
    
    ${({ $mobileBorder, $border }) => {
      const borderConfig = $mobileBorder || $border;
      if (!borderConfig) return '';
      return css`
        border: ${borderConfig.width}px ${borderConfig.style} ${borderConfig.color};
        border-radius: ${borderConfig.radius}px;
      `;
    }}
    
    ${({ $mobileBoxShadow }) => $mobileBoxShadow && `box-shadow: ${getBoxShadowValue($mobileBoxShadow)};`}
  }
`;

const OrderBumpLabel = styled.label<{
  $textAlign?: string;
  $mobileTextAlign?: string;
}>`
  display: flex;
  align-items: center;
  cursor: pointer;
  ${({ $textAlign }) => $textAlign && `justify-content: ${$textAlign === 'left' ? 'flex-start' : $textAlign === 'center' ? 'center' : 'flex-end'};`}
  
  @media (max-width: 800px) {
    ${({ $mobileTextAlign, $textAlign }) => {
      const align = $mobileTextAlign || $textAlign;
      return align && `justify-content: ${align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end'};`;
    }}
  }
`;

const OrderBumpCheckbox = styled.input`
  margin-right: 10px;
  cursor: pointer;
  min-height: 15px;
  min-width: 15px;
`;

const OrderBumpArrow = styled.i<{
  $showIcon?: boolean;
  $iconClass?: string;
  $iconColor?: string;
  $iconSize?: number;
}>`
  display: ${({ $showIcon, $iconClass }) => 
    $showIcon && $iconClass ? 'block' : 'none'};
  font-size: ${({ $iconSize }) => $iconSize || 30}px;
  margin: 0px 10px;
  color: ${({ $iconColor }) => $iconColor || '#1976d2'};
  animation: ${arrowAnimation} 0.2s ease-in-out 0s infinite alternate none running;
  flex-basis: ${({ $iconSize }) => $iconSize || 30}px;
  flex-shrink: 0;
  line-height: 1;
  cursor: pointer;
`;

const OrderBumpTitle = styled.div<{
  $fontSize?: number;
  $mobileFontSize?: number;
  $color?: string;
  $mobileColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
}>`
  flex: 1;
  font-size: ${({ $fontSize }) => $fontSize || 26}px;
  color: ${({ $color }) => $color || '#000'};
  ${({ $fontFamily }) => $fontFamily && `font-family: ${$fontFamily};`}
  ${({ $fontStyle }) => {
    if (!$fontStyle) return '';
    const styles = [];
    if ($fontStyle.includes('italic')) styles.push('font-style: italic;');
    const weight = $fontStyle.replace('italic', '').trim();
    if (weight) styles.push(`font-weight: ${weight};`);
    return styles.join(' ');
  }}
  
  @media (max-width: 800px) {
    font-size: ${({ $mobileFontSize, $fontSize }) => 
      $mobileFontSize || $fontSize || 22}px;
    color: ${({ $mobileColor, $color }) => 
      $mobileColor || $color || '#000'};
  }
`;


export const OrderBump: UserComponent<OrderBumpProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("orderBump", "htmlAttrId");
  const { isActive, isHover, enabled } = useNodeState();
  
  // Use Safe Payment Context (works in both editor and render mode)
  const {
    availableBumps,
    selectedBumpIds,
    selectedPaymentMethod,
    toggleOrderBump
  } = useSafePayment();

  const offerBump = availableBumps.length > 0 ? {
    id: availableBumps[0].id,
    pricePlans: availableBumps
  } : null;

  const isChecked = offerBump ? selectedBumpIds.includes(offerBump.id) : false;
  const bumpType = availableBumps[0]?.type;
  const isPaypalIncompatible = !enabled && selectedPaymentMethod === 'paypal' && bumpType !== undefined && bumpType !== 'ONE_TIME';


  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    backgroundColor: getValueByViewMode(viewMode, props.backgroundColor, props.mobileBackgroundColor),
    textAlign: getValueByViewMode(viewMode, props.textAlign, props.mobileTextAlign),
    fontSize: getValueByViewMode(viewMode, props.fontSize, props.mobileFontSize),
    color: getValueByViewMode(viewMode, props.color, props.mobileColor),
    border: getValueByViewMode(viewMode, props.border, props.mobileBorder),
    boxShadow: getValueByViewMode(viewMode, props.boxShadow, props.mobileBoxShadow),
    
    // Non-responsive props
    orderBumpName: props.orderBumpName,
    showIcon: props.showIcon,
    iconClass: props.iconClass,
    iconColor: props.iconColor,
    iconSize: props.iconSize,
    fontFamily: props.fontFamily,
    fontStyle: props.fontStyle,
    
    // Mobile props for wrapper
    mobileMargin: props.mobileMargin,
    mobilePadding: props.mobilePadding,
    mobileBackgroundColor: props.mobileBackgroundColor,
    mobileTextAlign: props.mobileTextAlign,
    mobileFontSize: props.mobileFontSize,
    mobileColor: props.mobileColor,
    mobileBorder: props.mobileBorder,
    mobileBoxShadow: props.mobileBoxShadow,
  };

  const handleCheckboxChange = (checked: boolean) => {
    if (!offerBump) return;
    if (isPaypalIncompatible) return;
    toggleOrderBump(offerBump.id);
  };

  const incompatibleTooltip = "Recurring add-ons require credit card. Switch to card payment to add this offer.";

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="OrderBump">
        <ElementWrapper
          ref={ref}
          id={enabled ? UUIDWrapper : undefined}
          $enabled={enabled}
          $isHover={isHover}
          $isActive={isActive}
          $margin={resolvedProps.margin}
          $mobileMargin={resolvedProps.mobileMargin}
          $appearance={resolvedProps.appearance}
          $cssDefault=""
        >
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"Order Bump"} /> : null}
          <OrderBumpContainer
            id={props.htmlAttrId || elementId}
            title={isPaypalIncompatible ? incompatibleTooltip : undefined}
            style={isPaypalIncompatible ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
            $padding={resolvedProps.padding}
            $mobilePadding={resolvedProps.mobilePadding}
            $backgroundColor={resolvedProps.backgroundColor}
            $mobileBackgroundColor={resolvedProps.mobileBackgroundColor}
            $border={resolvedProps.border}
            $mobileBorder={resolvedProps.mobileBorder}
            $boxShadow={resolvedProps.boxShadow}
            $mobileBoxShadow={resolvedProps.mobileBoxShadow}
          >
            {offerBump && offerBump.pricePlans && offerBump.pricePlans.length > 0 ? (
              <>
                <OrderBumpLabel
                  $textAlign={resolvedProps.textAlign}
                  $mobileTextAlign={resolvedProps.mobileTextAlign}
                  style={isPaypalIncompatible ? { cursor: 'not-allowed' } : undefined}
                >
                  <OrderBumpArrow
                    $showIcon={resolvedProps.showIcon}
                    className={resolvedProps.iconClass || 'fas fa-right-long'}
                    $iconClass={resolvedProps.iconClass}
                    $iconColor={resolvedProps.iconColor}
                    $iconSize={resolvedProps.iconSize}
                  />
                  <OrderBumpCheckbox
                    type="checkbox"
                    checked={isChecked}
                    disabled={isPaypalIncompatible}
                    onChange={(e) => handleCheckboxChange(e.target.checked)}
                  />
                  <OrderBumpTitle
                    $fontSize={resolvedProps.fontSize}
                    $mobileFontSize={resolvedProps.mobileFontSize}
                    $color={resolvedProps.color}
                    $mobileColor={resolvedProps.mobileColor}
                    $fontFamily={resolvedProps.fontFamily}
                    $fontStyle={resolvedProps.fontStyle}
                  >
                    {resolvedProps.orderBumpName || "Yes, I want it!"}
                  </OrderBumpTitle>
                </OrderBumpLabel>
                {isPaypalIncompatible && (
                  <p style={{ marginTop: 8, fontSize: 13, color: '#ed050d', fontStyle: 'italic' }}>
                    {incompatibleTooltip}
                  </p>
                )}
              </>
            ) : (
              <div style={{ 
                padding: '20px', 
                textAlign: 'center', 
                color: '#666',
                border: '2px dashed #ddd',
                borderRadius: '8px'
              }}>
                <p>No Order Bump available</p>
                <small>Please add order bump to display upsell option</small>
              </div>
            )}
          </OrderBumpContainer>
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

OrderBump.craft = {
  props: { ...DEFAULT_STYLES.orderBump },
  related: { settings: OrderBumpSettings },
  displayName: "OrderBump",
};
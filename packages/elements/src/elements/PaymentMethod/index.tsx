import { UserComponent } from "@craftjs/core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { PaymentMethodProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { PaymentMethodSettings } from "./PaymentMethodSettings";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { useSafePayment } from "../../contexts/PaymentContext";
import { getValueByViewMode, getAppearanceByViewMode, getImagePath } from "../../utils/helpers";
import { StripeCardWrapper } from './StripeCardWrapper';

// Styled Components
const PaymentMethodsContainer = styled.div<{ $spaceBetweenItems?: number }>`
  display: flex;
  flex-direction: column;
  ${({ $spaceBetweenItems }) => css`
    ${$spaceBetweenItems && `gap: ${$spaceBetweenItems}px;`}
  `}
`;


const PaymentMethodItem = styled.div<{
  $padding?: any;
  $mobilePadding?: any;
  $border?: any;
  $mobileBorder?: any;
  $activeBackgroundColor?: string;
  $mobileActiveBackgroundColor?: string;
}>`
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
  
  ${({ $border }) => $border && css`
    ${$border.style && `border-style: ${$border.style};`}
    ${$border.color && `border-color: ${$border.color};`}
    ${$border.radius !== undefined && `border-radius: ${$border.radius}px;`}

    ${$border.type === "fullBorder" && $border.width && `border-width: ${$border.width}px;`}
    ${$border.type === "bottomOnly" && $border.width && `border-width: 0px 0px ${$border.width}px;`}
    ${$border.type === "topOnly" && $border.width && `border-width: ${$border.width}px 0px 0px;`}
    ${$border.type === "topAndBottom" && $border.width && `border-width: ${$border.width}px 0px;`}
  `}
  
  ${({ $padding }) => css`
    ${$padding && `
      padding-top: ${$padding.paddingTop}px;
      padding-bottom: ${$padding.paddingBottom}px;
      padding-left: ${$padding.paddingLeft}px;
      padding-right: ${$padding.paddingRight}px;
    `}
  `}
  
  &:hover {
    background-color: rgba(25, 118, 210, 0.05);
  }
  
  &.selected {
    ${({ $activeBackgroundColor }) => css`
      ${$activeBackgroundColor && `background-color: ${$activeBackgroundColor};`}
    `}
  }

  @media (max-width: 800px) {
    ${({ $mobileBorder }) => $mobileBorder && css`
      ${$mobileBorder.style && `border-style: ${$mobileBorder.style};`}
      ${$mobileBorder.color && `border-color: ${$mobileBorder.color};`}
      ${$mobileBorder.radius !== undefined && `border-radius: ${$mobileBorder.radius}px;`}

      ${$mobileBorder.type === "fullBorder" && $mobileBorder.width && `border-width: ${$mobileBorder.width}px;`}
      ${$mobileBorder.type === "bottomOnly" && $mobileBorder.width && `border-width: 0px 0px ${$mobileBorder.width}px;`}
      ${$mobileBorder.type === "topOnly" && $mobileBorder.width && `border-width: ${$mobileBorder.width}px 0px 0px;`}
      ${$mobileBorder.type === "topAndBottom" && $mobileBorder.width && `border-width: ${$mobileBorder.width}px 0px;`}
    `}
    
    ${({ $mobilePadding, $mobileActiveBackgroundColor }) => css`
      ${$mobilePadding && `
        padding-top: ${$mobilePadding.paddingTop}px;
        padding-bottom: ${$mobilePadding.paddingBottom}px;
        padding-left: ${$mobilePadding.paddingLeft}px;
        padding-right: ${$mobilePadding.paddingRight}px;
      `}
      
      &.selected {
        ${$mobileActiveBackgroundColor && `background-color: ${$mobileActiveBackgroundColor};`}
      }
    `}
  }
`;


const PaymentMethodRadio = styled.input`
  margin-right: 12px;
  cursor: pointer;
`;

const PaymentMethodLabel = styled.span<{
  $fontSize?: number;
  $mobileFontSize?: number;
  $lineHeight?: number;
  $mobileLineHeight?: number;
  $color?: string;
  $mobileColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
}>`
  flex: 1;
  cursor: pointer;
  
  ${({ $fontSize, $lineHeight, $color, $fontFamily, $fontStyle }) => css`
    ${$fontSize && `font-size: ${$fontSize}px;`}
    ${$lineHeight && `line-height: ${$lineHeight}px;`}
    ${$color && `color: ${$color};`}
    ${$fontFamily ? `font-family: ${$fontFamily};` : ""}
    ${$fontStyle?.includes("italic") ? `font-style: italic;` : ""}
    ${$fontStyle ? `font-weight: ${$fontStyle.replace("italic", "")};` : ""}
  `}

  @media (max-width: 800px) {
    ${({ $mobileFontSize, $mobileLineHeight, $mobileColor }) => css`
      ${$mobileFontSize && `font-size: ${$mobileFontSize}px;`}
      ${$mobileLineHeight && `line-height: ${$mobileLineHeight}px;`}
      ${$mobileColor && `color: ${$mobileColor};`}
    `}
  }
`;

const PaymentMethodIcon = styled.div<{ $type: string }>`
  width: 50%;
  height: 32px;
  background-repeat: no-repeat;
  background-position: center right;
  background-size: contain;
  margin-left: 10px;
  
  ${({ $type }) => css`
    ${$type === 'stripe' && `
      background-image: url(${getImagePath("credit_cards.png")});
    `}
    ${$type === 'paypal' && `
      background-image: url(${getImagePath("paypal.png")});
    `}
  `}
`;


// PaymentMethod Component
export const PaymentMethod: UserComponent<PaymentMethodProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("paymentMethod", "htmlAttrId");

  const { selectedPaymentMethod, selectPaymentMethod, finalPrice } = useSafePayment();

  // Define resolved props based on current view mode
  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    
    // Text props
    textFontSize: getValueByViewMode(viewMode, props.textFontSize, props.mobileTextFontSize),
    textLineHeight: getValueByViewMode(viewMode, props.textLineHeight, props.mobileTextLineHeight),
    textColor: getValueByViewMode(viewMode, props.textColor, props.mobileTextColor),
    textFontFamily: props.textFontFamily,
    textFontStyle: props.textFontStyle,
    
    // Item props
    spaceBetweenItems: props.spaceBetweenItems,
    itemPadding: getValueByViewMode(viewMode, props.itemPadding, props.mobileItemPadding),
    itemBorder: getValueByViewMode(viewMode, props.itemBorder, props.mobileItemBorder),
    activeBackgroundColor: getValueByViewMode(viewMode, props.activeBackgroundColor, props.mobileActiveBackgroundColor),
    
    // Other props
    htmlAttrId: props.htmlAttrId,
    mobileMargin: props.mobileMargin,
    mobileTextFontSize: props.mobileTextFontSize,
    mobileTextLineHeight: props.mobileTextLineHeight,
    mobileTextColor: props.mobileTextColor,
    mobileItemPadding: props.mobileItemPadding,
    mobileItemBorder: props.mobileItemBorder,
    mobileActiveBackgroundColor: props.mobileActiveBackgroundColor,
  };

  const { isActive, isHover, enabled } = useNodeState();

  const isFreeOrder = !enabled && finalPrice === 0;
  if (isFreeOrder) return null;

  // Get payment methods from window.data.paymentMethods or use default
  const getPaymentMethods = () => {
    try {
      const paymentMethods = window?.data?.payment?.paymentMethods;
      if (paymentMethods && paymentMethods.length > 0) {
        return paymentMethods;
      }
      return null;
    } catch (error) {
      console.warn('Error getting payment methods from window.data:', error);
      return null;
    }
  };

  const paymentMethods = getPaymentMethods();
  
  // Handle payment method change - NO window.data sync
  const handlePaymentMethodChange = (method: string) => {
    selectPaymentMethod(method); // Update PaymentContext only
  };

  // Get display text for payment method
  const getPaymentMethodText = (method: string) => {
    switch (method) {
      case 'stripe':
        return 'Credit or debit card';
      case 'paypal':
        return 'PayPal';
      default:
        return method;
    }
  };

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="PaymentMethod">
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
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"PaymentMethod"} /> : null}
          
          <PaymentMethodsContainer 
            id={resolvedProps.htmlAttrId || elementId}
            data-test-element="payment-methods"
            $spaceBetweenItems={resolvedProps.spaceBetweenItems}
          >
            {paymentMethods && paymentMethods.length > 0 ? (
              <>
                {paymentMethods.map((method: string) => (
                  <PaymentMethodItem
                    key={method}
                    className={selectedPaymentMethod === method ? 'selected' : ''}
                    onClick={() => handlePaymentMethodChange(method)}
                    $padding={resolvedProps.itemPadding}
                    $mobilePadding={resolvedProps.mobileItemPadding}
                    $border={resolvedProps.itemBorder}
                    $mobileBorder={resolvedProps.mobileItemBorder}
                    $activeBackgroundColor={resolvedProps.activeBackgroundColor}
                    $mobileActiveBackgroundColor={resolvedProps.mobileActiveBackgroundColor}
                  >
                    <PaymentMethodRadio
                      type="radio"
                      name={`payment-method-${elementId}`}
                      value={method}
                      checked={selectedPaymentMethod === method}
                      onChange={() => handlePaymentMethodChange(method)}
                    />
                    
                    <PaymentMethodLabel
                      $fontSize={resolvedProps.textFontSize}
                      $mobileFontSize={resolvedProps.mobileTextFontSize}
                      $lineHeight={resolvedProps.textLineHeight}
                      $mobileLineHeight={resolvedProps.mobileTextLineHeight}
                      $color={resolvedProps.textColor}
                      $mobileColor={resolvedProps.mobileTextColor}
                      $fontFamily={resolvedProps.textFontFamily}
                      $fontStyle={resolvedProps.textFontStyle}
                    >
                      {getPaymentMethodText(method)}
                    </PaymentMethodLabel>
                    
                    <PaymentMethodIcon $type={method} />
                  </PaymentMethodItem>
                ))}

                {!enabled && selectedPaymentMethod === 'stripe' && <StripeCardWrapper />}

                {!enabled && selectedPaymentMethod === 'paypal' && (
                  <div style={{ padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '8px', textAlign: 'center', color: '#555', fontSize: '13px' }}>
                    You will be redirected to PayPal to complete your purchase securely.
                  </div>
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
                <p>No payment methods available</p>
                <small>Please setup payment methods in your account settings</small>
              </div>
            )}
          </PaymentMethodsContainer>
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

PaymentMethod.craft = {
  props: { ...DEFAULT_STYLES.paymentMethod },
  related: { settings: PaymentMethodSettings },
  displayName: "PaymentMethod",
};
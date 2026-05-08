import { useEditor, UserComponent } from "@craftjs/core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { CouponProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { CouponSettings } from "./CouponSettings";
import { getValueByViewMode, getAppearanceByViewMode, getBoxShadowValue, formatPrice } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { useState } from "react";
import { useSafePayment } from "../../contexts/PaymentContext";

const CouponContainer = styled.div<{
  $padding?: CouponProps['padding'];
  $mobilePadding?: CouponProps['mobilePadding'];
}>`
  display: flex;
  gap: 10px;
  width: 100%;
  
  ${({ $padding }) => $padding && `padding: ${$padding.paddingTop}px ${$padding.paddingRight}px ${$padding.paddingBottom}px ${$padding.paddingLeft}px;`}
  
  @media (max-width: 800px) {
    gap: 5px;
    ${({ $mobilePadding }) => $mobilePadding && `padding: ${$mobilePadding.paddingTop}px ${$mobilePadding.paddingRight}px ${$mobilePadding.paddingBottom}px ${$mobilePadding.paddingLeft}px;`}
  }
`;

const StyledInput = styled.input<{
  $fieldFontSize?: number;
  $mobileFieldFontSize?: number;
  $fieldTextColor?: string;
  $mobileFieldTextColor?: string;
  $fieldBackgroundColor?: string;
  $mobileFieldBackgroundColor?: string;
  $fieldBorder?: CouponProps['fieldBorder'];
  $mobileFieldBorder?: CouponProps['mobileFieldBorder'];
}>`
  flex: 1;
  max-width: 300px;
  padding: 8px;
  outline: none;
  transition: 0.3s;
  
  ${({ $fieldFontSize, $fieldTextColor, $fieldBackgroundColor, $fieldBorder }) => css`
    ${$fieldFontSize && `font-size: ${$fieldFontSize}px;`}
    ${$fieldTextColor && `color: ${$fieldTextColor};`}
    ${$fieldBackgroundColor && `background-color: ${$fieldBackgroundColor};`}
  `}

  ${({ $fieldBorder }) => $fieldBorder && css`
    ${$fieldBorder.style && `border-style: ${$fieldBorder.style};`}
    ${$fieldBorder.color && `border-color: ${$fieldBorder.color};`}
    ${$fieldBorder.radius !== undefined && `border-radius: ${$fieldBorder.radius}px;`}

    ${$fieldBorder.type === "fullBorder" && $fieldBorder.width && `border-width: ${$fieldBorder.width}px;`}
    ${$fieldBorder.type === "bottomOnly" && $fieldBorder.width && `border-width: 0px 0px ${$fieldBorder.width}px;`}
    ${$fieldBorder.type === "topOnly" && $fieldBorder.width && `border-width: ${$fieldBorder.width}px 0px 0px;`}
    ${$fieldBorder.type === "topAndBottom" && $fieldBorder.width && `border-width: ${$fieldBorder.width}px 0px;`}
  `}

  &::placeholder {
    ${({ $fieldTextColor }) => $fieldTextColor && `color: ${$fieldTextColor};`}
    opacity: 0.7;
  }

  @media (max-width: 800px) {
    ${({ $mobileFieldFontSize, $mobileFieldTextColor, $mobileFieldBackgroundColor }) => css`
      ${$mobileFieldFontSize && `font-size: ${$mobileFieldFontSize}px;`}
      ${$mobileFieldTextColor && `color: ${$mobileFieldTextColor};`}
      ${$mobileFieldBackgroundColor && `background-color: ${$mobileFieldBackgroundColor};`}
    `}

    ${({ $mobileFieldBorder }) => $mobileFieldBorder && css`
      ${$mobileFieldBorder.style && `border-style: ${$mobileFieldBorder.style};`}
      ${$mobileFieldBorder.color && `border-color: ${$mobileFieldBorder.color};`}
      ${$mobileFieldBorder.radius !== undefined && `border-radius: ${$mobileFieldBorder.radius}px;`}

      ${$mobileFieldBorder.type === "fullBorder" && $mobileFieldBorder.width && `border-width: ${$mobileFieldBorder.width}px;`}
      ${$mobileFieldBorder.type === "bottomOnly" && $mobileFieldBorder.width && `border-width: 0px 0px ${$mobileFieldBorder.width}px;`}
      ${$mobileFieldBorder.type === "topOnly" && $mobileFieldBorder.width && `border-width: ${$mobileFieldBorder.width}px 0px 0px;`}
      ${$mobileFieldBorder.type === "topAndBottom" && $mobileFieldBorder.width && `border-width: ${$mobileFieldBorder.width}px 0px;`}
    `}

    &::placeholder {
      ${({ $mobileFieldTextColor }) => $mobileFieldTextColor && `color: ${$mobileFieldTextColor};`}
      opacity: 0.7;
    }
  }
`;

const StyledButton = styled.button<{
  $buttonFontSize?: number;
  $mobileButtonFontSize?: number;
  $buttonTextColor?: string;
  $mobileButtonTextColor?: string;
  $buttonBackgroundColor?: string;
  $mobileButtonBackgroundColor?: string;
  $buttonBorder?: CouponProps['buttonBorder'];
  $mobileButtonBorder?: CouponProps['mobileButtonBorder'];
}>`
  padding: 5px 8px;
  cursor: pointer;
  transition: 0.3s;
  white-space: nowrap;
  min-width: 80px;
  
  ${({ $buttonFontSize, $buttonTextColor, $buttonBackgroundColor, $buttonBorder }) => css`
    ${$buttonFontSize && `font-size: ${$buttonFontSize}px;`}
    ${$buttonTextColor && `color: ${$buttonTextColor};`}
    ${$buttonBackgroundColor && `background-color: ${$buttonBackgroundColor};`}
  `}

  ${({ $buttonBorder }) => $buttonBorder && css`
    ${$buttonBorder.style && `border-style: ${$buttonBorder.style};`}
    ${$buttonBorder.color && `border-color: ${$buttonBorder.color};`}
    ${$buttonBorder.radius !== undefined && `border-radius: ${$buttonBorder.radius}px;`}

    ${$buttonBorder.type === "fullBorder" && $buttonBorder.width && `border-width: ${$buttonBorder.width}px;`}
    ${$buttonBorder.type === "bottomOnly" && $buttonBorder.width && `border-width: 0px 0px ${$buttonBorder.width}px;`}
    ${$buttonBorder.type === "topOnly" && $buttonBorder.width && `border-width: ${$buttonBorder.width}px 0px 0px;`}
    ${$buttonBorder.type === "topAndBottom" && $buttonBorder.width && `border-width: ${$buttonBorder.width}px 0px;`}
  `}

  &:hover {
    opacity: 0.9;
  }

  @media (max-width: 800px) {
    ${({ $mobileButtonFontSize, $mobileButtonTextColor, $mobileButtonBackgroundColor }) => css`
      ${$mobileButtonFontSize && `font-size: ${$mobileButtonFontSize}px;`}
      ${$mobileButtonTextColor && `color: ${$mobileButtonTextColor};`}
      ${$mobileButtonBackgroundColor && `background-color: ${$mobileButtonBackgroundColor};`}
    `}

    ${({ $mobileButtonBorder }) => $mobileButtonBorder && css`
      ${$mobileButtonBorder.style && `border-style: ${$mobileButtonBorder.style};`}
      ${$mobileButtonBorder.color && `border-color: ${$mobileButtonBorder.color};`}
      ${$mobileButtonBorder.radius !== undefined && `border-radius: ${$mobileButtonBorder.radius}px;`}

      ${$mobileButtonBorder.type === "fullBorder" && $mobileButtonBorder.width && `border-width: ${$mobileButtonBorder.width}px;`}
      ${$mobileButtonBorder.type === "bottomOnly" && $mobileButtonBorder.width && `border-width: 0px 0px ${$mobileButtonBorder.width}px;`}
      ${$mobileButtonBorder.type === "topOnly" && $mobileButtonBorder.width && `border-width: ${$mobileButtonBorder.width}px 0px 0px;`}
      ${$mobileButtonBorder.type === "topAndBottom" && $mobileButtonBorder.width && `border-width: ${$mobileButtonBorder.width}px 0px;`}
    `}
  }
`;

const ErrorMessage = styled.div`
  margin-top: 5px;
  color: #f20016;
  font-size: 14px;
`;

const SuccessMessage = styled.div`
  margin-top: 5px;
  color: #228b22;
  font-size: 14px;
`;

// Coupon Component
export const Coupon: UserComponent<CouponProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("coupon", "htmlAttrId");
  
  // Use Safe Payment Context (works in both editor and render mode)
  const {
    applyCoupon,
    removeCoupon,
    couponCode: appliedCouponCode,
    isCouponValid,
    couponError,
    isProcessing,
    couponDiscountAmount,
    selectedPlan,
    isPhysicalProduct,
  } = useSafePayment();

  const currency = isPhysicalProduct
    ? ((window as any)?.data?.payment?.physicalProduct?.currency ?? 'usd')
    : (selectedPlan?.currency ?? 'usd');
  
  const [inputValue, setInputValue] = useState("");

  // Define resolved props based on current view mode
  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    boxShadow: getValueByViewMode(viewMode, props.boxShadow, props.mobileBoxShadow),
    border: getValueByViewMode(viewMode, props.border, props.mobileBorder),
    htmlAttrId: props.htmlAttrId,

    // Field specific props
    placeholder: props.placeholder || "",
    fieldFontSize: getValueByViewMode(viewMode, props.fieldFontSize, props.mobileFieldFontSize),
    fieldTextColor: getValueByViewMode(viewMode, props.fieldTextColor, props.mobileFieldTextColor),
    fieldBackgroundColor: getValueByViewMode(viewMode, props.fieldBackgroundColor, props.mobileFieldBackgroundColor),
    fieldBorder: getValueByViewMode(viewMode, props.fieldBorder, props.mobileFieldBorder),
    
    // Button specific props
    buttonText: props.buttonText || "Apply",
    buttonFontSize: getValueByViewMode(viewMode, props.buttonFontSize, props.mobileButtonFontSize),
    buttonTextColor: getValueByViewMode(viewMode, props.buttonTextColor, props.mobileButtonTextColor),
    buttonBackgroundColor: getValueByViewMode(viewMode, props.buttonBackgroundColor, props.mobileButtonBackgroundColor),
    buttonBorder: getValueByViewMode(viewMode, props.buttonBorder, props.mobileButtonBorder),
    
    // Action props
    action: props.action || 'calculate_price',
  };

  const { isActive, isHover, enabled } = useNodeState();

  // Handle apply button click
  const handleApplyClick = async (e: React.MouseEvent) => {
    if (!enabled) {
      e.preventDefault();
      
      if (resolvedProps.action === 'calculate_price') {
        await applyCoupon(inputValue);
      }
    }
  };

  const handleRemoveCoupon = (e: React.MouseEvent) => {
    e.preventDefault();
    removeCoupon();
    setInputValue('');
  };


  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="Coupon">
        <ElementWrapper
          ref={ref}
          id={enabled ? UUIDWrapper : undefined}
          $enabled={enabled}
          $isHover={isHover}
          $isActive={isActive}
          $margin={resolvedProps.margin}
          $mobileMargin={props.mobileMargin}
          $appearance={resolvedProps.appearance}
          $cssDefault="display: flex; flex-direction: column;"
        >
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"Coupon"} /> : null}
          
          <CouponContainer
            $padding={resolvedProps.padding}
            $mobilePadding={props.mobilePadding}
          >
            <StyledInput
              id={resolvedProps.htmlAttrId || elementId}
              type="text"
              placeholder={resolvedProps.placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isCouponValid || isProcessing}
              $fieldFontSize={resolvedProps.fieldFontSize}
              $mobileFieldFontSize={props.mobileFieldFontSize}
              $fieldTextColor={resolvedProps.fieldTextColor}
              $mobileFieldTextColor={props.mobileFieldTextColor}
              $fieldBackgroundColor={resolvedProps.fieldBackgroundColor}
              $mobileFieldBackgroundColor={props.mobileFieldBackgroundColor}
              $fieldBorder={resolvedProps.fieldBorder}
              $mobileFieldBorder={props.mobileFieldBorder}
            />
            
            {/* Conditional Button: Apply or Remove */}
            {!isCouponValid ? (
              <StyledButton
                onClick={handleApplyClick}
                disabled={isProcessing || !inputValue.trim()}
                $buttonFontSize={resolvedProps.buttonFontSize}
                $mobileButtonFontSize={props.mobileButtonFontSize}
                $buttonTextColor={resolvedProps.buttonTextColor}
                $mobileButtonTextColor={props.mobileButtonTextColor}
                $buttonBackgroundColor={resolvedProps.buttonBackgroundColor}
                $mobileButtonBackgroundColor={props.mobileButtonBackgroundColor}
                $buttonBorder={resolvedProps.buttonBorder}
                $mobileButtonBorder={props.mobileButtonBorder}
              >
                {isProcessing ? 'Validating...' : resolvedProps.buttonText}
              </StyledButton>
            ) : (
              <StyledButton
                onClick={handleRemoveCoupon}
                $buttonFontSize={resolvedProps.buttonFontSize}
                $mobileButtonFontSize={props.mobileButtonFontSize}
                $buttonTextColor={resolvedProps.buttonTextColor}
                $mobileButtonTextColor={props.mobileButtonTextColor}
                $buttonBackgroundColor="#dc3545"
                $mobileButtonBackgroundColor="#dc3545"
                $buttonBorder={resolvedProps.buttonBorder}
                $mobileButtonBorder={props.mobileButtonBorder}
              >
                Remove
              </StyledButton>
            )}
          </CouponContainer>
          
          {/* Error/Success Messages */}
          {!enabled && couponError && (
            <ErrorMessage>
              {couponError}
            </ErrorMessage>
          )}
          
          {!enabled && isCouponValid && appliedCouponCode && (
            <SuccessMessage>
              ✓ Coupon applied! You saved {formatPrice(couponDiscountAmount, currency)}
            </SuccessMessage>
          )}
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

Coupon.craft = {
  props: { ...DEFAULT_STYLES.coupon },
  related: { settings: CouponSettings },
  displayName: "Coupon",
};
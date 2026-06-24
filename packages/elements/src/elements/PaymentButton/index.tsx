import { useEditor, UserComponent } from "@launchtic/editor-core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { PaymentButtonProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { PaymentButtonSettings } from "./PaymentButtonSettings";
import { getValueByViewMode, getAppearanceByViewMode, getBoxShadowValue } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import React, { useState } from "react";
import { usePageRender } from "../../contexts/PageRenderContext";
import { useSafePayment } from "../../contexts/PaymentContext";
import { collectFormData, validateFormData } from "../../utils/formHelpers";
import { PayPalButtonWrapper } from "../PaymentMethod/PayPalButtonWrapper";

const StyledPaymentButton = styled.button<{
  $color?: string;
  $mobileColor?: string;
  $hoverBackgroundColor?: string;
  $hoverTextColor?: string;
  $hoverSubTextColor?: string;
  $hoverTransform?: string;
  $hoverOffset?: number;
  $padding?: PaymentButtonProps["padding"];
  $mobilePadding?: PaymentButtonProps["mobilePadding"];
  $fontSize?: number;
  $mobileFontSize?: number;
  $backgroundColor?: string;
  $mobileBackgroundColor?: string;
  $lineHeight?: number;
  $mobileLineHeight?: number;
  $letterSpacing?: number;
  $mobileLetterSpacing?: number;
  $fontFamily?: string;
  $fontStyle?: string;
  $width?: string;
  $mobileWidth?: string;
  $alignSelf?: string;
  $mobileAlignSelf?: string;
  $boxShadow?: string;
  $mobileBoxShadow?: string;
  $border?: PaymentButtonProps['border'];
  $mobileBorder?: PaymentButtonProps['mobileBorder'];
}>`
  opacity: 1;
  cursor: pointer;
  transition: 0.3s;
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }
  
  ${({ $color, $width, $padding, $fontSize, $backgroundColor, $lineHeight, $letterSpacing, $fontFamily, $fontStyle, $boxShadow, $alignSelf }) => css`
    ${$color && `color: ${$color};`}
    ${$alignSelf && `align-self: ${$alignSelf};`}
    ${$width && `width: ${$width === 'full' ? '100%' : 'auto'};`}
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

   ${({ $hoverBackgroundColor, $hoverTransform , $hoverTextColor}) => css`
    &:hover:not(:disabled) {
      ${$hoverBackgroundColor && `background: ${$hoverBackgroundColor};`}
      ${$hoverTextColor && `color: ${$hoverTextColor};`}
      ${$hoverTransform && `transform: ${$hoverTransform};`}
    }
  `}

  @media (max-width: 800px) {
    ${({ $mobilePadding, $mobileFontSize, $mobileBackgroundColor, $mobileLineHeight, $mobileLetterSpacing, $mobileAlignSelf, $mobileWidth, $mobileBoxShadow, }) => css`
      ${$mobileAlignSelf && `align-self: ${$mobileAlignSelf};`}
      ${$mobileWidth && `width: ${$mobileWidth === 'full' ? '100%' : 'auto'};`}
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
        ${$mobileBorder.type === "bottomOnly" && $mobileBorder.width && `border-width: 0px 0px ${$mobileBorder.width}px;`}
        ${$mobileBorder.type === "topOnly" && $mobileBorder.width && `border-width: ${$mobileBorder.width}px 0px 0px;`}
        ${$mobileBorder.type === "topAndBottom" && $mobileBorder.width && `border-width: ${$mobileBorder.width}px 0px;`}
      `}
  }
`;

const ButtonTextWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
`;

const IconBeforeText = styled.i`
  margin-right: 15px;
`;

const IconAfterText = styled.i`
  margin-left: 15px;
`;

const SubText = styled.small<{
  $subTextColor?: string;
  $subTextFontSize?: number;
  $mobileSubTextFontSize?: number;
  $subTextFontFamily?: string;
  $subTextFontStyle?: string;
  $hoverSubTextColor?: string;
}>`
  font-size: ${({ $subTextFontSize }) => $subTextFontSize || 16}px;
  color: ${({ $subTextColor }) => $subTextColor || 'rgba(255, 255, 255, 0.8)'};
  font-family: ${({ $subTextFontFamily }) => $subTextFontFamily || 'inherit'};
  
  ${({ $subTextFontStyle }) => $subTextFontStyle?.includes("italic") ? `font-style: italic;` : ""}
  ${({ $subTextFontStyle }) => $subTextFontStyle ? `font-weight: ${$subTextFontStyle.replace("italic", "")};` : ""}
  
  ${StyledPaymentButton}:hover:not(:disabled) & {
    ${({ $hoverSubTextColor }) => $hoverSubTextColor && `color: ${$hoverSubTextColor};`}
  }
  
  @media (max-width: 800px) {
    ${({ $mobileSubTextFontSize }) => $mobileSubTextFontSize && `font-size: ${$mobileSubTextFontSize}px;`}
  }
`;

// PaymentButton Component
export const PaymentButton: UserComponent<PaymentButtonProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("paymentButton", "htmlAttrId");
  
  // Hooks
  const { query } = useEditor();
  const pageRenderContext = usePageRender();
  
  // Use Safe Payment Context (works in both editor and render mode)
  const { isProcessing: isPaymentProcessing, selectedPaymentMethod } = useSafePayment();

  // Local state
  const [buttonText, setButtonText] = useState(props.text || "Pay Now");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Define resolved props based on current view mode
  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    backgroundColor: getValueByViewMode(viewMode, props.backgroundColor, props.mobileBackgroundColor),
    fontSize: getValueByViewMode(viewMode, props.fontSize, props.mobileFontSize),
    lineHeight: getValueByViewMode(viewMode, props.lineHeight, props.mobileLineHeight),
    letterSpacing: getValueByViewMode(viewMode, props.letterSpacing, props.mobileLetterSpacing),
    fontType: props.fontType,
    fontFamily: props.fontFamily,
    fontStyle: props.fontStyle,
    alignSelf: getValueByViewMode(viewMode, props.alignSelf, props.mobileAlignSelf),
    boxShadow: getValueByViewMode(viewMode, props.boxShadow, props.mobileBoxShadow),
    border: getValueByViewMode(viewMode, props.border, props.mobileBorder),
    mobileBorder: props.mobileBorder,
    mobileMargin: props.mobileMargin,
    mobileBackgroundColor: props.mobileBackgroundColor,
    mobileFontSize: props.mobileFontSize,
    mobileLineHeight: props.mobileLineHeight,
    mobileLetterSpacing: props.mobileLetterSpacing,
    mobileAlignSelf: props.mobileAlignSelf,
    mobileBoxShadow: props.mobileBoxShadow,
    mobilePadding: props.mobilePadding,
    htmlAttrId: props.htmlAttrId,

    // PaymentButton specific props
    text: props.text || "",
    subText: props.subText,
    loadingText: props.loadingText,
    validationText: props.validationText,
    subTextFontSize: props.subTextFontSize,
    mobileSubTextFontSize: props.mobileSubTextFontSize,
    subTextColor: props.subTextColor,
    subTextFontFamily: props.subTextFontFamily,
    subTextFontType: props.subTextFontType,
    subTextFontStyle: props.subTextFontStyle,
    iconClassNameBefore: props.iconClassNameBefore,
    iconClassNameAfter: props.iconClassNameAfter,
    width: getValueByViewMode(viewMode, props.width, props.mobileWidth),
    mobileWidth: props.mobileWidth,
    color: getValueByViewMode(viewMode, props.color, props.mobileColor),
    mobileColor: props.mobileColor,
    
    // Hover effects
    hover: props.hover || {},
  };

  const { isActive, isHover, enabled } = useNodeState();

  // Handle click
  const handleClick = async (e: React.MouseEvent) => {
    if (!enabled) {
      e.preventDefault();
      setErrorMessage(null);

      if (!query || !pageRenderContext) return;

      const paymentData = (window as any).data?.payment ?? null;
      const isCheckoutPage = paymentData != null;

      // --- Pre-submit checkout validation ---
      if (isCheckoutPage) {
        const paymentMethods: string[] = paymentData?.paymentMethods ?? [];
        if (paymentMethods.length === 0) {
          setErrorMessage('No payment method configured. Please contact support.');
          return;
        }

        const hasPricePlan = (paymentData?.offer?.pricePlans ?? []).length > 0;
        const hasPhysicalProduct = paymentData?.physicalProduct != null;
        if (!hasPricePlan && !hasPhysicalProduct) {
          setErrorMessage('No product configured for this page. Please contact support.');
          return;
        }
      }

      setButtonText(resolvedProps.validationText || 'Validating...');

      const { formData, fieldInfo } = collectFormData(query);
      const validationErrors = validateFormData(formData, fieldInfo);
      if (Object.keys(validationErrors).length > 0) {
        if (pageRenderContext.setErrors) {
          pageRenderContext.setErrors(validationErrors);
        }
        setButtonText(props.text || "Pay Now");
        return;
      }

      setIsLoading(true);
      setButtonText(resolvedProps.loadingText || "Processing...");

      try {
        const result = await pageRenderContext.submitForm('next_step', undefined, query);

        if (result?.data?.nextStepUrl) {
          setTimeout(() => { window.location.href = result.data.nextStepUrl; }, 800);
        } else if (result?.nextStepUrl) {
          setTimeout(() => { window.location.href = result.nextStepUrl; }, 800);
        }
      } catch (error: any) {
        const msg = error?.message || 'Payment failed. Please try again.';
        setErrorMessage(msg);
        setButtonText(props.text || "Pay Now");
      } finally {
        setIsLoading(false);
      }
    }
  };


  const isPayPal = !enabled && selectedPaymentMethod === "paypal";

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="PaymentButton">
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
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"Payment Button"} /> : null}

          {isPayPal && (
            <PayPalButtonWrapper
              onError={(msg) => { setErrorMessage(msg); setIsLoading(false); }}
              onSuccess={(nextStepUrl) => {
                if (nextStepUrl) setTimeout(() => { window.location.href = nextStepUrl; }, 400);
              }}
              onProcessing={(loading) => {
                setIsLoading(loading);
                setButtonText(loading ? (resolvedProps.loadingText || "Processing...") : (props.text || "Pay Now"));
              }}
            />
          )}

          {!isPayPal && <StyledPaymentButton
            id={resolvedProps.htmlAttrId || elementId}
            onClick={handleClick}
            disabled={isLoading || isPaymentProcessing}
            $color={resolvedProps.color}
            $mobileColor={resolvedProps.mobileColor}
            $hoverBackgroundColor={resolvedProps.hover.backgroundColor}
            $hoverTextColor={resolvedProps.hover.textColor}
            $hoverSubTextColor={resolvedProps.hover.subTextColor}
            $hoverTransform={resolvedProps.hover.transform}
            $hoverOffset={resolvedProps.hover.offset}
            $padding={resolvedProps.padding}
            $mobilePadding={resolvedProps.mobilePadding}
            $fontSize={resolvedProps.fontSize}
            $mobileFontSize={resolvedProps.mobileFontSize}
            $backgroundColor={resolvedProps.backgroundColor}
            $mobileBackgroundColor={resolvedProps.mobileBackgroundColor}
            $lineHeight={resolvedProps.lineHeight}
            $mobileLineHeight={resolvedProps.mobileLineHeight}
            $letterSpacing={resolvedProps.letterSpacing}
            $mobileLetterSpacing={resolvedProps.mobileLetterSpacing}
            $fontFamily={resolvedProps.fontFamily}
            $fontStyle={resolvedProps.fontStyle}
            $width={resolvedProps.width}
            $mobileWidth={resolvedProps.mobileWidth}
            $alignSelf={resolvedProps.alignSelf}
            $mobileAlignSelf={resolvedProps.mobileAlignSelf}
            $boxShadow={resolvedProps.boxShadow}
            $mobileBoxShadow={resolvedProps.mobileBoxShadow}
            $border={resolvedProps.border}
            $mobileBorder={resolvedProps.mobileBorder}
          >
            <ButtonTextWrapper>
              {isLoading && (
                <IconBeforeText className="fas fa-spinner fa-spin" />
              )}
              
              {!isLoading && resolvedProps.iconClassNameBefore && (
                <IconBeforeText className={resolvedProps.iconClassNameBefore} />
              )}
              
              {buttonText}
              
              {!isLoading && resolvedProps.iconClassNameAfter && (
                <IconAfterText className={resolvedProps.iconClassNameAfter} />
              )}
            </ButtonTextWrapper>
            
            {resolvedProps.subText && (
              <SubText 
                $subTextColor={resolvedProps.subTextColor}
                $subTextFontSize={resolvedProps.subTextFontSize}
                $mobileSubTextFontSize={resolvedProps.mobileSubTextFontSize}
                $subTextFontFamily={resolvedProps.subTextFontFamily}
                $subTextFontStyle={resolvedProps.subTextFontStyle}
                $hoverSubTextColor={resolvedProps.hover.subTextColor}
              >
                {resolvedProps.subText}
              </SubText>
            )}
          </StyledPaymentButton>}

          {errorMessage && !enabled && (
            <div style={{
              marginTop: '8px',
              padding: '10px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '13px',
              lineHeight: '1.4',
              textAlign: 'center',
            }}>
              {errorMessage}
            </div>
          )}
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

PaymentButton.craft = {
  props: { ...DEFAULT_STYLES.paymentButton },
  related: { settings: PaymentButtonSettings },
  displayName: "PaymentButton",
};
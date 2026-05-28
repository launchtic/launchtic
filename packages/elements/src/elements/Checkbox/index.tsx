import { UserComponent } from "@craftjs/core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { CheckboxProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { CheckboxSettings } from "./CheckboxSettings";
import { getValueByViewMode, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement"; 
import { usePageRender } from "../../contexts/PageRenderContext";
import CheckboxContent from "./CheckboxContent";

const CheckboxMain = styled.label<{
  $padding?: CheckboxProps["padding"];
  $mobilePadding?: CheckboxProps["mobilePadding"];
  $fontSize?: number;
  $mobileFontSize?: number;
  $color?: string;
  $mobileColor?: string;
  $backgroundColor?: string;
  $mobileBackgroundColor?: string;
  $textAlign?: string;
  $lineHeight?: number;
  $mobileLineHeight?: number;
  $letterSpacing?: number;
  $mobileLetterSpacing?: number;
  $fontType?: string;
  $fontFamily?: string;
  $fontStyle?: string;
  $enabled?: boolean; 
  $hasError?: boolean;
}>`
  word-break: break-word;
  transition: box-shadow 0.1s ease-in-out;
  flex-basis: inherit;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;

  ${({ $padding, $fontSize, $backgroundColor, $textAlign, $lineHeight, $letterSpacing, $fontFamily, $fontStyle, $hasError }) => css`
    ${$padding && `padding: ${$padding.paddingTop}px ${$padding.paddingRight}px ${$padding.paddingBottom}px ${$padding.paddingLeft}px;`}
    ${$fontSize && `font-size: ${$fontSize}px;`}
    ${$backgroundColor && `background-color: ${$backgroundColor};`}
    ${$textAlign && `text-align: ${$textAlign};`}
    ${$lineHeight && `line-height: ${$lineHeight}px;`}
    ${$letterSpacing !== undefined && `letter-spacing: ${$letterSpacing}px;`}
    ${$fontFamily ? `font-family: ${$fontFamily};` : ""}
    ${$fontStyle?.includes("italic") ? `font-style: italic;` : ""}
    ${$fontStyle ? `font-weight: ${$fontStyle.replace("italic", "")};` : ""}
  `}

  .checkbox-input {
    margin-top: 3px;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    accent-color: #007bff;
    cursor: pointer;
    ${({ $hasError }) => $hasError && css`
      border: 2px solid #dc3545 !important;
      outline: none;
      box-shadow: 0 0 0 1px #dc3545;
    `}
  }

  .checkbox-content {
    flex: 1;
    line-height: inherit;
    cursor: pointer;
  }

  @media (max-width: 800px) {
    ${({ $mobilePadding, $mobileFontSize, $mobileBackgroundColor, $mobileLineHeight, $mobileLetterSpacing }) => css`
      ${$mobileFontSize && `font-size: ${$mobileFontSize}px;`}
      ${$mobileBackgroundColor && `background-color: ${$mobileBackgroundColor};`}
      ${$mobileLineHeight && `line-height: ${$mobileLineHeight}px;`}
      ${$mobileLetterSpacing !== undefined && `letter-spacing: ${$mobileLetterSpacing}px;`}
      ${$mobilePadding && `padding: ${$mobilePadding.paddingTop}px ${$mobilePadding.paddingRight}px ${$mobilePadding.paddingBottom}px ${$mobilePadding.paddingLeft}px;`}
    `}
  }
`;

export const ErrorMessage = styled.div`
  color: #e53e3e;
  font-size: 14px;
  margin-top: 5px;
  line-height: 1.2;
  font-weight: 500;
`;
export const Checkbox: UserComponent<CheckboxProps> = ({ disableActions, ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("checkbox", "htmlAttrId");
  const pageRenderContext = usePageRender();
  const { isActive, isHover, enabled } = useNodeState();
  
  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    backgroundColor: getValueByViewMode(viewMode, props.backgroundColor, props.mobileBackgroundColor),
    textAlign: getValueByViewMode(viewMode, props.textAlign, props.mobileTextAlign),
    fontSize: getValueByViewMode(viewMode, props.fontSize, props.mobileFontSize),
    lineHeight: getValueByViewMode(viewMode, props.lineHeight, props.mobileLineHeight),
    letterSpacing: getValueByViewMode(viewMode, props.letterSpacing, props.mobileLetterSpacing),
    fontType: props.fontType,
    fontFamily: props.fontType !== "default" ? props.fontFamily : undefined,
    fontStyle: props.fontStyle,
    rawContentState: props.rawContentState,
    isOptional: props.isOptional,
    validationMessage: props.validationMessage,
  
    mobileMargin: props.mobileMargin,
    mobilePadding: props.mobilePadding,
    mobileBackgroundColor: props.mobileBackgroundColor,
    mobileTextAlign: props.mobileTextAlign,
    mobileFontSize: props.mobileFontSize,
    mobileLineHeight: props.mobileLineHeight,
    mobileLetterSpacing: props.mobileLetterSpacing,
  };

  // Generate unique ID for checkbox input
  const checkboxId = props.htmlAttrId || `${elementId}-checkbox`;
  
  // Get error from context
  const actualFieldId = props.htmlAttrId || elementId;
  const error = pageRenderContext?.errors?.[actualFieldId];
  const hasError = !!error;
  
  // Use custom validation message if available, otherwise use context error
  const displayError = error || (hasError && resolvedProps.validationMessage);

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="Checkbox">
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
          {!disableActions && ((enabled && isActive) || (enabled && isHover)) ? 
          <Indicator name={"Checkbox"} /> : null}
          
          <CheckboxMain
            htmlFor={checkboxId}
            $fontSize={resolvedProps.fontSize}
            $mobileFontSize={resolvedProps.mobileFontSize}
            $backgroundColor={resolvedProps.backgroundColor}
            $mobileBackgroundColor={resolvedProps.mobileBackgroundColor}
            $textAlign={resolvedProps.textAlign}
            $lineHeight={resolvedProps.lineHeight}
            $mobileLineHeight={resolvedProps.mobileLineHeight}
            $letterSpacing={resolvedProps.letterSpacing}
            $mobileLetterSpacing={resolvedProps.mobileLetterSpacing}
            $padding={resolvedProps.padding}
            $mobilePadding={resolvedProps.mobilePadding}
            $fontType={resolvedProps.fontType}
            $fontFamily={resolvedProps.fontFamily}
            $fontStyle={resolvedProps.fontStyle}
            $hasError={hasError}
          >
            <input 
              type="checkbox" 
              id={checkboxId}
              className="checkbox-input"
              required={!resolvedProps.isOptional}
              disabled={enabled} // Disable input in editor mode
            />
            <div className="checkbox-content">
              <CheckboxContent rawContentState={resolvedProps.rawContentState} />
            </div>
          </CheckboxMain>
          
          {displayError && <ErrorMessage>{displayError}</ErrorMessage>}
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

Checkbox.craft = {
  props: { ...DEFAULT_STYLES.checkbox },
  related: { settings: CheckboxSettings },
  displayName: "Checkbox",
};
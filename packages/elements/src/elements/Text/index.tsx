import { UserComponent } from "@craftjs/core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { TextProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { TextSettings } from "./TextSettings";
import { getValueByViewMode, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement"; 
import TextContent from "./TextContent";

const TextMain = styled.div<{
  $padding?: TextProps["padding"];
  $mobilePadding?: TextProps["mobilePadding"];
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
}>`
  word-break: break-word;
  transition: box-shadow 0.1s ease-in-out;
  flex-basis: inherit;

  ${({ $padding, $fontSize, $backgroundColor, $textAlign, $lineHeight, $letterSpacing, $fontFamily, $fontStyle }) => css`
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

export const Text: UserComponent<TextProps> = ({ disableActions, ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("text", "htmlAttrId");

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
  
    mobileMargin: props.mobileMargin,
    mobilePadding: props.mobilePadding,
    mobileBackgroundColor: props.mobileBackgroundColor,
    mobileTextAlign: props.mobileTextAlign,
    mobileFontSize: props.mobileFontSize,
    mobileLineHeight: props.mobileLineHeight,
    mobileLetterSpacing: props.mobileLetterSpacing,
  };

  const { isActive, isHover, enabled } = useNodeState();

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="Text">
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
          <Indicator name={"Text"} /> : null}
          <TextMain
            id={props.htmlAttrId || elementId}
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
          >
            <TextContent rawContentState={resolvedProps.rawContentState} />
          </TextMain>
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

Text.craft = {
  props: { ...DEFAULT_STYLES.text },
  related: { settings: TextSettings },
  displayName: "Text",
};
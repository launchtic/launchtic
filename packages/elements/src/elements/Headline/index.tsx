import React from "react";
import { UserComponent } from "@launchtic/editor-core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { HeadlineProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { HeadlineSettings } from "./HeadlineSettings";
import { getValueByViewMode, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement"; 
import HeadllineContent from "./HeadllineContent";

const HeadlineMain = styled.div<{
  $padding?: HeadlineProps["padding"];
  $mobilePadding?: HeadlineProps["mobilePadding"];
  $fontSize?: number;
  $mobileFontSize?: number;
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

export const Headline: UserComponent<HeadlineProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("headline", "htmlAttrId");

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
        <ElementDrag elementType="Headline">
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
            {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"Headline"} /> : null}
            <HeadlineMain
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
              <HeadllineContent rawContentState={resolvedProps.rawContentState} />
            </HeadlineMain>
          </ElementWrapper>
        </ElementDrag>
    </DelayedRender>
  );
};

Headline.craft = {
  props: { ...DEFAULT_STYLES.headline },
  related: { settings: HeadlineSettings },
  displayName: "Headline",
};
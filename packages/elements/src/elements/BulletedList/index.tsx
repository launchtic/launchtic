import React from "react";
import { UserComponent } from "@launchtic/editor-core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { BulletedListProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { BulletedListSettings } from "./BulletedListSettings";
import { getValueByViewMode, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement"; 
import BulletedListContent from "./BulletedListContent";

const BulletedListMain = styled.div<{
  $padding?: BulletedListProps["padding"];
  $mobilePadding?: BulletedListProps["mobilePadding"];
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
  $iconColor?: string;
  $mobileIconColor?: string;
  $iconSize?: number;
  $verticalSpacing?: number;
  $mobileVerticalSpacing?: number;
  $verticalAlign?: BulletedListProps["verticalAlign"];
}>`
  word-break: break-word;
  transition: box-shadow 0.1s ease-in-out;
  flex-basis: inherit;

  ${({ $padding, $fontSize, $backgroundColor, $textAlign, $lineHeight, $letterSpacing, $fontFamily, $fontStyle, $iconColor, $iconSize, $verticalSpacing, $verticalAlign }) => css`
    ${$padding && `padding: ${$padding.paddingTop}px ${$padding.paddingRight}px ${$padding.paddingBottom}px ${$padding.paddingLeft}px;`}
    ${$fontSize && `font-size: ${$fontSize}px;`}
    ${$backgroundColor && `background-color: ${$backgroundColor};`}
    ${$textAlign && `text-align: ${$textAlign};`}
    ${$lineHeight && `line-height: ${$lineHeight}px;`}
    ${$letterSpacing !== undefined && `letter-spacing: ${$letterSpacing}px;`}
    ${$fontFamily ? `font-family: ${$fontFamily};` : ""}
    ${$fontStyle?.includes("italic") ? `font-style: italic;` : ""}
    ${$fontStyle ? `font-weight: ${$fontStyle.replace("italic", "")};` : ""}
    
    & ul {
        margin-left: 25px;
        padding-left: 0px;
    }
    & li > i {
      margin-left: -25px;
      margin-right: 10px;
      ${$iconColor && `color: ${$iconColor};`}
      ${$iconSize !== undefined && `font-size: ${$iconSize}px;`}
    }
    & li {
      display: flex;
      align-items: ${$verticalAlign === "top" ? "baseline" : $verticalAlign === "bottom" ? "flex-end" : "center"};
      list-style: none !important;
      margin-left: 0px !important;
      ${$verticalSpacing !== undefined && `margin-bottom: ${$verticalSpacing}px;`}
    }

  `}

  @media (max-width: 800px) {
    ${({ $mobilePadding, $mobileFontSize, $mobileBackgroundColor, $mobileLineHeight, $mobileLetterSpacing, $mobileIconColor, $mobileVerticalSpacing }) => css`
      ${$mobileFontSize && `font-size: ${$mobileFontSize}px;`}
      ${$mobileBackgroundColor && `background-color: ${$mobileBackgroundColor};`}
      ${$mobileLineHeight && `line-height: ${$mobileLineHeight}px;`}
      ${$mobileLetterSpacing !== undefined && `letter-spacing: ${$mobileLetterSpacing}px;`}
      ${$mobilePadding && `padding: ${$mobilePadding.paddingTop}px ${$mobilePadding.paddingRight}px ${$mobilePadding.paddingBottom}px ${$mobilePadding.paddingLeft}px;`}
      
      & li {
        ${$mobileVerticalSpacing !== undefined && `margin-bottom: ${$mobileVerticalSpacing}px;`}
      }

      & li > i {
        ${$mobileIconColor !== undefined && `color: ${$mobileIconColor};`}
      }

    `}
  }
`;

export const BulletedList: UserComponent<BulletedListProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("BulletedList", "htmlAttrId");

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
    iconColor: getValueByViewMode(viewMode, props.iconColor, props.mobileIconColor),
    iconSize: getValueByViewMode(viewMode, props.iconSize, props.mobileIconSize),
    verticalSpacing: getValueByViewMode(viewMode, props.verticalSpacing, props.mobileVerticalSpacing),
  
    mobileMargin: props.mobileMargin,
    mobilePadding: props.mobilePadding,
    mobileBackgroundColor: props.mobileBackgroundColor,
    mobileTextAlign: props.mobileTextAlign,
    mobileFontSize: props.mobileFontSize,
    mobileLineHeight: props.mobileLineHeight,
    mobileLetterSpacing: props.mobileLetterSpacing,
    mobileIconColor: props.mobileIconColor,
    mobileVerticalSpacing: props.mobileVerticalSpacing,
  };

  const { isActive, isHover, enabled } = useNodeState();

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="BulletedList">
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
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"BulletedList"} /> : null}
          <BulletedListMain
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
            $iconColor={resolvedProps.iconColor}
            $mobileIconColor={resolvedProps.mobileIconColor}
            $iconSize={resolvedProps.iconSize}
            $verticalSpacing={resolvedProps.verticalSpacing}
            $mobileVerticalSpacing={resolvedProps.mobileVerticalSpacing}
            $verticalAlign={props.verticalAlign}
          >
            <BulletedListContent rawContentState={resolvedProps.rawContentState} />
          </BulletedListMain>
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

BulletedList.craft = {
  props: { ...DEFAULT_STYLES.bulletedList },
  related: { settings: BulletedListSettings },
  displayName: "BulletedList",
};
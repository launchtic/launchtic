import { useState } from "react";
import { useEditor, UserComponent } from "@launchtic/editor-core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { ButtonProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { ButtonSettings } from "./ButtonSettings";
import { getValueByViewMode, getAppearanceByViewMode, getBoxShadowValue } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { usePageRender } from "../../contexts/PageRenderContext";

const StyledButton = styled.button<{
  $color?: string;
  $mobileColor?: string;
  $hoverBackgroundColor?: string;
  $hoverTextColor?: string;
  $hoverSubTextColor?: string;
  $hoverTransform?: string;
  $hoverOffset?: number;
  $padding?: ButtonProps["padding"];
  $mobilePadding?: ButtonProps["mobilePadding"];
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
  $border?: ButtonProps['border'];
  $mobileBorder?: ButtonProps['mobileBorder'];
}>`
  opacity: 1;
  cursor: pointer;
  transition: 0.3s;
  text-decoration: none;
  text-align: center;
  display: inline-block;

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
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
    &:hover {
      ${$hoverBackgroundColor && `background: ${$hoverBackgroundColor};`}
      ${$hoverTextColor && `color: ${$hoverTextColor};`}
      ${$hoverTransform && `background: ${$hoverTransform};`}
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
  
  ${StyledButton}:hover & {
    ${({ $hoverSubTextColor }) => $hoverSubTextColor && `color: ${$hoverSubTextColor};`}
  }
  
  @media (max-width: 800px) {
    ${({ $mobileSubTextFontSize }) => $mobileSubTextFontSize && `font-size: ${$mobileSubTextFontSize}px;`}
  }
`;

const ButtonError = styled.div`
  margin-top: 8px;
  font-size: 13px;
  color: #ff1800;
  text-align: center;
`;

const buildOpenUrlRel = (newWindow: boolean, nofollow: boolean): string | undefined => {
  const tokens: string[] = [];
  if (newWindow) tokens.push("noopener", "noreferrer");
  if (nofollow) tokens.push("nofollow");
  return tokens.length ? tokens.join(" ") : undefined;
};

// Button Component
export const Button: UserComponent<ButtonProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("button", "htmlAttrId");
  const { query } = useEditor();

  const pageRenderContext = usePageRender();
  const [submitError, setSubmitError] = useState<string | null>(null);

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

    // Button specific props
    text: props.text || "",
    subText: props.subText,
    // Resolve by view mode like the main button fontSize (line above) so the
    // editor's mobile preview shows the mobile size. mobileSubTextFontSize is
    // still passed through for the published page's @media (max-width:800px) rule.
    subTextFontSize: getValueByViewMode(viewMode, props.subTextFontSize, props.mobileSubTextFontSize),
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
    
    // Action props
    action: props.action || 'submit_form',
    redirectionType: props.redirectionType || 'nextStep',
    linkUrl: props.linkUrl || '',
    nofollow: props.nofollow || false,
    popup: props.popup || '',
    doubleOptIn: props.doubleOptIn || false,
  };

  const { isActive, isHover, enabled } = useNodeState();

  const isSubmitting = !!pageRenderContext?.isSubmitting;
  const isSubmitAction = resolvedProps.action === 'submit_form';
  const isOpenUrlAction = resolvedProps.action === 'open_url' && !!resolvedProps.linkUrl;
  const isNextStepAction = resolvedProps.action === 'next_step_url';
  const newWindow = resolvedProps.redirectionType === 'newWindow';

  // Resolve the URL to render as <a href> for crawlable / right-click-friendly actions
  const nextStepUrlFromWindow =
    typeof window !== 'undefined' ? (window as any).data?.nextStepUrl ?? null : null;

  const renderAsLink = isOpenUrlAction || (isNextStepAction && !!nextStepUrlFromWindow);
  const linkHref = isOpenUrlAction ? resolvedProps.linkUrl : nextStepUrlFromWindow;
  const linkTarget = isOpenUrlAction && newWindow ? '_blank' : undefined;
  const linkRel = isOpenUrlAction
    ? buildOpenUrlRel(newWindow, resolvedProps.nofollow)
    : undefined;

  // Handle button click action
  const handleClick = async (e: React.MouseEvent) => {
    // In editor mode: never trigger any action, never navigate
    if (enabled) {
      e.preventDefault();
      return;
    }

    // Guard against double-click while a submit is in flight
    if (isSubmitting) {
      e.preventDefault();
      return;
    }

    switch (resolvedProps.action) {
      case 'submit_form': {
        e.preventDefault();
        if (!pageRenderContext) return;
        setSubmitError(null);
        try {
          await pageRenderContext.submitForm(
            resolvedProps.redirectionType,
            resolvedProps.linkUrl,
            query
          );
        } catch (err: any) {
          // Per-field errors are surfaced by Field components via context;
          // only show generic errors here.
          if (!err?.mappedErrors) {
            setSubmitError(err?.message || 'Submission failed. Please try again.');
          }
        }
        return;
      }

      case 'open_url':
        // Rendered as <a href target rel> — let the browser handle navigation natively.
        return;

      case 'next_step_url': {
        if (linkHref) {
          // Rendered as <a href> — let browser handle natively. No-op here.
          return;
        }
        // Fallback: no nextStepUrl available (e.g. last step in funnel)
        e.preventDefault();
        return;
      }

      case 'none':
        e.preventDefault();
        return;

      default:
        e.preventDefault();
        return;
    }
  };

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="Button">
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
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"Button"} /> : null}
          <StyledButton
            {...(renderAsLink
              ? { as: "a" as const, href: linkHref, target: linkTarget, rel: linkRel }
              : { type: "button" as const })}
            id={resolvedProps.htmlAttrId || elementId}
            onClick={handleClick}
            disabled={!renderAsLink && isSubmitting && isSubmitAction ? true : undefined}
            aria-busy={isSubmitting && isSubmitAction ? true : undefined}
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
              {resolvedProps.iconClassNameBefore && !(isSubmitting && isSubmitAction) && (
                <IconBeforeText className={resolvedProps.iconClassNameBefore} />
              )}
              {isSubmitting && isSubmitAction ? "Submitting..." : resolvedProps.text}
              {resolvedProps.iconClassNameAfter && !(isSubmitting && isSubmitAction) && (
                <IconAfterText className={resolvedProps.iconClassNameAfter} />
              )}
            </ButtonTextWrapper>

            {resolvedProps.subText && !(isSubmitting && isSubmitAction) && (
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
          </StyledButton>
          {submitError && <ButtonError>{submitError}</ButtonError>}
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

Button.craft = {
  props: { ...DEFAULT_STYLES.button },
  related: { settings: ButtonSettings },
  displayName: "Button",
};
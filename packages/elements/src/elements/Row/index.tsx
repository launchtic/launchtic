import { UserComponent, useEditor } from "@launchtic/editor-core";
import styled, { css } from "styled-components";
import { RowProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { RowSettings } from "./RowSettings";
import { getValueByViewMode, getBoxShadowValue, getAppearanceByViewMode, getBackgroundImageCss } from "../../utils/helpers";
import { useDraggableElement } from "../common/useDraggableElement";
import { DelayedRender } from "../common/DelayedRender";
import { ElementWrapper } from "../common/ElementWrapper";
import { Indicator } from "../../editor/common/Indicator";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { Resizer } from "../../editor/common/Resizer";
import { useMemo } from "react";
import RowDrag from "./RowDrag";

// Always-visible "Row" tab in the top-left corner — gives the user a
// reliable click target to select the Row even when its Columns fill the
// entire body. Replaces the previous trick of putting padding on Columns
// (which broke content left-alignment). Hidden when the Indicator chrome
// is already showing (hover/active) to avoid double UI.
const RowBadge = styled.button`
  position: absolute;
  top: 0;
  left: 0;
  z-index: 5;
  background: rgba(33, 150, 243, 0.7);
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  padding: 2px 7px;
  border: none;
  border-radius: 0 0 4px 0;
  cursor: pointer;
  opacity: 0.35;
  transition: opacity 0.15s, background 0.15s;

  &:hover {
    opacity: 1;
    background: rgba(33, 150, 243, 1);
  }
`;


const RowMain = styled.div<{
  $viewMode?: any,
  $padding?: RowProps["padding"];
  $mobilePadding?: RowProps["mobilePadding"];
  $backgroundColor?: string;
  $mobileBackgroundColor?: string;
  $backgroundImage?: RowProps["backgroundImage"];
  $mobileBackgroundImage?: RowProps["mobileBackgroundImage"];
  $boxShadow?: string;
  $mobileBoxShadow?: string;
  $border?: RowProps["border"];
  $mobileBorder?: RowProps["mobileBorder"];
  $disableStacking?: boolean;
  $reverseColumns?: boolean;
  $gap?: number;
  $mobileGap?: number;
  $verticalAlign?: RowProps["verticalAlign"];
  $stretch?: boolean;
}>`
  position: relative;
  ${({ $stretch }) => $stretch && "flex: 1;"}
  /* CSS gap shorthand — works for both grid (desktop, horizontal between
     columns) and flex column (mobile stacked, vertical between rows).
     Mobile overrides it with mobileGap when set (media query below). */
  gap: ${({ $gap }) => ($gap ?? 10)}px;

  ${({ $viewMode, $disableStacking }) =>
    ($viewMode === "desktop" || $disableStacking) &&
    css`
      display: grid;
      grid-template-columns: repeat(12, 1fr);
  `}

  /* Columns side by side: center/bottom them instead of stretching. */
  ${({ $viewMode, $disableStacking, $verticalAlign }) =>
    ($viewMode === "desktop" || $disableStacking) &&
    ($verticalAlign === "center" || $verticalAlign === "bottom") &&
    `align-items: ${$verticalAlign === "center" ? "center" : "end"};`}
  
  ${({ $viewMode, $disableStacking, $reverseColumns }) =>
    $viewMode === "mobile" && !$disableStacking &&
    css`
      display: flex;
      flex-direction: ${$reverseColumns ? "column-reverse" : "column"};
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

  ${({ $padding, $backgroundColor, $backgroundImage, $boxShadow }) => css`
    ${$backgroundColor && `background-color: ${$backgroundColor};`}
    ${$backgroundImage && getBackgroundImageCss($backgroundImage)}
    ${$boxShadow && `box-shadow: ${getBoxShadowValue($boxShadow)};`}
    ${$padding &&
    `padding: ${$padding.paddingTop}px ${$padding.paddingRight}px ${$padding.paddingBottom}px ${$padding.paddingLeft}px;`}
  `}

  ${({ $backgroundImage }) => $backgroundImage?.overlay && css`
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background: ${$backgroundImage.overlay};
      pointer-events: none;
      z-index: 0;
    }
    > * { position: relative; z-index: 1; }
  `}

  @media (max-width: 800px) {
    ${({ $mobileGap }) => $mobileGap !== undefined && `gap: ${$mobileGap}px;`}
    /* Stacked columns: align-items would act horizontally, so reset it. */
    ${({ $disableStacking, $verticalAlign }) => !$disableStacking && $verticalAlign && "align-items: stretch;"}

    ${({ $disableStacking, $reverseColumns }) =>
    !$disableStacking &&
    css`
      display: flex;
      flex-direction: ${$reverseColumns ? "column-reverse" : "column"};
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

    ${({ $mobilePadding, $mobileBackgroundColor, $mobileBackgroundImage, $mobileBoxShadow }) => css`
      ${$mobileBackgroundColor && `background-color: ${$mobileBackgroundColor};`}
      ${$mobileBackgroundImage && getBackgroundImageCss($mobileBackgroundImage)}
      ${$mobileBoxShadow && `box-shadow: ${getBoxShadowValue($mobileBoxShadow)};`}
      ${$mobilePadding &&
      `padding: ${$mobilePadding.paddingTop}px ${$mobilePadding.paddingRight}px ${$mobilePadding.paddingBottom}px ${$mobilePadding.paddingLeft}px;`}
    `}

    ${({ $mobileBackgroundImage }) => $mobileBackgroundImage?.overlay && css`
      &::before {
        content: '';
        position: absolute;
        inset: 0;
        background: ${$mobileBackgroundImage.overlay};
        pointer-events: none;
        z-index: 0;
      }
      > * { position: relative; z-index: 1; }
    `}
  }
`;

// Dedicated container that hosts the resizable handle
const ResizableContainer = styled.div<{ $stretch?: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  ${({ $stretch }) => $stretch && css`
    flex: 1;
    display: flex;
    flex-direction: column;
  `}

  /* Show the Resizer when hovering over ResizableContainer */
  &:hover .resizer-handle {
    opacity: 1;
  }
`;

export const Row: UserComponent<RowProps> = ({ children, ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("row", "htmlAttrId");
  const { id, query , isActive, isHover, enabled} = useNodeState();
  // A card (Row directly inside a Column) stretches to the column height when
  // the Row owning that Column has equalHeightCards on. Every wrapper between
  // the Column (flex column) and RowMain must grow for the height to reach it.
  const { actions: editorActions, stretch } = useEditor((state) => {
    const column = id ? state.nodes[state.nodes[id]?.data.parent ?? ""] : undefined;
    if (column?.data.displayName !== "Column") return { stretch: false };
    const owner = column.data.parent ? state.nodes[column.data.parent] : undefined;
    return { stretch: !!owner?.data.props.equalHeightCards };
  });

  // Get the list of Columns so the Resizer can be placed between them
  const childNodes = useMemo(() => {
    if (!id) return [];
    return query.node(id).descendants()
      .filter(nodeId => {
        const node = query.node(nodeId).get();
        return node?.data?.displayName === "Column";
      });
  }, [id, query]);

  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    backgroundColor: getValueByViewMode(viewMode, props.backgroundColor, props.mobileBackgroundColor),
    backgroundImage: getValueByViewMode(viewMode, props.backgroundImage, props.mobileBackgroundImage),
    boxShadow: getValueByViewMode(viewMode, props.boxShadow, props.mobileBoxShadow),
    border: getValueByViewMode(viewMode, props.border, props.mobileBorder),

    mobileBorder: props.mobileBorder,
    disableStacking: props.disableStacking,
    reverseColumns: props.reverseColumns,
    mobileMargin: props.mobileMargin,
    mobilePadding: props.mobilePadding,
    mobileBackgroundColor: props.mobileBackgroundColor,
    mobileBackgroundImage: props.mobileBackgroundImage,
    mobileBoxShadow: props.mobileBoxShadow,
    gap: getValueByViewMode(viewMode, props.gap, props.mobileGap),
    mobileGap: props.mobileGap,
    verticalAlign: props.verticalAlign,
  };


  return (
    <DelayedRender delay={resolvedProps.delay}>
      <RowDrag elementType="Row" stretch={stretch}>
        <ElementWrapper
          ref={ref}
          id={enabled ? UUIDWrapper : undefined}
          $enabled={enabled}
          $isHover={isHover}
          $isActive={isActive}
          $margin={resolvedProps.margin}
          $mobileMargin={resolvedProps.mobileMargin}
          $appearance={resolvedProps.appearance}
          $cssDefault={stretch ? "flex: 1; display: flex; flex-direction: column;" : undefined}
        >
          
          {/*
            Show RowBadge only when Row has no padding — otherwise the
            padding itself already provides a clickable Row-body strip
            and the badge would be redundant. We DON'T hide on hover
            (only on active) to avoid a flicker loop: hiding the badge
            on hover removes the very element the cursor is over, which
            toggles isHover and bounces the badge in/out.
          */}
          {enabled && !isActive && id && (() => {
            const p = resolvedProps.padding;
            const hasZeroPadding =
              !p ||
              ((p.paddingTop ?? 0) === 0 &&
                (p.paddingRight ?? 0) === 0 &&
                (p.paddingBottom ?? 0) === 0 &&
                (p.paddingLeft ?? 0) === 0);
            if (!hasZeroPadding) return null;
            return (
              <RowBadge
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  editorActions.selectNode(id);
                }}
                title="Select Row"
              >
                Row
              </RowBadge>
            );
          })()}

          {enabled && (isHover || isActive) && <Indicator name={"Row"} />}

          <ResizableContainer $stretch={stretch}>
            <RowMain
              $stretch={stretch}
              $viewMode={viewMode}
              id={props.htmlAttrId || elementId}
              $padding={resolvedProps.padding}
              $mobilePadding={resolvedProps.mobilePadding}
              $backgroundColor={resolvedProps.backgroundColor}
              $mobileBackgroundColor={resolvedProps.mobileBackgroundColor}
              $backgroundImage={resolvedProps.backgroundImage}
              $mobileBackgroundImage={resolvedProps.mobileBackgroundImage}
              $boxShadow={resolvedProps.boxShadow}
              $mobileBoxShadow={resolvedProps.mobileBoxShadow}
              $border={resolvedProps.border}
              $mobileBorder={resolvedProps.mobileBorder}
              $disableStacking={resolvedProps.disableStacking}
              $reverseColumns={resolvedProps.reverseColumns}
              $gap={resolvedProps.gap}
              $mobileGap={resolvedProps.mobileGap}
              $verticalAlign={resolvedProps.verticalAlign}
            >
              {children}
            </RowMain>
            
            {/* Render Resizer outside RowMain so it can be positioned precisely */}
            {enabled && (isHover || isActive) && viewMode === "desktop" && childNodes.map((_, index) => {
              if (index < childNodes.length - 1) {
                return (
                  <Resizer 
                    key={`resizer-${index}`}
                    index={index}
                    parentId={id}
                  />
                );
              }
              return null;
            })}
          </ResizableContainer>
        </ElementWrapper>
      </RowDrag>
    </DelayedRender>
  );
};

Row.craft = {
  props: { ...DEFAULT_STYLES.row },
  related: { settings: RowSettings },
  displayName: "Row",
};
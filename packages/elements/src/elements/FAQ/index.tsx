import React, { useState } from "react";
import { UserComponent, useNode } from "@craftjs/core";
import styled, { css } from "styled-components";
import { FAQProps, FAQItemProps, PaddingProps } from "../ElementProps";
import { FAQAnswerEditor } from "./FAQAnswerEditor";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { FAQSettings } from "./FAQSettings";
import { getValueByViewMode, getAppearanceByViewMode, getBoxShadowValue } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { Indicator } from "../../editor/common/Indicator";

// Styled components (remove answer-related styling)
const FAQContainer = styled.div<{
  $padding?: FAQProps["padding"];
  $mobilePadding?: FAQProps["mobilePadding"];
}>`
  ${({ $padding }) => css`
    ${$padding &&
    `padding: ${$padding.paddingTop}px ${$padding.paddingRight}px ${$padding.paddingBottom}px ${$padding.paddingLeft}px;`}
  `}

  @media (max-width: 800px) {
    ${({ $mobilePadding }) => css`
      ${$mobilePadding &&
      `padding: ${$mobilePadding.paddingTop}px ${$mobilePadding.paddingRight}px ${$mobilePadding.paddingBottom}px ${$mobilePadding.paddingLeft}px;`}
    `}
  }
`;

const FAQItem = styled.div<{
  $spaceBetweenItems?: number;
  $borderRadius?: number;
  $boxShadow?: string;
  $mobileBoxShadow?: string;
  $itemBorder?: FAQProps["itemBorder"];
  $mobileItemBorder?: FAQProps["mobileItemBorder"];
}>`
  margin-bottom: ${({ $spaceBetweenItems }) => $spaceBetweenItems ?? 16}px;
  border-radius: ${({ $borderRadius }) => $borderRadius ?? 15}px;
  overflow: hidden;
  ${({ $boxShadow }) => $boxShadow && `box-shadow: ${getBoxShadowValue($boxShadow)};`}

  ${({ $itemBorder }) => $itemBorder && css`
    ${$itemBorder.style && `border-style: ${$itemBorder.style};`}
    ${$itemBorder.color && `border-color: ${$itemBorder.color};`}
    ${$itemBorder.radius !== undefined && `border-radius: ${$itemBorder.radius}px;`}

    ${$itemBorder.type === "fullBorder"   && $itemBorder.width !== undefined && `border-width: ${$itemBorder.width}px;`}
    ${$itemBorder.type === "bottomOnly"   && $itemBorder.width !== undefined && `border-width: 0px 0px ${$itemBorder.width}px;`}
    ${$itemBorder.type === "topOnly"      && $itemBorder.width !== undefined && `border-width: ${$itemBorder.width}px 0px 0px;`}
    ${$itemBorder.type === "topAndBottom" && $itemBorder.width !== undefined && `border-width: ${$itemBorder.width}px 0px;`}
  `}

  &:last-child {
    margin-bottom: 0;
  }

  @media (max-width: 800px) {
    ${({ $mobileBoxShadow }) => $mobileBoxShadow && `box-shadow: ${getBoxShadowValue($mobileBoxShadow)};`}

    ${({ $mobileItemBorder }) => $mobileItemBorder && css`
      ${$mobileItemBorder.style && `border-style: ${$mobileItemBorder.style};`}
      ${$mobileItemBorder.color && `border-color: ${$mobileItemBorder.color};`}
      ${$mobileItemBorder.radius !== undefined && `border-radius: ${$mobileItemBorder.radius}px;`}

      ${$mobileItemBorder.type === "fullBorder"   && $mobileItemBorder.width !== undefined && `border-width: ${$mobileItemBorder.width}px;`}
      ${$mobileItemBorder.type === "bottomOnly"   && $mobileItemBorder.width !== undefined && `border-width: 0px 0px ${$mobileItemBorder.width}px;`}
      ${$mobileItemBorder.type === "topOnly"      && $mobileItemBorder.width !== undefined && `border-width: ${$mobileItemBorder.width}px 0px 0px;`}
      ${$mobileItemBorder.type === "topAndBottom" && $mobileItemBorder.width !== undefined && `border-width: ${$mobileItemBorder.width}px 0px;`}
    `}
  }
`;

const FAQHeader = styled.div<{
  $questionBackgroundColor?: string;
  $mobileQuestionBackgroundColor?: string;
  $isOpen?: boolean;
  $itemPadding?: PaddingProps["padding"];
  $mobileItemPadding?: PaddingProps["mobilePadding"];
}>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ $itemPadding }) => $itemPadding ? 
    `${$itemPadding.paddingTop}px ${$itemPadding.paddingRight}px ${$itemPadding.paddingBottom}px ${$itemPadding.paddingLeft}px` : 
    '15px 20px'};
  cursor: pointer;
  background-color: ${({ $questionBackgroundColor }) => $questionBackgroundColor || '#f8f9fa'};
  transition: background-color 0.2s ease;

  @media (max-width: 800px) {
    background-color: ${({ $mobileQuestionBackgroundColor, $questionBackgroundColor }) => 
      $mobileQuestionBackgroundColor || $questionBackgroundColor || '#f8f9fa'};
    padding: ${({ $mobileItemPadding, $itemPadding }) => {
      const padding = $mobileItemPadding || $itemPadding;
      return padding ? 
        `${padding.paddingTop}px ${padding.paddingRight}px ${padding.paddingBottom}px ${padding.paddingLeft}px` : 
        '15px 20px';
    }};
  }
`;

const FAQQuestion = styled.h3<{
  $questionFontSize?: number;
  $mobileQuestionFontSize?: number;
  $questionColor?: string;
  $mobileQuestionColor?: string;
  $questionFontFamily?: string;
  $questionFontStyle?: string;
  $editable?: boolean;
}>`
  margin: 0;
  flex: 1;
  font-size: ${({ $questionFontSize }) => $questionFontSize || 24}px;
  color: ${({ $questionColor }) => $questionColor || '#000'};
  ${({ $editable }) => $editable && "cursor: text;"}

  /* Inline rich-text rendering */
  & p { margin: 0; display: inline; }
  & a { color: inherit; text-decoration: underline; }
  & strong { font-weight: 700; }
  & em { font-style: italic; }
  & u { text-decoration: underline; }

  ${({ $questionFontFamily }) => $questionFontFamily && `font-family: ${$questionFontFamily};`}
  ${({ $questionFontStyle }) => {
    if (!$questionFontStyle) return '';
    const styles = [];
    if ($questionFontStyle.includes('italic')) styles.push('font-style: italic;');
    const weight = $questionFontStyle.replace('italic', '').trim();
    if (weight) styles.push(`font-weight: ${weight};`);
    return styles.join(' ');
  }}
  
  @media (max-width: 800px) {
    font-size: ${({ $mobileQuestionFontSize, $questionFontSize }) => 
      $mobileQuestionFontSize || $questionFontSize || 20}px;
    color: ${({ $mobileQuestionColor, $questionColor }) => 
      $mobileQuestionColor || $questionColor || '#000'};
  }
`;

const FAQIcon = styled.i<{
  $iconColor?: string;
  $mobileIconColor?: string;
  $displayDropdownIcons?: boolean;
}>`
  font-size: 20px;
  margin-left: 15px;
  color: ${({ $iconColor }) => $iconColor || '#000000'};
  display: ${({ $displayDropdownIcons }) => $displayDropdownIcons ? 'block' : 'none'};
  transition: transform 0.2s ease;
  
  @media (max-width: 800px) {
    color: ${({ $mobileIconColor, $iconColor }) => 
      $mobileIconColor || $iconColor || '#000000'};
  }
`;

const FAQContent = styled.div<{
  $isOpen?: boolean;
  $itemPadding?: PaddingProps["padding"];
  $mobileItemPadding?: PaddingProps["mobilePadding"];
  $answerBackgroundColor?: string;
  $mobileAnswerBackgroundColor?: string;
}>`
  max-height: ${({ $isOpen }) => $isOpen ? '1000px' : '0'};
  overflow: hidden;
  padding: ${({ $isOpen, $itemPadding }) => 
    $isOpen ? 
      ($itemPadding ? `${$itemPadding.paddingTop}px ${$itemPadding.paddingRight}px ${$itemPadding.paddingBottom}px ${$itemPadding.paddingLeft}px` : '15px 20px') : 
      ($itemPadding ? `0 ${$itemPadding.paddingRight}px` : '0 20px')
  };
  background-color: ${({ $answerBackgroundColor }) => $answerBackgroundColor || '#ffffff'};
  
  @media (max-width: 800px) {
    background-color: ${({ $mobileAnswerBackgroundColor, $answerBackgroundColor }) => 
    $mobileAnswerBackgroundColor || $answerBackgroundColor || '#ffffff'};

    padding: ${({ $isOpen, $mobileItemPadding, $itemPadding }) => {
      const padding = $mobileItemPadding || $itemPadding;
      return $isOpen ? 
        (padding ? `${padding.paddingTop}px ${padding.paddingRight}px ${padding.paddingBottom}px ${padding.paddingLeft}px` : '15px 20px') : 
        (padding ? `0 ${padding.paddingRight}px` : '0 20px');
    }};
  }
`;

const FAQAnswer = styled.div<{
  $fontSize?: number;
  $mobilefontSize?: number;
  $color?: string;
  $mobileColor?: string;
  $fontFamily?: string;
  $fontStyle?: string;
  $editable?: boolean;
}>`
  margin: 0;
  white-space: pre-wrap;
  ${({ $editable }) => $editable && "cursor: text;"}

  /* Inline rich-text rendering — TipTap output uses <p>, <strong>, <em>,
     <u>, <s>, <a>. Strip default <p> margin so visual matches plain-string
     mode where it was a single text node. */
  & p { margin: 0; }
  & p + p { margin-top: 0.5em; }
  & a { color: inherit; text-decoration: underline; }
  & strong { font-weight: 700; }
  & em { font-style: italic; }
  & u { text-decoration: underline; }
  ${({ $fontSize }) => $fontSize && `font-size: ${$fontSize}px;`}
  ${({ $color }) => $color && `color: ${$color};`}
  ${({ $fontFamily }) => $fontFamily && `font-family: ${$fontFamily};`}
  ${({ $fontStyle }) => $fontStyle?.includes("italic") && `font-style: italic;`}
  ${({ $fontStyle }) => $fontStyle && `font-weight: ${$fontStyle.replace("italic", "") || "400"};`}

  @media (max-width: 800px) {
    ${({ $mobilefontSize }) => $mobilefontSize && `font-size: ${$mobilefontSize}px;`}
    ${({ $mobileColor }) => $mobileColor && `color: ${$mobileColor};`}
  }
`;

export const FAQ: UserComponent<FAQProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("faq", "htmlAttrId");
  const { isActive, isHover, enabled } = useNodeState();
  const { actions: { setProp } } = useNode();

  // Local user toggles in the canvas. Default = `enabled || item.isOpen`
  // (editor opens everything for easy editing; runtime respects per-item
  // setting). When user clicks the header, we record the override here.
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});
  // Which item field is currently being inline-edited (editor mode only).
  const [editing, setEditing] = useState<{ id: string; kind: "question" | "answer" } | null>(null);

  const isItemOpen = (item: FAQItemProps) => {
    if (openOverrides[item.id] !== undefined) return openOverrides[item.id];
    return enabled || !!item.isOpen;
  };

  // Treat `<p></p>` / whitespace-only HTML as empty so we can show a
  // placeholder click target — otherwise the rendered <h3> / <div>
  // collapses to 0 height and becomes unclickable.
  const isEmptyHtml = (html: string | undefined) =>
    !html || html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim() === "";

  // questionFontStyle/answerFontStyle are stored as e.g. "bold", "italic",
  // "bold italic", "400", "700 italic". Same parsing as the styled component.
  const parseFontStyle = (s?: string): { fontStyle?: string; fontWeight?: string } => {
    if (!s) return {};
    const out: { fontStyle?: string; fontWeight?: string } = {};
    if (s.includes("italic")) out.fontStyle = "italic";
    const weight = s.replace("italic", "").trim();
    if (weight) out.fontWeight = weight;
    return out;
  };

  const updateItemField = (itemId: string, field: "questionHtml" | "answerHtml", html: string) => {
    setProp((p: FAQProps) => {
      const idx = p.items.findIndex((it) => it.id === itemId);
      if (idx >= 0) {
        p.items[idx] = { ...p.items[idx], [field]: html };
      }
    });
  };

  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    boxShadow: getValueByViewMode(viewMode, props.boxShadow, props.mobileBoxShadow),

    // Item padding
    itemPadding: getValueByViewMode(viewMode, props.itemPadding, props.mobileItemPadding),
    mobileItemPadding: props.mobileItemPadding,

    // Item border (per FAQ card)
    itemBorder: getValueByViewMode(viewMode, props.itemBorder, props.mobileItemBorder),
    mobileItemBorder: props.mobileItemBorder,
    
    // Question props
    questionColor: getValueByViewMode(viewMode, props.questionColor, props.mobileQuestionColor),
    questionFontSize: getValueByViewMode(viewMode, props.questionFontSize, props.mobileQuestionFontSize),
    questionBackgroundColor: getValueByViewMode(viewMode, props.questionBackgroundColor, props.mobileQuestionBackgroundColor),
    answerBackgroundColor: getValueByViewMode(viewMode, props.answerBackgroundColor, props.mobileAnswerBackgroundColor),

    // Answer props
    answerFontSize: getValueByViewMode(viewMode, props.answerFontSize, props.mobileAnswerFontSize),
    mobileAnswerFontSize: props.mobileAnswerFontSize,
    answerColor: getValueByViewMode(viewMode, props.answerColor, props.mobileAnswerColor),
    mobileAnswerColor: props.mobileAnswerColor,
    answerFontFamily: props.answerFontFamily,
    answerFontStyle: props.answerFontStyle,

    // Icon props
    iconColor: getValueByViewMode(viewMode, props.iconColor, props.mobileIconColor),

    // Non-responsive props
    items: props.items || [],
    spaceBetweenItems: props.spaceBetweenItems,
    borderRadius: props.borderRadius,
    displayDropdownIcons: props.displayDropdownIcons,
    iconOpenState: props.iconOpenState,
    iconClosedState: props.iconClosedState,
    questionFontFamily: props.questionFontFamily,
    questionFontStyle: props.questionFontStyle,
    mobileQuestionBackgroundColor: props.mobileQuestionBackgroundColor,
    mobileAnswerBackgroundColor: props.mobileAnswerBackgroundColor,
    // Mobile props for wrapper
    mobileMargin: props.mobileMargin,
    mobilePadding: props.mobilePadding,
    mobileBoxShadow: props.mobileBoxShadow,
  };

  const toggleItem = (item: FAQItemProps) => {
    const cur = isItemOpen(item);
    setOpenOverrides((prev) => ({ ...prev, [item.id]: !cur }));
  };

  const getIconClass = (item: FAQItemProps) => {
    return isItemOpen(item)
      ? (resolvedProps.iconOpenState || 'fas fa-chevron-up')
      : (resolvedProps.iconClosedState || 'fas fa-angle-down');
  };
  
  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="FAQ">
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
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"FAQ"} /> : null}
          <FAQContainer
            id={props.htmlAttrId || elementId}
            $padding={resolvedProps.padding}
            $mobilePadding={resolvedProps.mobilePadding}
          >
            {resolvedProps.items.map((item) => {
              const open = isItemOpen(item);
              return (
                <FAQItem
                  key={item.id}
                  $spaceBetweenItems={resolvedProps.spaceBetweenItems}
                  $borderRadius={resolvedProps.borderRadius}
                  $boxShadow={resolvedProps.boxShadow}
                  $mobileBoxShadow={resolvedProps.mobileBoxShadow}
                  $itemBorder={resolvedProps.itemBorder}
                  $mobileItemBorder={resolvedProps.mobileItemBorder}
                >
                  <FAQHeader
                    onClick={() => toggleItem(item)}
                    $questionBackgroundColor={resolvedProps.questionBackgroundColor}
                    $mobileQuestionBackgroundColor={resolvedProps.questionBackgroundColor}
                    $isOpen={open}
                    $itemPadding={resolvedProps.itemPadding}
                    $mobileItemPadding={resolvedProps.mobileItemPadding}
                  >
                    {enabled && editing?.id === item.id && editing.kind === "question" ? (
                      <div style={{ flex: 1 }} onClick={(e) => e.stopPropagation()}>
                        <FAQAnswerEditor
                          initialHtml={item.questionHtml || "<p></p>"}
                          onUpdate={(html) => updateItemField(item.id, "questionHtml", html)}
                          onBlur={() => setEditing(null)}
                          style={{
                            fontSize: resolvedProps.questionFontSize
                              ? `${resolvedProps.questionFontSize}px`
                              : undefined,
                            color: resolvedProps.questionColor || undefined,
                            fontFamily: resolvedProps.questionFontFamily || undefined,
                            ...parseFontStyle(resolvedProps.questionFontStyle),
                            margin: 0,
                          }}
                        />
                      </div>
                    ) : (
                      <FAQQuestion
                        $questionFontSize={resolvedProps.questionFontSize}
                        $mobileQuestionFontSize={resolvedProps.questionFontSize}
                        $questionColor={resolvedProps.questionColor}
                        $mobileQuestionColor={resolvedProps.questionColor}
                        $questionFontFamily={resolvedProps.questionFontFamily}
                        $questionFontStyle={resolvedProps.questionFontStyle}
                        $editable={enabled}
                        onClick={(e) => {
                          if (!enabled) return;
                          e.stopPropagation();
                          setEditing({ id: item.id, kind: "question" });
                        }}
                      >
                        {isEmptyHtml(item.questionHtml) && enabled ? (
                          <span style={{ opacity: 0.4, fontStyle: "italic" }}>
                            Click to edit question…
                          </span>
                        ) : (
                          <span dangerouslySetInnerHTML={{ __html: item.questionHtml || "" }} />
                        )}
                      </FAQQuestion>
                    )}
                    <FAQIcon
                      className={getIconClass(item)}
                      $iconColor={resolvedProps.iconColor}
                      $mobileIconColor={resolvedProps.iconColor}
                      $displayDropdownIcons={resolvedProps.displayDropdownIcons}
                    />
                  </FAQHeader>
                  <FAQContent
                    $isOpen={open}
                    $itemPadding={resolvedProps.itemPadding}
                    $mobileItemPadding={resolvedProps.mobileItemPadding}
                    $answerBackgroundColor={resolvedProps.answerBackgroundColor}
                    $mobileAnswerBackgroundColor={resolvedProps.answerBackgroundColor}
                  >
                    {enabled && editing?.id === item.id && editing.kind === "answer" ? (
                      <FAQAnswerEditor
                        initialHtml={item.answerHtml || "<p></p>"}
                        onUpdate={(html) => updateItemField(item.id, "answerHtml", html)}
                        onBlur={() => setEditing(null)}
                        style={{
                          fontSize: resolvedProps.answerFontSize
                            ? `${resolvedProps.answerFontSize}px`
                            : undefined,
                          color: resolvedProps.answerColor || undefined,
                          fontFamily: resolvedProps.answerFontFamily || undefined,
                          ...parseFontStyle(resolvedProps.answerFontStyle),
                        }}
                      />
                    ) : (
                      <FAQAnswer
                        $fontSize={resolvedProps.answerFontSize}
                        $mobilefontSize={resolvedProps.mobileAnswerFontSize}
                        $color={resolvedProps.answerColor}
                        $mobileColor={resolvedProps.mobileAnswerColor}
                        $fontFamily={resolvedProps.answerFontFamily}
                        $fontStyle={resolvedProps.answerFontStyle}
                        $editable={enabled}
                        onClick={(e) => {
                          if (!enabled) return;
                          e.stopPropagation();
                          setOpenOverrides((prev) => ({ ...prev, [item.id]: true }));
                          setEditing({ id: item.id, kind: "answer" });
                        }}
                      >
                        {isEmptyHtml(item.answerHtml) && enabled ? (
                          <span style={{ opacity: 0.4, fontStyle: "italic" }}>
                            Click to edit answer…
                          </span>
                        ) : (
                          <span dangerouslySetInnerHTML={{ __html: item.answerHtml || "" }} />
                        )}
                      </FAQAnswer>
                    )}
                  </FAQContent>
                </FAQItem>
              );
            })}
          </FAQContainer>
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

FAQ.craft = {
  props: { ...DEFAULT_STYLES.faq },
  related: { settings: FAQSettings },
  displayName: "FAQ",
};
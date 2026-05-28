import { UserComponent } from "@craftjs/core";
import { Indicator } from "../../editor/common/Indicator";
import { FieldProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { FieldSettings } from "./FieldSettings";
import { getValueByViewMode, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { usePageRender } from "../../contexts/PageRenderContext";
import FieldContent from "./FieldContent";

export const Field: UserComponent<FieldProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("field", "htmlAttrId");
  const pageRenderContext = usePageRender();
  const { isActive, isHover, enabled } = useNodeState();

  // Optimized: build a leaner resolved props object
  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    backgroundColor: getValueByViewMode(viewMode, props.backgroundColor, props.mobileBackgroundColor),
    color: getValueByViewMode(viewMode, props.color, props.mobileColor),
    textAlign: getValueByViewMode(viewMode, props.textAlign, props.mobileTextAlign),
    fontSize: getValueByViewMode(viewMode, props.fontSize, props.mobileFontSize),
    lineHeight: getValueByViewMode(viewMode, props.lineHeight, props.mobileLineHeight),
    letterSpacing: getValueByViewMode(viewMode, props.letterSpacing, props.mobileLetterSpacing),
    border: getValueByViewMode(viewMode, props.border, props.mobileBorder),

    // Keep original props for mobile fallback
    mobileBorder: props.mobileBorder,
    mobileMargin: props.mobileMargin,
    mobilePadding: props.mobilePadding,
    mobileBackgroundColor: props.mobileBackgroundColor,
    mobileColor: props.mobileColor,
    mobileTextAlign: props.mobileTextAlign,
    mobileFontSize: props.mobileFontSize,
    mobileLineHeight: props.mobileLineHeight,
    mobileLetterSpacing: props.mobileLetterSpacing,
    
    inputDetail: props.inputDetail,
  };

  // ✅ Optimized: Extract input details
  const inputType = resolvedProps.inputDetail?.type || "text";
  const placeholder = resolvedProps.inputDetail?.placeholder || "";
  const placeholderColor = resolvedProps.inputDetail?.placeholderColor || "rgba(170, 170, 170, 1)";
  const isOptional = resolvedProps.inputDetail?.isOptional || false;
  const actualFieldId = props.htmlAttrId || elementId;

  // ✅ Optimized: Simplified props for FieldContent
  const fieldContentProps = {
    inputType,
    placeholder,
    placeholderColor,
    isOptional,
    enabled,
    elementId,
    htmlAttrId: props.htmlAttrId,
    resolvedProps,
    error: pageRenderContext?.errors?.[actualFieldId],
    hasError: !!pageRenderContext?.errors?.[actualFieldId]
  };

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="Field">
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
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"Field"} /> : null}
          
          {/* Optimized: clean component with leaner props */}
          <FieldContent {...fieldContentProps} />
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

Field.craft = {
  props: { ...DEFAULT_STYLES.field },
  related: { settings: FieldSettings },
  displayName: "Field",
};
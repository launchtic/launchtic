import { UserComponent } from "@craftjs/core";
import styled, { css } from "styled-components";
import { SectionSettings } from "./SectionSettings";
import { useAppContext } from "../../contexts/AppContext";
import { SectionProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { getValueByViewMode, getBoxShadowValue, getAppearanceByViewMode, getBackgroundImageCss } from "../../utils/helpers"; // Used to read values by viewMode
import { DelayedRender } from "../common/DelayedRender"; 
import { useDraggableElement } from "../common/useDraggableElement"; 
import { useNodeState } from "../../editor/hooks/useNodeState"; // Read node state
import { ElementWrapper } from "../common/ElementWrapper"; // Use ElementWrapper
import { SectionDrag } from "./SectionDrag"; // Use SectionDrag wrapper
import { Indicator } from "../../editor/common/Indicator";


const SectionMain = styled.section<{
  $padding?: SectionProps["padding"];
  $mobilePadding?: SectionProps["mobilePadding"];
  $backgroundColor?: string;
  $mobileBackgroundColor?: string;
  $backgroundImage?: SectionProps["backgroundImage"];
  $mobileBackgroundImage?: SectionProps["mobileBackgroundImage"];
  $boxShadow?: string;
  $mobileBoxShadow?: string;
}>`
  display: flex;
  position: relative;

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

const SectionContainer = styled.div<{
  $contentWidth?: string;
  $innerBackground?: string;
  $mobileInnerBackground?: string;
}>`
  width: 100%;
  max-width: ${({ $contentWidth }) => $contentWidth};
  margin: auto;

  ${({ $innerBackground }) => $innerBackground && `background-color: ${$innerBackground};`}

  @media (max-width: 800px) {
    ${({ $mobileInnerBackground }) => $mobileInnerBackground && `background-color: ${$mobileInnerBackground};`}
  }
`;

export const Section: UserComponent<SectionProps> = ({ children, ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("section", "htmlAttrId");
  const { isActive, isHover, enabled} = useNodeState(); // Use hook to read node state

  // Resolve props inline rather than via getResolvedProps
  const resolvedProps = {
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    backgroundColor: getValueByViewMode(viewMode, props.backgroundColor, props.mobileBackgroundColor),
    backgroundImage: getValueByViewMode(viewMode, props.backgroundImage, props.mobileBackgroundImage),
    boxShadow: getValueByViewMode(viewMode, props.boxShadow, props.mobileBoxShadow),
    innerBackground: getValueByViewMode(viewMode, props.innerBackground, props.mobileInnerBackground),
    contentWidth: props.contentWidth,

    mobileMargin: props.mobileMargin,
    mobilePadding: props.mobilePadding,
    mobileBackgroundColor: props.mobileBackgroundColor,
    mobileBackgroundImage: props.mobileBackgroundImage,
    mobileBoxShadow: props.mobileBoxShadow,
    mobileInnerBackground: props.mobileInnerBackground,
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
  };

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <SectionDrag elementType="Section">
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
          {enabled && (isHover || isActive) && <Indicator name={"Section"} />}
          <SectionMain
            id={props.htmlAttrId || elementId}
            $padding={resolvedProps.padding}
            $mobilePadding={resolvedProps.mobilePadding}
            $backgroundColor={resolvedProps.backgroundColor}
            $mobileBackgroundColor={resolvedProps.mobileBackgroundColor}
            $backgroundImage={resolvedProps.backgroundImage}
            $mobileBackgroundImage={resolvedProps.mobileBackgroundImage}
            $boxShadow={resolvedProps.boxShadow}
            $mobileBoxShadow={resolvedProps.mobileBoxShadow}
          >
            <SectionContainer
              $contentWidth={resolvedProps.contentWidth}
              $innerBackground={resolvedProps.innerBackground}
              $mobileInnerBackground={resolvedProps.mobileInnerBackground}
            >
              {children}
            </SectionContainer>
          </SectionMain>
        </ElementWrapper>
      </SectionDrag>
    </DelayedRender>
  );
};

// Craft.js configuration
Section.craft = {
  props: { ...DEFAULT_STYLES.section },
  related: { settings: SectionSettings },
  rules: { canMoveIn: (nodes) => nodes.every((node) => node.data.name !== "Section") },
  isCanvas: true,
  displayName: "Section",
};

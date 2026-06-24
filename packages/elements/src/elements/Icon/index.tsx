import { UserComponent } from "@launchtic/editor-core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { IconElementProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { IconSettings } from "./IconSettings";
import { getValueByViewMode, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";


const IconMain = styled.div<{
  $padding?: IconElementProps["padding"];
  $mobilePadding?: IconElementProps["mobilePadding"];
  $alignSelf?: string;
  $mobileAlignSelf?: string;
}>`
  display: flex;

  ${({ $padding, $alignSelf }) => css`
    ${$padding && `padding: ${$padding.paddingTop}px ${$padding.paddingRight}px ${$padding.paddingBottom}px ${$padding.paddingLeft}px;`}
    ${$alignSelf && `align-self: ${$alignSelf};`}
  `}

  @media (max-width: 800px) {
    ${({ $mobilePadding, $mobileAlignSelf }) => css`
      ${$mobilePadding && `padding: ${$mobilePadding.paddingTop}px ${$mobilePadding.paddingRight}px ${$mobilePadding.paddingBottom}px ${$mobilePadding.paddingLeft}px;`}
      ${$mobileAlignSelf && `align-self: ${$mobileAlignSelf};`}
    `}
  }
`;

const StyledIcon = styled.i<{
  $size?: number;
  $mobileSize?: number;
  $color?: string;
  $mobileColor?: string;
  $hoverColor?: string;
}>`
  display: inline-block;
  line-height: 1;

  ${({ $size }) => $size !== undefined && `font-size: ${$size}px;`}
  ${({ $color }) => $color && `color: ${$color};`}

  ${({ $hoverColor }) => $hoverColor && css`
    transition: color 0.2s;
    &:hover { color: ${$hoverColor}; }
  `}

  @media (max-width: 800px) {
    ${({ $mobileSize }) => $mobileSize !== undefined && `font-size: ${$mobileSize}px;`}
    ${({ $mobileColor }) => $mobileColor && `color: ${$mobileColor};`}
  }
`;

const LinkWrapper = styled.a`
  display: inline-block;
  text-decoration: none;
  cursor: pointer;
  color: inherit;
`;

export const Icon: UserComponent<IconElementProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("icon", "htmlAttrId");
  const { isActive, isHover, enabled } = useNodeState();

  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    alignSelf: getValueByViewMode(viewMode, props.alignSelf, props.mobileAlignSelf),
    color: getValueByViewMode(viewMode, props.color, props.mobileColor),

    mobileMargin: props.mobileMargin,
    mobilePadding: props.mobilePadding,
    mobileAlignSelf: props.mobileAlignSelf,
    mobileColor: props.mobileColor,

    iconClass: props.iconClass,
    size: props.size,
    mobileSize: props.mobileSize,
    hoverColor: props.hoverColor,
    action: props.action,
    link: props.link,
    openNewTab: props.openNewTab,
  };

  const renderIcon = () => {
    const iconNode = (
      <StyledIcon
        id={props.htmlAttrId || elementId}
        className={resolvedProps.iconClass}
        $size={resolvedProps.size}
        $mobileSize={resolvedProps.mobileSize}
        $color={resolvedProps.color}
        $mobileColor={resolvedProps.mobileColor}
        $hoverColor={resolvedProps.hoverColor}
        aria-hidden={resolvedProps.action !== "link"}
      />
    );

    if (resolvedProps.action === "link" && resolvedProps.link) {
      return (
        <LinkWrapper
          href={resolvedProps.link}
          target={resolvedProps.openNewTab ? "_blank" : "_self"}
          rel={resolvedProps.openNewTab ? "noopener noreferrer" : undefined}
        >
          {iconNode}
        </LinkWrapper>
      );
    }
    return iconNode;
  };

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="Icon">
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
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"Icon"} /> : null}
          <IconMain
            $padding={resolvedProps.padding}
            $mobilePadding={resolvedProps.mobilePadding}
            $alignSelf={resolvedProps.alignSelf}
            $mobileAlignSelf={resolvedProps.mobileAlignSelf}
          >
            {renderIcon()}
          </IconMain>
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

Icon.craft = {
  props: { ...DEFAULT_STYLES.icon },
  related: { settings: IconSettings },
  displayName: "Icon",
};

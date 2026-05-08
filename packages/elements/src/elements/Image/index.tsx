import { UserComponent } from "@craftjs/core";
import styled, { css } from "styled-components";
import { Indicator } from "../../editor/common/Indicator";
import { ImageProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { ImageSettings } from "./ImageSettings";
import { getValueByViewMode, getBoxShadowValue, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement"; 
import { getImagePath } from "../../utils/helpers"; // Import helper



const ImageMain = styled.div<{
  $padding?: ImageProps["padding"];
  $mobilePadding?: ImageProps["mobilePadding"];
  $alignSelf?: string;
  $mobileAlignSelf?: string;
}>`
 

  ${({ $padding, $alignSelf}) => css`
    ${$padding && `padding: ${$padding.paddingTop}px ${$padding.paddingRight}px ${$padding.paddingBottom}px ${$padding.paddingLeft}px;`}
    ${$alignSelf && `align-self: ${$alignSelf};`}
  `}


  @media (max-width: 800px) {
    ${({ $mobilePadding, $mobileAlignSelf}) => css`
      ${$mobilePadding && `padding: ${$mobilePadding.paddingTop}px ${$mobilePadding.paddingRight}px ${$mobilePadding.paddingBottom}px ${$mobilePadding.paddingLeft}px;`}
      ${$mobileAlignSelf && `align-self: ${$mobileAlignSelf};`}
    `}
  }
`;

const PictureWrapper = styled.picture`
  position: relative;
  display: block;
`;

const StyledImage = styled.img<{
  $width?: number;
  $mobileWidth?: number;
  $boxShadow?: string;
  $mobileBoxShadow?: string;
  $border?: ImageProps["border"];
  $mobileBorder?: ImageProps["mobileBorder"];
}>`
  display: block;
  max-width: 100%;
  object-fit: contain;
  height: 100%;

  ${({ $border, $boxShadow }) => css`
    ${$border?.style && `border-style: ${$border.style};`}
    ${$border?.color && `border-color: ${$border.color};`}
    ${$border?.radius !== undefined && `border-radius: ${$border.radius}px;`}

    ${$border?.type === "fullBorder" && $border?.width !== undefined && `border-width: ${$border.width}px;`}
    ${$border?.type === "bottomOnly" && $border?.width !== undefined && `border-width: 0px 0px ${$border.width}px;`}
    ${$border?.type === "topOnly" && $border?.width !== undefined && `border-width: ${$border.width}px 0px 0px;`}
    ${$border?.type === "topAndBottom" && $border?.width !== undefined && `border-width: ${$border.width}px 0px;`}

    ${$boxShadow && `box-shadow: ${getBoxShadowValue($boxShadow)};`}
  `}

  ${({ $width }) => $width !== undefined ? `width: ${$width}px;` : `width: 100%;`}

  @media (max-width: 800px) {
    ${({ $mobileBorder, $mobileBoxShadow }) => css`
      ${$mobileBorder?.style && `border-style: ${$mobileBorder.style};`}
      ${$mobileBorder?.color && `border-color: ${$mobileBorder.color};`}
      ${$mobileBorder?.radius !== undefined && `border-radius: ${$mobileBorder.radius}px;`}

      ${$mobileBorder?.type === "fullBorder" && $mobileBorder?.width !== undefined && `border-width: ${$mobileBorder.width}px;`}
      ${$mobileBorder?.type === "bottomOnly" && $mobileBorder?.width !== undefined && `border-width: 0px 0px ${$mobileBorder.width}px;`}
      ${$mobileBorder?.type === "topOnly" && $mobileBorder?.width !== undefined && `border-width: ${$mobileBorder.width}px 0px 0px;`}
      ${$mobileBorder?.type === "topAndBottom" && $mobileBorder?.width !== undefined && `border-width: ${$mobileBorder.width}px 0px;`}

      ${$mobileBoxShadow && `box-shadow: ${getBoxShadowValue($mobileBoxShadow)};`}
    `}

    /* mobileWidth override:
       - undefined → no override, mobile inherits desktop $width
       - 0         → sentinel meaning "explicit fill 100% on mobile"
                     (used when desktop is fixed but designer wants mobile
                     edge-to-edge — common landing page pattern)
       - >0        → fixed pixel width on mobile */
    ${({ $mobileWidth }) =>
      $mobileWidth === 0
        ? `width: 100%;`
        : $mobileWidth !== undefined
          ? `width: ${$mobileWidth}px;`
          : ""}
  }
`;

const LinkWrapper = styled.a`
  display: inline-block;
  text-decoration: none;
  cursor: pointer;
`;

export const Image: UserComponent<ImageProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("image", "htmlAttrId");
 
  // Resolve effective width per viewMode so editor mobile-preview reflects
  // the right value (CSS @media doesn't fire when only the wrapper is
  // resized — browser viewport stays desktop).
  // Sentinel: mobileWidth === 0 → "explicit fill 100% mobile" → render as
  // undefined so the styled component falls back to width: 100%.
  const rawDetail = props.imageDetail || {};
  const resolvedWidth: number | undefined = (() => {
    if (viewMode === "mobile") {
      if (rawDetail.mobileWidth === 0) return undefined;            // fill
      if (rawDetail.mobileWidth !== undefined) return rawDetail.mobileWidth;
      return rawDetail.width;                                       // inherit
    }
    return rawDetail.width;
  })();

  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    padding: getValueByViewMode(viewMode, props.padding, props.mobilePadding),
    alignSelf: getValueByViewMode(viewMode, props.alignSelf, props.mobileAlignSelf),
    boxShadow: getValueByViewMode(viewMode, props.boxShadow, props.mobileBoxShadow),
    border: getValueByViewMode(viewMode, props.border, props.mobileBorder),

    mobileBorder: props.mobileBorder,
    mobileMargin: props.mobileMargin,
    mobilePadding: props.mobilePadding,
    mobileAlignSelf: props.mobileAlignSelf,
    mobileBoxShadow: props.mobileBoxShadow,

    // Image specific properties
    imageDetail: rawDetail,
    resolvedWidth,
  };

  const { isActive, isHover, enabled } = useNodeState();

  // Early return with empty div if no image URL and editor is not enabled
  if (!resolvedProps.imageDetail.url && !enabled) {
    return <div />;
  }

  // Function to render the image with or without a link wrapper
  const renderImage = () => {
    // Determine the image source
    const imageSrc = enabled && !resolvedProps.imageDetail.url 
    ? getImagePath("image_placeholder.png") 
    : resolvedProps.imageDetail.url || "";
      
    const imageElement = (
      <StyledImage
        id={props.htmlAttrId || elementId}
        src={imageSrc}
        alt={resolvedProps.imageDetail.alt || ""}
        /* viewMode-resolved width — drives editor preview */
        $width={resolvedProps.resolvedWidth}
        /* raw mobileWidth — kept for CSS @media (max-width: 800px) so the
           rendered page on a real mobile device still switches correctly */
        $mobileWidth={resolvedProps.imageDetail.mobileWidth}
        $boxShadow={resolvedProps.boxShadow}
        $mobileBoxShadow={resolvedProps.mobileBoxShadow}
        $border={resolvedProps.border}
        $mobileBorder={resolvedProps.mobileBorder}
      />
    );

    // Wrap with link if action is "link" and we have a link URL
    if (resolvedProps.imageDetail.action === "link" && resolvedProps.imageDetail.link) {
      return (
        <LinkWrapper 
          href={resolvedProps.imageDetail.link}
          target={resolvedProps.imageDetail.openNewTab ? "_blank" : "_self"}
          rel={resolvedProps.imageDetail.openNewTab ? "noopener noreferrer" : undefined}
        >
          {imageElement}
        </LinkWrapper>
      );
    }

    // Handle popup action if needed
    if (resolvedProps.imageDetail.action === "popup") {
      // You can implement the popup trigger here
      // For now, just add a data attribute that can be used by a popup script
      return (
        <div 
          style={{ cursor: "pointer" }}
          data-popup-image={resolvedProps.imageDetail.url}
          data-popup-trigger="true"
        >
          {imageElement}
        </div>
      );
    }

    // Default: just return the image
    return imageElement;
  };

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="Image">
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
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"Image"} /> : null}
          <ImageMain
            $padding={resolvedProps.padding}
            $mobilePadding={resolvedProps.mobilePadding}
            $alignSelf={resolvedProps.alignSelf}
            $mobileAlignSelf={resolvedProps.mobileAlignSelf}
          >
            <PictureWrapper>
              {renderImage()}
            </PictureWrapper>
          </ImageMain>
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

Image.craft = {
  props: { ...DEFAULT_STYLES.image },
  related: { settings: ImageSettings },
  displayName: "Image",
};
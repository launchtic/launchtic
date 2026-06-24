import { UserComponent } from "@launchtic/editor-core";
import styled, { css, keyframes } from "styled-components";
import ReactPlayer from "react-player";
import { Indicator } from "../../editor/common/Indicator";
import { VideoProps } from "../ElementProps";
import { DEFAULT_STYLES } from "../DefaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { VideoSettings } from "./VideoSettings";
import { getValueByViewMode, getBoxShadowValue, getAppearanceByViewMode } from "../../utils/helpers";
import { useNodeState } from "../../editor/hooks/useNodeState";
import { ElementWrapper } from "../common/ElementWrapper";
import { ElementDrag } from "../common/ElementDrag";
import { DelayedRender } from "../common/DelayedRender";
import { useDraggableElement } from "../common/useDraggableElement";
import { useState, useEffect} from 'react';
import { getImagePath } from "../../utils/helpers"; // Import helper


const VideoMain = styled.div<{
  $enabled?: boolean;
  $boxShadow?: string;
  $mobileBoxShadow?: string;
  $border?: VideoProps["border"];
  $mobileBorder?: VideoProps["mobileBorder"];
}>`
  position: relative;
  padding-top: 56.25%;
  
  ${({ $enabled }) => $enabled && `pointer-events: none;`}

  .react-player{
    position: absolute;
    top: 0;
    left: 0;
    overflow: hidden;
    ${({ $border }) => $border && css`
      ${$border.style && `border-style: ${$border.style};`}
      ${$border.color && `border-color: ${$border.color};`}
      ${$border.radius !== undefined && `border-radius: ${$border.radius}px;`}

      ${$border.type === "fullBorder" && $border.width && `border-width: ${$border.width}px;`}
      ${$border.type === "bottomOnly" && $border.width && `border-width: 0px 0px ${$border.width}px;`}
      ${$border.type === "topOnly" && $border.width && `border-width: ${$border.width}px 0px 0px;`}
      ${$border.type === "topAndBottom" && $border.width && `border-width: ${$border.width}px 0px;`}
    `}

     ${({ $boxShadow }) => $boxShadow && `box-shadow: ${getBoxShadowValue($boxShadow)};`}
  }

  @media (max-width: 800px) {
    .react-player{
      ${({ $mobileBorder }) => $mobileBorder && css`
        ${$mobileBorder.style && `border-style: ${$mobileBorder.style};`}
        ${$mobileBorder.color && `border-color: ${$mobileBorder.color};`}
        ${$mobileBorder.radius !== undefined && `border-radius: ${$mobileBorder.radius}px;`}

        ${$mobileBorder.type === "fullBorder" && $mobileBorder.width && `border-width: ${$mobileBorder.width}px;`}
        ${$mobileBorder.type === "bottomOnly" && $mobileBorder.width && `border-width: 0px 0px ${$mobileBorder.width}px;`}
        ${$mobileBorder.type === "topOnly" && $mobileBorder.width && `border-width: ${$mobileBorder.width}px 0px 0px;`}
        ${$mobileBorder.type === "topAndBottom" && $mobileBorder.width && `border-width: ${$mobileBorder.width}px 0px;`}
      `}
      
      ${({ $mobileBoxShadow }) => $mobileBoxShadow && `box-shadow: ${getBoxShadowValue($mobileBoxShadow)};`}
    }
  }
`;


// Define keyframes for the animation
const pulseAnimation = keyframes`
  0% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.1);
  }
`;

// Updated styled component for UnmuteButton
const UnmuteButton = styled.button`
  color: white;
  position: absolute;
  z-index: 2;
  cursor: pointer;
  height: 50px;
  width: 50px;
  top: 50px;
  left: 50px;
  border-width: initial;
  border-style: none;
  border-color: initial;
  border-image: initial;
  padding: 0px;
  font-size: 24px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${pulseAnimation} 0.6s ease-in-out 0s infinite alternate none running;
  
  &:hover {
    background: rgba(0, 0, 0, 0.8);
  }
`;

const VideoPlaceholder = styled.div<{ $placeholderImage: string }>`
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  background: url(${props => props.$placeholderImage}) center center no-repeat rgb(43, 43, 43, 0.5);
  text-align: center;
  box-shadow: rgba(255, 255, 255, 0.3) 0px 0px 0px 1px inset;
  width: 100%;
  height: 100%;
  border-radius: inherit;
`;


export const Video: UserComponent<VideoProps> = ({ ...props }) => {
  const { viewMode } = useAppContext();
  const { ref, elementId, UUIDWrapper } = useDraggableElement("video", "htmlAttrId");
  const placeholderImageUrl = getImagePath("video_placeholder.png");

  const resolvedProps = {
    delay: props.delay,
    appearance: getAppearanceByViewMode(viewMode, props.appearance),
    margin: getValueByViewMode(viewMode, props.margin, props.mobileMargin),
    boxShadow: getValueByViewMode(viewMode, props.boxShadow, props.mobileBoxShadow),
    border: getValueByViewMode(viewMode, props.border, props.mobileBorder),
    mobileBorder: props.mobileBorder,
    // Extras needed for mobile support
    mobileMargin: props.mobileMargin,
    mobileBoxShadow: props.mobileBoxShadow,
    
    // Video specific properties
    videoDetail: props.videoDetail || {},
  };

  const { isActive, isHover, enabled } = useNodeState();
 
  // State that tracks whether the video is muted
  const [isMuted, setIsMuted] = useState(true);

  // Reset muted state when autoPlay changes
  useEffect(() => {
    if (resolvedProps.videoDetail?.autoPlay) {
      setIsMuted(true);
    }
  }, [resolvedProps.videoDetail?.autoPlay]);

  // Handler for clicks on the unmute button
  const handleUnmute = () => {
    setIsMuted(false);
  };

   // Early return with empty div if no video URL and editor is not enabled
   if (!resolvedProps.videoDetail.url && !enabled) {
    return <div />;
  }

  return (
    <DelayedRender delay={resolvedProps.delay}>
      <ElementDrag elementType="Video">
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
          {(enabled && isActive) || (enabled && isHover) ? <Indicator name={"Video"} /> : null}
          <VideoMain
            id={props.htmlAttrId || elementId}
            $enabled={enabled}
            $boxShadow={resolvedProps.boxShadow}
            $mobileBoxShadow={resolvedProps.mobileBoxShadow}
            $border={resolvedProps.border}
            $mobileBorder={resolvedProps.mobileBorder}
          >
            {resolvedProps.videoDetail?.url ? (
              <>
                {!enabled && resolvedProps.videoDetail?.autoPlay && isMuted && (
                  <UnmuteButton onClick={handleUnmute}>
                    <i className="fas fa-volume-mute"></i>
                  </UnmuteButton>
                )}
                <ReactPlayer
                  className="react-player"
                  src={resolvedProps.videoDetail.url}
                  width="100%"
                  height="100%"
                  controls={resolvedProps.videoDetail?.controls}
                  playing={!enabled && resolvedProps.videoDetail?.autoPlay}
                  muted={isMuted && resolvedProps.videoDetail?.autoPlay}
                  playsInline
                />
              
              </>
            ) : (
              enabled ? (
                <VideoPlaceholder $placeholderImage={placeholderImageUrl} />
              ) : (
                <div />
              )
            )}
          </VideoMain>
        </ElementWrapper>
      </ElementDrag>
    </DelayedRender>
  );
};

Video.craft = {
  props: { ...DEFAULT_STYLES.video },
  related: { settings: VideoSettings },
  displayName: "Video",
};
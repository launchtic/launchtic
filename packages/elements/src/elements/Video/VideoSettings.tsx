import React from "react";
import { useNode } from "@launchtic/editor-core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";

import { VideoProps } from "../ElementProps";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings"; 
import { BoxShadowSettings } from "../../editor/toolbar/BoxShadowSettings";
import { BorderSettings } from "../../editor/toolbar/BorderSettings";
import { VideoDetailSettings } from "../../editor/toolbar/VideoDetailSettings";

import { DEFAULT_STYLES } from "../DefaultStyles";

export const VideoSettings: React.FC = () => {
  const {
    actions: { setProp },
    appearance,
    delay,
    margin,
    mobileMargin,
    boxShadow,
    mobileBoxShadow,
    border,
    mobileBorder,
    videoDetail,
  } = useNode<VideoProps>((node) => ({
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    boxShadow: node.data.props.boxShadow,
    mobileBoxShadow: node.data.props.mobileBoxShadow,
    border: node.data.props.border,
    mobileBorder: node.data.props.mobileBorder,
    videoDetail: node.data.props.videoDetail,
  }));

  const updateProp = <K extends keyof VideoProps>(key: K) => (value: VideoProps[K]) => {
    setProp((props: VideoProps) => {
      props[key] = value;
    });
  };

  return (
    <>
      {/* Video Detail Settings */}
      <VideoDetailSettings
        videoDetail={videoDetail}
        setVideoDetail={updateProp("videoDetail")}
      />

      {/* Box Shadow Settings */}
      <BoxShadowSettings
        boxShadow={{
          mobile: mobileBoxShadow ?? DEFAULT_STYLES.video.mobileBoxShadow,
          desktop: boxShadow ?? DEFAULT_STYLES.video.boxShadow,
        }}
        setBoxShadow={(value) => {
          updateProp("boxShadow")(value.desktop as VideoProps["boxShadow"]);
          updateProp("mobileBoxShadow")(value.mobile as VideoProps["mobileBoxShadow"]);
        }}
      />

      {/* Border Settings */}
      <BorderSettings
        border={border}
        mobileBorder={mobileBorder}
        setBorder={updateProp("border")}
        setMobileBorder={updateProp("mobileBorder")}
      />

      {/* Margin Settings */}
      <MarginSettings
        margin={margin}
        mobileMargin={mobileMargin}
        setMargin={updateProp("margin")}
        setMobileMargin={updateProp("mobileMargin")}
      />
      
      
      {/* Delay Settings */}
      <DelaySettings delay={delay} setDelay={updateProp("delay")} />

      {/* Appearance Settings */}
      <AppearanceSettings appearance={appearance} setAppearance={updateProp("appearance")} />

      {/* ID Attribute Settings */}
      <IDAttributeSettings/>
    </>
  );
};
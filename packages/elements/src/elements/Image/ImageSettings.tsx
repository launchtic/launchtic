import React from "react";
import { useNode } from "@craftjs/core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { AlignSelfSettings } from "../../editor/toolbar/AlignSelfSettings";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { ImageProps } from "../ElementProps";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings"; 
import { BoxShadowSettings } from "../../editor/toolbar/BoxShadowSettings";
import { BorderSettings } from "../../editor/toolbar/BorderSettings";
import { ImageDetailSettings } from "../../editor/toolbar/ImageDetailSettings";

import { DEFAULT_STYLES } from "../DefaultStyles";

export const ImageSettings: React.FC = () => {
  const {
    actions: { setProp },
    appearance,
    delay,
    margin,
    mobileMargin,
    alignSelf,
    mobileAlignSelf,
    padding,
    mobilePadding,
    boxShadow,
    mobileBoxShadow,
    border,
    mobileBorder,
    imageDetail,
  } = useNode<ImageProps>((node) => ({
    text: node.data.props.text,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    padding: node.data.props.padding,
    mobilePadding: node.data.props.mobilePadding,
    boxShadow: node.data.props.boxShadow,
    mobileBoxShadow: node.data.props.mobileBoxShadow,
    border: node.data.props.border,
    mobileBorder: node.data.props.mobileBorder,
    alignSelf: node.data.props.alignSelf,
    mobileAlignSelf: node.data.props.mobileAlignSelf,
    imageDetail: node.data.props.imageDetail,
  }));

  const updateProp = <K extends keyof ImageProps>(key: K) => (value: ImageProps[K]) => {
    setProp((props: ImageProps) => {
      props[key] = value;
    });
  };

  return (
    <>
     
      {/* Image Detail Settings */}
      <ImageDetailSettings
        imageDetail={imageDetail}
        setImageDetail={updateProp("imageDetail")}
      />

      {/* ✅ Box Shadow Settings */}
      <BoxShadowSettings
        boxShadow={{
          mobile: mobileBoxShadow ?? DEFAULT_STYLES.image.mobileBoxShadow,
          desktop: boxShadow ?? DEFAULT_STYLES.image.boxShadow,
        }}
        setBoxShadow={(value) => {
          updateProp("boxShadow")(value.desktop as ImageProps["boxShadow"]);
          updateProp("mobileBoxShadow")(value.mobile as ImageProps["mobileBoxShadow"]);
        }}
      />

      {/* ✅ Border Settings */}
      <BorderSettings
        border={border}
        mobileBorder={mobileBorder}
        setBorder={updateProp("border")}
        setMobileBorder={updateProp("mobileBorder")}
      />


      {/* Text Align Settings */}
      <AlignSelfSettings
        alignSelf={{ mobile: mobileAlignSelf, desktop: alignSelf }}
        setAlignSelf={(value) => {
          updateProp("alignSelf")(value.desktop);
          updateProp("mobileAlignSelf")(value.mobile);
        }}
      />


       {/* Margin Settings */}
       <MarginSettings
        margin={margin}
        mobileMargin={mobileMargin}
        setMargin={updateProp("margin")}
        setMobileMargin={updateProp("mobileMargin")}
      />
      {/* ✅ Padding Settings */}
      <PaddingSettings
        padding={padding}
        mobilePadding={mobilePadding}
        setPadding={updateProp("padding")}
        setMobilePadding={updateProp("mobilePadding")}
      />
      {/* Delay Settings */}
      <DelaySettings delay={delay} setDelay={updateProp("delay")} />

      {/* Appearance Settings */}
      <AppearanceSettings appearance={appearance} setAppearance={updateProp("appearance")} />

      <IDAttributeSettings/>
    </>
  );
};

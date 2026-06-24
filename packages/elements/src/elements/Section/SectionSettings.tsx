import React from "react";
import { useNode } from "@launchtic/editor-core";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { ContentWidthSettings } from "../../editor/toolbar/ContentWidthSettings";
import { InnerBackgroundSettings } from "../../editor/toolbar/InnerBackgroundSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { BackgroundImageSettings } from "../../editor/toolbar/BackgroundImageSettings";
import { BoxShadowSettings } from "../../editor/toolbar/BoxShadowSettings";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings"; 
import { DelaySettings } from "../../editor/toolbar/DelaySettings"; 
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings"; 
import { SectionProps } from "../ElementProps"; // Import the canonical type
import { useAppContext } from "../../contexts/AppContext";

export const SectionSettings: React.FC = () => {
  const { viewMode } = useAppContext(); // ✅ Get viewMode from context

  const {
    actions: { setProp },
    appearance,
    delay,
    padding,
    mobilePadding,
    margin,
    mobileMargin,
    backgroundColor,
    mobileBackgroundColor,
    backgroundImage,
    mobileBackgroundImage,
    innerBackground,
    mobileInnerBackground,
    contentWidth,
    boxShadow,
    mobileBoxShadow,
  } = useNode<SectionProps>((node) => ({
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    padding: node.data.props.padding,
    mobilePadding: node.data.props.mobilePadding,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    backgroundColor: node.data.props.backgroundColor,
    mobileBackgroundColor: node.data.props.mobileBackgroundColor,
    backgroundImage: node.data.props.backgroundImage,
    mobileBackgroundImage: node.data.props.mobileBackgroundImage,
    innerBackground: node.data.props.innerBackground,
    mobileInnerBackground: node.data.props.mobileInnerBackground,
    contentWidth: node.data.props.contentWidth,
    boxShadow: node.data.props.boxShadow,
    mobileBoxShadow: node.data.props.mobileBoxShadow,
  }));

  // Helper function to update a prop (typed via SectionProps)
  const updateProp = <K extends keyof SectionProps>(key: K) => (value: SectionProps[K]) => {
    setProp((props: SectionProps) => {
      props[key] = value;
    });
  };

  return (
    <>
      {/* ✅ Padding Settings */}
      <PaddingSettings
        padding={padding}
        mobilePadding={mobilePadding}
        setPadding={updateProp("padding")}
        setMobilePadding={updateProp("mobilePadding")}
      />

      {/* ✅ Margin Settings */}
      <MarginSettings
        margin={margin}
        mobileMargin={mobileMargin}
        setMargin={updateProp("margin")}
        setMobileMargin={updateProp("mobileMargin")}
      />

      {/* ✅ Background Color Settings */}
      <BackgroundColorSettings
        backgroundColor={{
          mobile: mobileBackgroundColor,
          desktop: backgroundColor,
        }}
        setBackgroundColor={(value) => {
          updateProp("backgroundColor")(value.desktop);
          updateProp("mobileBackgroundColor")(value.mobile);
        }}
      />

      {/* ✅ Inner Background Settings */}
      <InnerBackgroundSettings
        innerBackground={{
          mobile: mobileInnerBackground,
          desktop: innerBackground,
        }}
        setInnerBackground={(value) => {
          updateProp("innerBackground")(value.desktop);
          updateProp("mobileInnerBackground")(value.mobile);
        }}
      />

      {/* ✅ Background Image Settings */}
      <BackgroundImageSettings
        backgroundImage={{
          mobile: mobileBackgroundImage,
          desktop: backgroundImage,
        }}
        setBackgroundImage={(value) => {
          updateProp("backgroundImage")(value.desktop);
          updateProp("mobileBackgroundImage")(value.mobile);
        }}
      />

      {/* ✅ Content Width Settings (Hidden in Mobile Mode) */}
      {viewMode !== "mobile" && (
        <ContentWidthSettings
          contentWidth={contentWidth}
          setContentWidth={(value) => updateProp("contentWidth")(value as SectionProps["contentWidth"])}
        />
      )}

      {/* ✅ Box Shadow Settings */}
      <BoxShadowSettings
        boxShadow={{
          mobile: mobileBoxShadow,
          desktop: boxShadow,
        }}
        setBoxShadow={(value) => {
          updateProp("boxShadow")(value.desktop as SectionProps["boxShadow"]);
          updateProp("mobileBoxShadow")(value.mobile as SectionProps["mobileBoxShadow"]);
        }}
      />
      <DelaySettings
        delay={delay}
        setDelay={updateProp("delay")}
      />
      <AppearanceSettings
        appearance={appearance}
        setAppearance={updateProp("appearance")}
      />

      <IDAttributeSettings/>

    </>
  );
};

import React from "react";
import { useNode } from "@launchtic/editor-core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { TextColorSettings } from "../../editor/toolbar/TextColorSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { FontSizeSettings } from "../../editor/toolbar/FontSizeSettings";
import { TextAlignSettings } from "../../editor/toolbar/TextAlignSettings";
import { LineHeightSettings } from "../../editor/toolbar/LineHeightSettings";
import { FieldDetailSettings } from "../../editor/toolbar/FieldDetailSettings";
import { BorderSettings } from "../../editor/toolbar/BorderSettings";
import { FieldProps } from "../ElementProps";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings"; 

export const FieldSettings: React.FC = () => {
  const {
    actions: { setProp },
    appearance,
    delay,
    margin,
    mobileMargin,
    padding,
    mobilePadding,
    backgroundColor,
    mobileBackgroundColor,
    color,
    mobileColor,
    fontSize,
    mobileFontSize,
    textAlign,
    mobileTextAlign,
    lineHeight,
    mobileLineHeight,
    border,
    mobileBorder,
    inputDetail
  } = useNode<FieldProps>((node) => ({
    inputDetail: node.data.props.inputDetail,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    padding: node.data.props.padding,
    mobilePadding: node.data.props.mobilePadding,
    backgroundColor: node.data.props.backgroundColor,
    mobileBackgroundColor: node.data.props.mobileBackgroundColor,
    color: node.data.props.color,
    mobileColor: node.data.props.mobileColor,
    fontSize: node.data.props.fontSize,
    mobileFontSize: node.data.props.mobileFontSize,
    textAlign: node.data.props.textAlign,
    mobileTextAlign: node.data.props.mobileTextAlign,
    lineHeight: node.data.props.lineHeight,
    border: node.data.props.border,
    mobileBorder: node.data.props.mobileBorder,
    mobileLineHeight: node.data.props.mobileLineHeight
  }));

  const updateProp = <K extends keyof FieldProps>(key: K) => (value: FieldProps[K]) => {
    setProp((props: FieldProps) => {
      props[key] = value;
    });
  };

  return (
    <>

      {/* Input Detail Settings */}
      <FieldDetailSettings
        inputDetail={inputDetail}
        setInputDetail={updateProp("inputDetail")}
      />
      {/* Input Align Settings */}
      <TextAlignSettings
        textAlign={{ mobile: mobileTextAlign, desktop: textAlign }}
        setTextAlign={(value) => {
          updateProp("textAlign")(value.desktop);
          updateProp("mobileTextAlign")(value.mobile);
        }}
      />
      {/* Font Size Settings */}
      <FontSizeSettings
        fontSize={{ mobile: mobileFontSize, desktop: fontSize }}
        setFontSize={(value) => {
          updateProp("fontSize")(value.desktop);
          updateProp("mobileFontSize")(value.mobile);
        }}
      />
      {/* Line Height Settings */}
        <LineHeightSettings
        lineHeight={{ mobile: mobileLineHeight, desktop: lineHeight }}
        setLineHeight={(value) => {
          updateProp("lineHeight")(value.desktop);
          updateProp("mobileLineHeight")(value.mobile);
        }}
      />

        {/* Border Settings */}
      <BorderSettings
        border={border}
        mobileBorder={mobileBorder}
        setBorder={updateProp("border")}
        setMobileBorder={updateProp("mobileBorder")}
      />

      {/* Background Color Settings */}
       <BackgroundColorSettings
        backgroundColor={{ mobile: mobileBackgroundColor, desktop: backgroundColor }}
        setBackgroundColor={(value) => {
          updateProp("backgroundColor")(value.desktop);
          updateProp("mobileBackgroundColor")(value.mobile);
        }}
      />

      {/* Text Color Settings */}
      <TextColorSettings
        color={{ mobile: mobileColor, desktop: color }}
        setColor={(value) => {
          updateProp("color")(value.desktop);
          updateProp("mobileColor")(value.mobile);
        }}
      />

       {/* Margin Settings */}
       <MarginSettings
        margin={margin}
        mobileMargin={mobileMargin}
        setMargin={updateProp("margin")}
        setMobileMargin={updateProp("mobileMargin")}
      />

      {/* Padding Settings */}
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

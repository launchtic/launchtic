import React from "react";
import { useNode } from "@launchtic/editor-core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { FontSizeSettings } from "../../editor/toolbar/FontSizeSettings";
import { TextAlignSettings } from "../../editor/toolbar/TextAlignSettings";
import { LineHeightSettings } from "../../editor/toolbar/LineHeightSettings";
import { LetterSpacingSettings } from "../../editor/toolbar/LetterSpacingSettings";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { FontTypeSettings } from "../../editor/toolbar/FontTypeSettings"; // ✅ Import
import { TextProps } from "../ElementProps";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings"; 

export const TextSettings: React.FC = () => {
  const {
    actions: { setProp },
    appearance,
    delay,
    margin,
    mobileMargin,
    backgroundColor,
    mobileBackgroundColor,
    fontSize,
    mobileFontSize,
    textAlign,
    mobileTextAlign,
    lineHeight,
    mobileLineHeight,
    letterSpacing,
    mobileLetterSpacing,
    padding,
    mobilePadding,
    fontType,
    fontFamily,
    fontStyle,
  } = useNode<TextProps>((node) => ({
    text: node.data.props.text,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    backgroundColor: node.data.props.backgroundColor,
    mobileBackgroundColor: node.data.props.mobileBackgroundColor,
    fontSize: node.data.props.fontSize,
    mobileFontSize: node.data.props.mobileFontSize,
    color: node.data.props.color,
    mobileColor: node.data.props.mobileColor,
    textAlign: node.data.props.textAlign,
    mobileTextAlign: node.data.props.mobileTextAlign,
    lineHeight: node.data.props.lineHeight,
    mobileLineHeight: node.data.props.mobileLineHeight,
    letterSpacing: node.data.props.letterSpacing,
    mobileLetterSpacing: node.data.props.mobileLetterSpacing,
    padding: node.data.props.padding,
    mobilePadding: node.data.props.mobilePadding,
    fontType: node.data.props.fontType,
    fontFamily: node.data.props.fontFamily,
    fontStyle: node.data.props.fontStyle,
  }));

  const updateProp = <K extends keyof TextProps>(key: K) => (value: TextProps[K]) => {
    setProp((props: TextProps) => {
      props[key] = value;
    });
  };

  return (
    <>
     
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
      <FontTypeSettings
        fontType={fontType}
        setFontType={updateProp("fontType")}
        fontFamily={fontFamily}
        setFontFamily={updateProp("fontFamily")}
        fontStyle={fontStyle}
        setFontStyle={updateProp("fontStyle")}
      />
      
      {/* Letter Spacing Settings */}
      <LetterSpacingSettings
        letterSpacing={{ mobile: mobileLetterSpacing, desktop: letterSpacing }}
        setLetterSpacing={(value) => {
          updateProp("letterSpacing")(value.desktop);
          updateProp("mobileLetterSpacing")(value.mobile);
        }}
      />

          
      {/* Background Color Settings */}
       <BackgroundColorSettings
        backgroundColor={{ mobile: mobileBackgroundColor, desktop: backgroundColor }}
        setBackgroundColor={(value) => {
          updateProp("backgroundColor")(value.desktop);
          updateProp("mobileBackgroundColor")(value.mobile);
        }}
      />

      {/* Text Align Settings */}
      <TextAlignSettings
        textAlign={{ mobile: mobileTextAlign, desktop: textAlign }}
        setTextAlign={(value) => {
          updateProp("textAlign")(value.desktop);
          updateProp("mobileTextAlign")(value.mobile);
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

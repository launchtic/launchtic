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
import { FontTypeSettings } from "../../editor/toolbar/FontTypeSettings";
import { IconColorSettings } from "../../editor/toolbar/IconColorSettings"; // Added import
import { IconSizeSettings } from "../../editor/toolbar/IconSizeSettings"; // Added import
import { VerticalSpacingSettings } from "../../editor/toolbar/VerticalSpacingSettings"; // Added import
import { BulletedListProps } from "../ElementProps";
import { SettingsGroup, Label, Select } from "../../editor/common/SettingsUI";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings"; 

export const BulletedListSettings: React.FC = () => {
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
    iconColor,
    mobileIconColor,
    iconSize,
    mobileIconSize,
    verticalSpacing,
    mobileVerticalSpacing,
    verticalAlign
  } = useNode<BulletedListProps>((node) => ({
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
    iconColor: node.data.props.iconColor,
    mobileIconColor: node.data.props.mobileIconColor,
    iconSize: node.data.props.iconSize,
    mobileIconSize: node.data.props.mobileIconSize,
    verticalSpacing: node.data.props.verticalSpacing,
    mobileVerticalSpacing: node.data.props.mobileVerticalSpacing,
    verticalAlign: node.data.props.verticalAlign
  }));

  const updateProp = <K extends keyof BulletedListProps>(key: K) => (value: BulletedListProps[K]) => {
    setProp((props: BulletedListProps) => {
      props[key] = value;
    });
  };

  return (
    <>
      <FontTypeSettings
        fontType={fontType}
        setFontType={updateProp("fontType")}
        fontFamily={fontFamily}
        setFontFamily={updateProp("fontFamily")}
        fontStyle={fontStyle}
        setFontStyle={updateProp("fontStyle")}
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
       {/* Icon Size Settings - viewport-aware */}
       <IconSizeSettings
        iconSize={{ desktop: iconSize, mobile: mobileIconSize }}
        setIconSize={(value) => {
          if (value.desktop !== undefined) updateProp("iconSize")(value.desktop);
          updateProp("mobileIconSize")(value.mobile);
        }}
      />

      {/* Icon Color Settings - newly added */}
      <IconColorSettings
        iconColor={{ mobile: mobileIconColor, desktop: iconColor }}
        setIconColor={(value) => {
          updateProp("iconColor")(value.desktop);
          updateProp("mobileIconColor")(value.mobile);
        }}
      />
      
      <SettingsGroup>
        <Label>Vertical alignment</Label>
        <Select
          value={verticalAlign ?? "center"}
          onChange={(e) => updateProp("verticalAlign")(e.target.value as BulletedListProps["verticalAlign"])}
        >
          <option value="top">Top</option>
          <option value="center">Center</option>
          <option value="bottom">Bottom</option>
        </Select>
      </SettingsGroup>

      {/* Vertical Spacing Settings - newly added */}
      <VerticalSpacingSettings
        verticalSpacing={{ mobile: mobileVerticalSpacing, desktop: verticalSpacing }}
        setVerticalSpacing={(value) => {
          updateProp("verticalSpacing")(value.desktop);
          updateProp("mobileVerticalSpacing")(value.mobile);
        }}
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
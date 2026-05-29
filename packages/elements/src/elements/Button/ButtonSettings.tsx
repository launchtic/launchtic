import React from "react";
import { useNode } from "@craftjs/core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { FontSizeSettings } from "../../editor/toolbar/FontSizeSettings";
import { LineHeightSettings } from "../../editor/toolbar/LineHeightSettings";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { FontTypeSettings } from "../../editor/toolbar/FontTypeSettings";
import { AlignSelfSettings } from "../../editor/toolbar/AlignSelfSettings";
import { TextColorSettings } from "../../editor/toolbar/TextColorSettings";
import { BoxShadowSettings } from "../../editor/toolbar/BoxShadowSettings";
import { BorderSettings } from "../../editor/toolbar/BorderSettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { IconSelectorSettings } from "../../editor/toolbar/IconSelectorSettings";
import { ButtonActionSettings } from "../../editor/toolbar/ButtonActionSettings";
import { ButtonWidthSettings } from "../../editor/toolbar/ButtonWidthSettings";
import { ButtonHoverSettings } from "../../editor/toolbar/ButtonHoverSettings";
import { ButtonProps } from "../ElementProps";
import { SettingsGroupLarge, Label, Input, InputWrapper } from "../../editor/common/SettingsUI";

// `showAction=false` hides the Action / redirect / double-opt-in section — used
// by the Offer buttons (Accept/Decline) whose click behavior is fixed.
export const ButtonSettings: React.FC<{ showAction?: boolean }> = ({ showAction = true }) => {
  const {
    actions: { setProp },
    text,
    subText,
    fontSize,
    mobileFontSize,
    subTextFontSize,
    mobileSubTextFontSize,
    color,
    mobileColor,
    subTextColor,
    iconClassNameBefore,
    iconClassNameAfter,
    appearance,
    delay,
    margin,
    mobileMargin,
    backgroundColor,
    mobileBackgroundColor,
    lineHeight,
    mobileLineHeight,
    padding,
    mobilePadding,
    fontType,
    fontFamily,
    fontStyle,
    subTextFontType,
    subTextFontFamily,
    subTextFontStyle,
    alignSelf,
    mobileAlignSelf,
    width,
    mobileWidth,
    boxShadow,
    mobileBoxShadow,
    border,
    mobileBorder,
    action,
    doubleOptIn,
    redirectionType,
    linkUrl,
    nofollow,
    popup,
    hover
  } = useNode<ButtonProps>((node) => ({
    text: node.data.props.text,
    subText: node.data.props.subText,
    fontSize: node.data.props.fontSize,
    mobileFontSize: node.data.props.mobileFontSize,
    subTextFontSize: node.data.props.subTextFontSize,
    mobileSubTextFontSize: node.data.props.mobileSubTextFontSize,
    color: node.data.props.color,
    mobileColor: node.data.props.mobileColor,
    subTextColor: node.data.props.subTextColor,
    subTextFontFamily: node.data.props.subTextFontFamily,
    iconClassNameBefore: node.data.props.iconClassNameBefore,
    iconClassNameAfter: node.data.props.iconClassNameAfter,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    backgroundColor: node.data.props.backgroundColor,
    mobileBackgroundColor: node.data.props.mobileBackgroundColor,
    lineHeight: node.data.props.lineHeight,
    mobileLineHeight: node.data.props.mobileLineHeight,
    padding: node.data.props.padding,
    mobilePadding: node.data.props.mobilePadding,
    fontType: node.data.props.fontType,
    fontFamily: node.data.props.fontFamily,
    fontStyle: node.data.props.fontStyle,
    subTextFontType: node.data.props.subTextFontType,
    subTextFontStyle: node.data.props.subTextFontStyle,
    alignSelf: node.data.props.alignSelf,
    mobileAlignSelf: node.data.props.mobileAlignSelf,
    width: node.data.props.width,
    mobileWidth: node.data.props.mobileWidth,
    boxShadow: node.data.props.boxShadow,
    mobileBoxShadow: node.data.props.mobileBoxShadow,
    border: node.data.props.border,
    mobileBorder: node.data.props.mobileBorder,
    action: node.data.props.action,
    redirectionType: node.data.props.redirectionType,
    doubleOptIn: node.data.props.doubleOptIn,
    linkUrl: node.data.props.linkUrl,
    nofollow: node.data.props.nofollow,
    popup: node.data.props.popup,
    hover: node.data.props.hover
  }));

  // Popular icons for Button - action and CTA icons
  const BUTTON_POPULAR_ICONS = [
    // Action icons
    'fas fa-arrow-right',
    'fas fa-chevron-right', 
    'fas fa-angle-right',
    'fas fa-external-link-alt',
    
    // Shopping/Commerce
    'fas fa-shopping-cart',
    'fas fa-credit-card',
    
    // Communication
    'fas fa-envelope',
    'fas fa-phone',
    
    // Download/Upload
    'fas fa-download',
    'fas fa-upload',
    
    // Generic actions
    'fas fa-check',
    'fas fa-plus'
  ];
  const updateProp = <K extends keyof ButtonProps>(key: K) => (value: ButtonProps[K]) => {
    setProp((props: ButtonProps) => {
      props[key] = value;
    });
  };

  return (
    <>
     
      {/* Button Action Settings — hidden for Offer buttons (fixed behavior) */}
      {showAction && (
        <ButtonActionSettings
          action={action}
          redirectionType={redirectionType}
          linkUrl={linkUrl}
          nofollow={nofollow}
          popup={popup}
          doubleOptIn={doubleOptIn}
          updateProperty={(property, value) => {
            if (property === "action") updateProp("action")(value);
            else if (property === "redirectionType") updateProp("redirectionType")(value);
            else if (property === "linkUrl") updateProp("linkUrl")(value);
            else if (property === "nofollow") updateProp("nofollow")(value);
            else if (property === "popup") updateProp("popup")(value);
            else if (property === "doubleOptIn") updateProp("doubleOptIn")(value);
          }}
        />
      )}
      {/* Button Text Settings */}
      <SettingsGroupLarge>
        <Label>Button text</Label>
        <InputWrapper>
          <Input
            type="text"
            value={text || ""}
            onChange={(e) => updateProp("text")(e.target.value)}
          />
        </InputWrapper>
         {/* Background Color Settings */}
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
        {/* Text Color Settings */}
        <TextColorSettings
          color={{ mobile: mobileColor, desktop: color }}
          setColor={(value) => {
            updateProp("color")(value.desktop);
            updateProp("mobileColor")(value.mobile);
          }}
          label="Text color"
        />
        {/* Button Font Size Settings */}
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
        {/* Font Type Settings */}
        <FontTypeSettings
          fontType={fontType}
          setFontType={updateProp("fontType")}
          fontFamily={fontFamily}
          setFontFamily={updateProp("fontFamily")}
          fontStyle={fontStyle}
          setFontStyle={updateProp("fontStyle")}
        />
        {/* Icon Selector Before Text */}
        <IconSelectorSettings
          iconClass={iconClassNameBefore}
          setIconClass={updateProp("iconClassNameBefore")}
          label="Icon selector (before text)"
          popularIcons={BUTTON_POPULAR_ICONS}
        />

        {/* Icon Selector After Text */}
        <IconSelectorSettings
          iconClass={iconClassNameAfter}
          setIconClass={updateProp("iconClassNameAfter")}
          label="Icon selector (after text)"
          popularIcons={BUTTON_POPULAR_ICONS}
        />
        {/* Button Width Settings */}
        <ButtonWidthSettings
          width={{ mobile: mobileWidth, desktop: width }}
          setWidth={(value) => {
            updateProp("width")(value.desktop);
            updateProp("mobileWidth")(value.mobile);
          }}
        />
        
        {/* Alignment Settings */}
        <AlignSelfSettings
          alignSelf={{ mobile: mobileAlignSelf, desktop: alignSelf }}
          setAlignSelf={(value) => {
            updateProp("alignSelf")(value.desktop);
            updateProp("mobileAlignSelf")(value.mobile);
          }}
        />

      </SettingsGroupLarge>
      
      {/* Button SubText Settings */}
      <SettingsGroupLarge>
        <Label>Button Subtext</Label>
        <InputWrapper>
          <Input
            type="text"
            value={subText || ""}
            onChange={(e) => updateProp("subText")(e.target.value)}
          />
        </InputWrapper>
        {/* SubText Font Size Settings */}
        <FontSizeSettings
          fontSize={{ mobile: mobileSubTextFontSize, desktop: subTextFontSize }}
          setFontSize={(value) => {
            updateProp("subTextFontSize")(value.desktop);
            updateProp("mobileSubTextFontSize")(value.mobile);
          }}
        />
        {/* Subtext Color Settings */}
        <TextColorSettings
          color={{ mobile: subTextColor, desktop: subTextColor }}
          setColor={(value) => {
            updateProp("subTextColor")(value.desktop);
            updateProp("mobileSubTextColor")(value.mobile);
          }}
          label="Subtext color"
        />
        {/* SubText Font Type Settings */}
        <FontTypeSettings
          fontType={subTextFontType}
          setFontType={updateProp("subTextFontType")}
          fontFamily={subTextFontFamily}
          setFontFamily={updateProp("subTextFontFamily")}
          fontStyle={subTextFontStyle}
          setFontStyle={updateProp("subTextFontStyle")}
        />
      </SettingsGroupLarge>
      

      {/* Hover Effect Settings */}
       <ButtonHoverSettings
        hover={hover}
        setHover={updateProp("hover")}
      />

       {/* ✅ Border Settings */}
       <BorderSettings
        border={border}
        mobileBorder={mobileBorder}
        setBorder={updateProp("border")}
        setMobileBorder={updateProp("mobileBorder")}
      />

      {/* Box Shadow Settings */}
      <BoxShadowSettings
        boxShadow={{ mobile: mobileBoxShadow, desktop: boxShadow }}
        setBoxShadow={(value) => {
          updateProp("boxShadow")(value.desktop);
          updateProp("mobileBoxShadow")(value.mobile);
        }}
      />

     


      {/* Padding Settings */}
      <PaddingSettings
        padding={padding}
        mobilePadding={mobilePadding}
        setPadding={updateProp("padding")}
        setMobilePadding={updateProp("mobilePadding")}
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
      <IDAttributeSettings />
    </>
  );
};
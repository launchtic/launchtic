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
import { ButtonWidthSettings } from "../../editor/toolbar/ButtonWidthSettings";
import { ButtonHoverSettings } from "../../editor/toolbar/ButtonHoverSettings";
import { PaymentButtonProps } from "../ElementProps";
import { SettingsGroup, SettingsGroupLarge, Label, Input, InputWrapper } from "../../editor/common/SettingsUI";

export const PaymentButtonSettings: React.FC = () => {
  const {
    actions: { setProp },
    text,
    subText,
    loadingText,
    validationText,
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
    hover,
  } = useNode<PaymentButtonProps>((node) => ({
    text: node.data.props.text,
    subText: node.data.props.subText,
    loadingText: node.data.props.loadingText,
    validationText: node.data.props.validationText,
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
    hover: node.data.props.hover,
    paymentGateway: node.data.props.paymentGateway,
    currency: node.data.props.currency,
    amount: node.data.props.amount
  }));

  // Popular icons for PaymentButton - payment and security icons
  const PAYMENT_BUTTON_POPULAR_ICONS = [
    // Payment/Money
    'fas fa-credit-card',
    'fas fa-dollar-sign',
    'fas fa-money-bill-wave',
    'fas fa-coins',
    
    // Security/Trust
    'fas fa-shield-alt',
    'fas fa-lock',
    'fas fa-check-circle',
    
    // Shopping/Commerce  
    'fas fa-shopping-cart',
    'fas fa-shopping-bag',
    
    // Action/Process
    'fas fa-arrow-right',
    'fas fa-play',
    'fas fa-hand-holding-usd'
  ];
  const updateProp = <K extends keyof PaymentButtonProps>(key: K) => (value: PaymentButtonProps[K]) => {
    setProp((props: PaymentButtonProps) => {
      props[key] = value;
    });
  };

  return (
    <>
      {/* Payment button section */}
      <SettingsGroupLarge>
        <Label>Payment button</Label>
        
        {/* Alignment Settings */}
        <AlignSelfSettings
          alignSelf={{ mobile: mobileAlignSelf, desktop: alignSelf }}
          setAlignSelf={(value) => {
            updateProp("alignSelf")(value.desktop);
            updateProp("mobileAlignSelf")(value.mobile);
          }}
        />

        {/* Button Width Settings */}
        <ButtonWidthSettings
          width={{ mobile: mobileWidth, desktop: width }}
          setWidth={(value) => {
            updateProp("width")(value.desktop);
            updateProp("mobileWidth")(value.mobile);
          }}
        />

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

        {/* Icon Selector Before Text */}
        <IconSelectorSettings
          iconClass={iconClassNameBefore}
          setIconClass={updateProp("iconClassNameBefore")}
          label="Icon selector (before text)"
          popularIcons={PAYMENT_BUTTON_POPULAR_ICONS}
        />

        {/* Icon Selector After Text */}
        <IconSelectorSettings
          iconClass={iconClassNameAfter}
          setIconClass={updateProp("iconClassNameAfter")}
          label="Icon selector (after text)"
          popularIcons={PAYMENT_BUTTON_POPULAR_ICONS}
        />
      </SettingsGroupLarge>

      {/* Text Section */}
      <SettingsGroupLarge>
        {/* Loading Text */}
        <SettingsGroup>
            <Label>Loading text</Label>
            <InputWrapper>
            <Input
                type="text"
                value={loadingText || ""}
                onChange={(e) => updateProp("loadingText")(e.target.value)}
            />
            </InputWrapper>
        </SettingsGroup>
        <SettingsGroup>
            {/* Validation Text */}
            <Label>Validation</Label>
            <InputWrapper>
            <Input
                type="text"
                value={validationText || ""}
                onChange={(e) => updateProp("validationText")(e.target.value)}
            />
            </InputWrapper>
        </SettingsGroup>
        
        <SettingsGroup>
            {/* Button Text */}
            <Label>Button text</Label>
            <InputWrapper>
            <Input
                type="text"
                value={text || ""}
                onChange={(e) => updateProp("text")(e.target.value)}
            />
            </InputWrapper>
        </SettingsGroup>

        {/* Font Type Settings */}
        <FontTypeSettings
          fontType={fontType}
          setFontType={updateProp("fontType")}
          fontFamily={fontFamily}
          setFontFamily={updateProp("fontFamily")}
          fontStyle={fontStyle}
          setFontStyle={updateProp("fontStyle")}
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

        {/* Text Color Settings */}
        <TextColorSettings
          color={{ mobile: mobileColor, desktop: color }}
          setColor={(value) => {
            updateProp("color")(value.desktop);
            updateProp("mobileColor")(value.mobile);
          }}
          label="Text color"
        />
      </SettingsGroupLarge>
      
      {/* Sub text Section */}
      <SettingsGroupLarge>        
        {/* Subtext Input */}
        <Label>Subtext</Label>
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

        {/* SubText Font Type Settings */}
        <FontTypeSettings
          fontType={subTextFontType}
          setFontType={updateProp("subTextFontType")}
          fontFamily={subTextFontFamily}
          setFontFamily={updateProp("subTextFontFamily")}
          fontStyle={subTextFontStyle}
          setFontStyle={updateProp("subTextFontStyle")}
        />

        {/* Subtext Color Settings */}
        <TextColorSettings
          color={{ mobile: subTextColor, desktop: subTextColor }}
          setColor={(value) => {
            updateProp("subTextColor")(value.desktop);
          }}
          label="Color"
        />
      </SettingsGroupLarge>

      {/* Hover Effect Settings */}
      <ButtonHoverSettings
        hover={hover}
        setHover={updateProp("hover")}
      />

      {/* Border Settings */}
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
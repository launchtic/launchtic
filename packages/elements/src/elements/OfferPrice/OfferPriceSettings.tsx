import React from "react";
import { useNode } from "@launchtic/editor-core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { FontSizeSettings } from "../../editor/toolbar/FontSizeSettings";
import { LineHeightSettings } from "../../editor/toolbar/LineHeightSettings";
import { FontTypeSettings } from "../../editor/toolbar/FontTypeSettings";
import { TextColorSettings } from "../../editor/toolbar/TextColorSettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { OfferPriceProps } from "../ElementProps";
import { SettingsGroupLarge, Label, Input, InputWrapper } from "../../editor/common/SettingsUI";

export const OfferPriceSettings: React.FC = () => {
  const {
    actions: { setProp },
    pricePlanDescription,
    pricePlanNameFontSize,
    mobilePricePlanNameFontSize,
    pricePlanNameLineHeight,        
    mobilePricePlanNameLineHeight,  
    pricePlanNameColor,
    mobilePricePlanNameColor,
    pricePlanNameFontType,
    pricePlanNameFontFamily,
    pricePlanNameFontStyle,
    amountFontSize,
    mobileAmountFontSize,
    amountLineHeight,        
    mobileAmountLineHeight,  
    amountColor,
    mobileAmountColor,
    amountFontType,
    amountFontFamily,
    amountFontStyle,
    priceDescriptionFontSize,
    mobilePriceDescriptionFontSize,
    priceDescriptionLineHeight,        
    mobilePriceDescriptionLineHeight,  
    priceDescriptionColor,
    mobilePriceDescriptionColor,
    priceDescriptionFontType,
    priceDescriptionFontFamily,
    priceDescriptionFontStyle,
    appearance,
    delay,
    margin,
    mobileMargin,
    backgroundColor,
    mobileBackgroundColor,
    } = useNode<OfferPriceProps>((node) => ({
    pricePlanDescription: node.data.props.pricePlanDescription,
    pricePlanNameFontSize: node.data.props.pricePlanNameFontSize,
    mobilePricePlanNameFontSize: node.data.props.mobilePricePlanNameFontSize,
    pricePlanNameColor: node.data.props.pricePlanNameColor,
    mobilePricePlanNameColor: node.data.props.mobilePricePlanNameColor,
    pricePlanNameFontType: node.data.props.pricePlanNameFontType,
    pricePlanNameFontFamily: node.data.props.pricePlanNameFontFamily,
    pricePlanNameFontStyle: node.data.props.pricePlanNameFontStyle,
    amountFontSize: node.data.props.amountFontSize,
    mobileAmountFontSize: node.data.props.mobileAmountFontSize,
    amountColor: node.data.props.amountColor,
    mobileAmountColor: node.data.props.mobileAmountColor,
    amountFontType: node.data.props.amountFontType,
    amountFontFamily: node.data.props.amountFontFamily,
    amountFontStyle: node.data.props.amountFontStyle,
    priceDescriptionFontSize: node.data.props.priceDescriptionFontSize,
    mobilePriceDescriptionFontSize: node.data.props.mobilePriceDescriptionFontSize,
    priceDescriptionColor: node.data.props.priceDescriptionColor,
    mobilePriceDescriptionColor: node.data.props.mobilePriceDescriptionColor,
    priceDescriptionFontType: node.data.props.priceDescriptionFontType,
    priceDescriptionFontFamily: node.data.props.priceDescriptionFontFamily,
    priceDescriptionFontStyle: node.data.props.priceDescriptionFontStyle,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    backgroundColor: node.data.props.backgroundColor,
    mobileBackgroundColor: node.data.props.mobileBackgroundColor,
    pricePlanNameLineHeight: node.data.props.pricePlanNameLineHeight,
    mobilePricePlanNameLineHeight: node.data.props.mobilePricePlanNameLineHeight,
    amountLineHeight: node.data.props.amountLineHeight,
    mobileAmountLineHeight: node.data.props.mobileAmountLineHeight,
    priceDescriptionLineHeight: node.data.props.priceDescriptionLineHeight,
    mobilePriceDescriptionLineHeight: node.data.props.mobilePriceDescriptionLineHeight,
  }));

  const updateProp = <K extends keyof OfferPriceProps>(key: K) => (value: OfferPriceProps[K]) => {
    setProp((props: OfferPriceProps) => {
      props[key] = value;
    });
  };

  return (
    <>
      {/* Offer Price Settings */}
      <SettingsGroupLarge>
        <Label>Offer price</Label>
        
        {/* Price Plan Name Font Size Settings */}
        <FontSizeSettings
          fontSize={{ mobile: mobilePricePlanNameFontSize, desktop: pricePlanNameFontSize }}
          setFontSize={(value) => {
            updateProp("pricePlanNameFontSize")(value.desktop);
            updateProp("mobilePricePlanNameFontSize")(value.mobile);
          }}
        />

        {/* Price Plan Name Line Height Settings - using fontSize as lineHeight */}
        <LineHeightSettings
            lineHeight={{ mobile: mobilePricePlanNameLineHeight, desktop: pricePlanNameLineHeight }}
            setLineHeight={(value) => {
                updateProp("pricePlanNameLineHeight")(value.desktop);
                updateProp("mobilePricePlanNameLineHeight")(value.mobile);
            }}
        />


        {/* Price Plan Name Font Type Settings */}
        <FontTypeSettings
          fontType={pricePlanNameFontType}
          setFontType={updateProp("pricePlanNameFontType")}
          fontFamily={pricePlanNameFontFamily}
          setFontFamily={updateProp("pricePlanNameFontFamily")}
          fontStyle={pricePlanNameFontStyle}
          setFontStyle={updateProp("pricePlanNameFontStyle")}
        />

        {/* Price Plan Name Text Color Settings */}
        <TextColorSettings
          color={{ mobile: mobilePricePlanNameColor, desktop: pricePlanNameColor }}
          setColor={(value) => {
            updateProp("pricePlanNameColor")(value.desktop);
            updateProp("mobilePricePlanNameColor")(value.mobile);
          }}
          label="Text color"
        />
      </SettingsGroupLarge>

      {/* Amount Settings */}
      <SettingsGroupLarge>
        <Label>Amount</Label>
        
        {/* Amount Font Size Settings */}
        <FontSizeSettings
          fontSize={{ mobile: mobileAmountFontSize, desktop: amountFontSize }}
          setFontSize={(value) => {
            updateProp("amountFontSize")(value.desktop);
            updateProp("mobileAmountFontSize")(value.mobile);
          }}
        />

        {/* Amount Line Height Settings - using fontSize as lineHeight */}
        <LineHeightSettings
            lineHeight={{ mobile: mobileAmountLineHeight, desktop: amountLineHeight }}
            setLineHeight={(value) => {
                updateProp("amountLineHeight")(value.desktop);
                updateProp("mobileAmountLineHeight")(value.mobile);
            }}
        />

        {/* Amount Font Type Settings */}
        <FontTypeSettings
          fontType={amountFontType}
          setFontType={updateProp("amountFontType")}
          fontFamily={amountFontFamily}
          setFontFamily={updateProp("amountFontFamily")}
          fontStyle={amountFontStyle}
          setFontStyle={updateProp("amountFontStyle")}
        />

        {/* Amount Text Color Settings */}
        <TextColorSettings
          color={{ mobile: mobileAmountColor, desktop: amountColor }}
          setColor={(value) => {
            updateProp("amountColor")(value.desktop);
            updateProp("mobileAmountColor")(value.mobile);
          }}
          label="Text color"
        />
      </SettingsGroupLarge>

      {/* Price Description Settings */}
      <SettingsGroupLarge>
        <Label>Price description</Label>
        
        {/* Price Description Font Size Settings */}
        <FontSizeSettings
          fontSize={{ mobile: mobilePriceDescriptionFontSize, desktop: priceDescriptionFontSize }}
          setFontSize={(value) => {
            updateProp("priceDescriptionFontSize")(value.desktop);
            updateProp("mobilePriceDescriptionFontSize")(value.mobile);
          }}
        />

        <LineHeightSettings
        lineHeight={{ mobile: mobilePriceDescriptionLineHeight, desktop: priceDescriptionLineHeight }}
        setLineHeight={(value) => {
            updateProp("priceDescriptionLineHeight")(value.desktop);
            updateProp("mobilePriceDescriptionLineHeight")(value.mobile);
        }}
        />

        {/* Price Description Font Type Settings */}
        <FontTypeSettings
          fontType={priceDescriptionFontType}
          setFontType={updateProp("priceDescriptionFontType")}
          fontFamily={priceDescriptionFontFamily}
          setFontFamily={updateProp("priceDescriptionFontFamily")}
          fontStyle={priceDescriptionFontStyle}
          setFontStyle={updateProp("priceDescriptionFontStyle")}
        />

        {/* Price Description Text Color Settings */}
        <TextColorSettings
          color={{ mobile: mobilePriceDescriptionColor, desktop: priceDescriptionColor }}
          setColor={(value) => {
            updateProp("priceDescriptionColor")(value.desktop);
            updateProp("mobilePriceDescriptionColor")(value.mobile);
          }}
          label="Text color"
        />
      </SettingsGroupLarge>

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
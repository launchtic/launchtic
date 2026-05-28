import React from "react";
import { useNode } from "@craftjs/core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { FontSizeSettings } from "../../editor/toolbar/FontSizeSettings";
import { LineHeightSettings } from "../../editor/toolbar/LineHeightSettings";
import { FontTypeSettings } from "../../editor/toolbar/FontTypeSettings";
import { TextColorSettings } from "../../editor/toolbar/TextColorSettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { BorderSettings } from "../../editor/toolbar/BorderSettings";
import { PaymentMethodProps } from "../ElementProps";
import { SettingsGroupLarge, Label, SliderControl } from "../../editor/common/SettingsUI";

export const PaymentMethodSettings: React.FC = () => {
  const {
    actions: { setProp },
    textFontSize,
    mobileTextFontSize,
    textLineHeight,        
    mobileTextLineHeight,  
    textColor,
    mobileTextColor,
    textFontType,
    textFontFamily,
    textFontStyle,
    spaceBetweenItems,
    itemPadding,
    mobileItemPadding,
    itemBorder,
    mobileItemBorder,
    activeBackgroundColor,
    mobileActiveBackgroundColor,
    appearance,
    delay,
    margin,
    mobileMargin,
    } = useNode<PaymentMethodProps>((node) => ({
    textFontSize: node.data.props.textFontSize,
    mobileTextFontSize: node.data.props.mobileTextFontSize,
    textLineHeight: node.data.props.textLineHeight,
    mobileTextLineHeight: node.data.props.mobileTextLineHeight,
    textColor: node.data.props.textColor,
    mobileTextColor: node.data.props.mobileTextColor,
    textFontType: node.data.props.textFontType,
    textFontFamily: node.data.props.textFontFamily,
    textFontStyle: node.data.props.textFontStyle,
    spaceBetweenItems: node.data.props.spaceBetweenItems,
    itemPadding: node.data.props.itemPadding,
    mobileItemPadding: node.data.props.mobileItemPadding,
    itemBorder: node.data.props.itemBorder,
    mobileItemBorder: node.data.props.mobileItemBorder,
    activeBackgroundColor: node.data.props.activeBackgroundColor,
    mobileActiveBackgroundColor: node.data.props.mobileActiveBackgroundColor,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
  }));

  const updateProp = <K extends keyof PaymentMethodProps>(key: K) => (value: PaymentMethodProps[K]) => {
    setProp((props: PaymentMethodProps) => {
      props[key] = value;
    });
  };

  return (
    <>
      {/* Payment Methods Settings */}
      <SettingsGroupLarge>
        <Label>Payment methods</Label>
        
        {/* Text Font Size Settings */}
        <FontSizeSettings
          fontSize={{ mobile: mobileTextFontSize, desktop: textFontSize }}
          setFontSize={(value) => {
            updateProp("textFontSize")(value.desktop);
            updateProp("mobileTextFontSize")(value.mobile);
          }}
        />

        {/* Text Line Height Settings */}
        <LineHeightSettings
            lineHeight={{ mobile: mobileTextLineHeight, desktop: textLineHeight }}
            setLineHeight={(value) => {
                updateProp("textLineHeight")(value.desktop);
                updateProp("mobileTextLineHeight")(value.mobile);
            }}
        />

        {/* Text Font Type Settings */}
        <FontTypeSettings
          fontType={textFontType}
          setFontType={updateProp("textFontType")}
          fontFamily={textFontFamily}
          setFontFamily={updateProp("textFontFamily")}
          fontStyle={textFontStyle}
          setFontStyle={updateProp("textFontStyle")}
        />

        {/* Text Color Settings */}
        <TextColorSettings
          color={{ mobile: mobileTextColor, desktop: textColor }}
          setColor={(value) => {
            updateProp("textColor")(value.desktop);
            updateProp("mobileTextColor")(value.mobile);
          }}
          label="Text color"
        />
      </SettingsGroupLarge>

      {/* Item Styling */}
      <SettingsGroupLarge>
        <Label>Item styling</Label>
        
        {/* Space Between Items */}
        <SliderControl
          label="Space between items"
          value={spaceBetweenItems ?? 10}
          min={0}
          max={50}
          onChange={updateProp("spaceBetweenItems")}
        />
        
        {/* Item Padding */}
        <PaddingSettings
          padding={itemPadding}
          mobilePadding={mobileItemPadding}
          setPadding={updateProp("itemPadding")}
          setMobilePadding={updateProp("mobileItemPadding")}
        />

        
        {/* Item Border Settings */}
        <BorderSettings
          border={itemBorder}
          mobileBorder={mobileItemBorder}
          setBorder={updateProp("itemBorder")}
          setMobileBorder={updateProp("mobileItemBorder")}
        />
        
        {/* Active Background Color */}
        <BackgroundColorSettings
          backgroundColor={{ mobile: mobileActiveBackgroundColor, desktop: activeBackgroundColor }}
          setBackgroundColor={(value) => {
            updateProp("activeBackgroundColor")(value.desktop);
            updateProp("mobileActiveBackgroundColor")(value.mobile);
          }}
          label="Active background color"
        />
      </SettingsGroupLarge>

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
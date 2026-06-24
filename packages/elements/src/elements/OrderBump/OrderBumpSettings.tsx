import React from "react";
import { useNode } from "@launchtic/editor-core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { FontSizeSettings } from "../../editor/toolbar/FontSizeSettings";
import { FontTypeSettings } from "../../editor/toolbar/FontTypeSettings";
import { TextColorSettings } from "../../editor/toolbar/TextColorSettings";
import { TextAlignSettings } from "../../editor/toolbar/TextAlignSettings";
import { BorderSettings } from "../../editor/toolbar/BorderSettings";
import { BoxShadowSettings } from "../../editor/toolbar/BoxShadowSettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { IconSelectorSettings } from "../../editor/toolbar/IconSelectorSettings";
import { OrderBumpProps } from "../ElementProps";
import { SettingsGroupLarge, Label, Input, InputWrapper, SettingsGroup, SliderControl, CheckboxInput, CheckboxWrapper } from "../../editor/common/SettingsUI";

export const OrderBumpSettings: React.FC = () => {
  const {
    actions: { setProp },
    orderBumpName,
    showIcon,
    iconClass,
    iconColor,
    iconSize,
    fontSize,
    mobileFontSize,
    color,
    mobileColor,
    fontType,
    fontFamily,
    fontStyle,
    textAlign,
    mobileTextAlign,
    backgroundColor,
    mobileBackgroundColor,
    border,
    mobileBorder,
    boxShadow,
    mobileBoxShadow,
    padding,
    mobilePadding,
    margin,
    mobileMargin,
    appearance,
    delay,
  } = useNode<OrderBumpProps>((node) => ({
    orderBumpName: node.data.props.orderBumpName,
    showIcon:  node.data.props.showIcon,
    iconClass: node.data.props.iconClass,
    iconColor: node.data.props.iconColor,
    iconSize: node.data.props.iconSize,
    fontSize: node.data.props.fontSize,
    mobileFontSize: node.data.props.mobileFontSize,
    color: node.data.props.color,
    mobileColor: node.data.props.mobileColor,
    fontType: node.data.props.fontType,
    fontFamily: node.data.props.fontFamily,
    fontStyle: node.data.props.fontStyle,
    textAlign: node.data.props.textAlign,
    mobileTextAlign: node.data.props.mobileTextAlign,
    backgroundColor: node.data.props.backgroundColor,
    mobileBackgroundColor: node.data.props.mobileBackgroundColor,
    border: node.data.props.border,
    mobileBorder: node.data.props.mobileBorder,
    boxShadow: node.data.props.boxShadow,
    mobileBoxShadow: node.data.props.mobileBoxShadow,
    padding: node.data.props.padding,
    mobilePadding: node.data.props.mobilePadding,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
  }));

  const ORDER_BUMP_POPULAR_ICONS = [
    'fas fa-arrow-right',
    'fas fa-right-long',
    'fas fa-hand-point-right',
    'fas fa-star',
    'fas fa-bolt',
    'fas fa-fire',
    'fas fa-gift',
    'fas fa-plus-circle',
    'fas fa-shopping-cart',
    'fas fa-heart',
    'fas fa-exclamation-circle',
    'fas fa-angle-double-right',
  ];

  const updateProp = <K extends keyof OrderBumpProps>(key: K) => (value: OrderBumpProps[K]) => {
    setProp((props: OrderBumpProps) => {
      props[key] = value;
    });
  };

  return (
    <>
      {/* Order Bump Settings */}
      <SettingsGroupLarge>
        <Label>Order bump</Label>
        
        {/* Order bump name */}
        <InputWrapper>
          <Input
            type="text"
            value={orderBumpName || ""}
            placeholder="Yes, I want it!"
            onChange={(e) => updateProp("orderBumpName")(e.target.value)}
          />
        </InputWrapper>
      </SettingsGroupLarge>

      {/* Alignment Settings */}
      <TextAlignSettings
        textAlign={{ mobile: mobileTextAlign, desktop: textAlign }}
        setTextAlign={(value) => {
          updateProp("textAlign")(value.desktop);
          updateProp("mobileTextAlign")(value.mobile);
        }}
      />

    {/* Icon Settings */}
    <SettingsGroupLarge>
      <Label>Icon Settings</Label>
      
      <CheckboxWrapper>
        <Label>Display icon</Label>
        <CheckboxInput
          checked={showIcon || false}
          onChange={(e) => updateProp("showIcon")(e.target.checked)}
        />
      </CheckboxWrapper>
      {showIcon && (
          <>
          <IconSelectorSettings
            iconClass={iconClass || 'fas fa-arrow-right'}
            setIconClass={updateProp("iconClass")}
            label="Select icon"
            popularIcons={ORDER_BUMP_POPULAR_ICONS}
          />
            
            {iconClass && (
              <TextColorSettings
                color={{ desktop: iconColor }}
                setColor={(value) => updateProp("iconColor")(value.desktop)}
                label="Icon color"
              />
            )}
            
            <SettingsGroup>
              <Label>Icon size</Label>
              <SliderControl
                value={iconSize || 30}
                min={10}
                max={60}
                step={1}
                onChange={updateProp("iconSize")}
              />
            </SettingsGroup>
          </>
        )}
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
        label="Background color"
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

      {/* Typography Settings */}
      <SettingsGroupLarge>
        <Label>Typography</Label>
        
        {/* Font Size Settings */}
        <FontSizeSettings
          fontSize={{ mobile: mobileFontSize, desktop: fontSize }}
          setFontSize={(value) => {
            updateProp("fontSize")(value.desktop);
            updateProp("mobileFontSize")(value.mobile);
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
      </SettingsGroupLarge>

      {/* Shadow Settings */}
      <BoxShadowSettings
        boxShadow={{
          mobile: mobileBoxShadow,
          desktop: boxShadow,
        }}
        setBoxShadow={(value) => {
          updateProp("boxShadow")(value.desktop);
          updateProp("mobileBoxShadow")(value.mobile);
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

      {/* ID Attribute Settings */}
      <IDAttributeSettings />
    </>
  );
};
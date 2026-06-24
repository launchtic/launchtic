import React from "react";
import { useNode } from "@launchtic/editor-core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { FontSizeSettings } from "../../editor/toolbar/FontSizeSettings";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { TextColorSettings } from "../../editor/toolbar/TextColorSettings";
import { BoxShadowSettings } from "../../editor/toolbar/BoxShadowSettings";
import { BorderSettings } from "../../editor/toolbar/BorderSettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { CouponProps } from "../ElementProps";
import { SettingsGroupLarge, Label, Input, InputWrapper } from "../../editor/common/SettingsUI";

export const CouponSettings: React.FC = () => {
  const {
    actions: { setProp },
    placeholder,
    fieldFontSize,
    mobileFieldFontSize,
    fieldTextColor,
    mobileFieldTextColor,
    fieldBackgroundColor,
    mobileFieldBackgroundColor,
    fieldBorder,
    mobileFieldBorder,
    buttonText,
    buttonFontSize,
    mobileButtonFontSize,
    buttonTextColor,
    mobileButtonTextColor,
    buttonBackgroundColor,
    mobileButtonBackgroundColor,
    buttonBorder,
    mobileButtonBorder,
    appearance,
    delay,
    margin,
    mobileMargin,
    padding,
    mobilePadding,
    boxShadow,
    mobileBoxShadow,
  } = useNode<CouponProps>((node) => ({
    placeholder: node.data.props.placeholder,
    fieldFontSize: node.data.props.fieldFontSize,
    mobileFieldFontSize: node.data.props.mobileFieldFontSize,
    fieldTextColor: node.data.props.fieldTextColor,
    mobileFieldTextColor: node.data.props.mobileFieldTextColor,
    fieldBackgroundColor: node.data.props.fieldBackgroundColor,
    mobileFieldBackgroundColor: node.data.props.mobileFieldBackgroundColor,
    fieldBorder: node.data.props.fieldBorder,
    mobileFieldBorder: node.data.props.mobileFieldBorder,
    buttonText: node.data.props.buttonText,
    buttonFontSize: node.data.props.buttonFontSize,
    mobileButtonFontSize: node.data.props.mobileButtonFontSize,
    buttonTextColor: node.data.props.buttonTextColor,
    mobileButtonTextColor: node.data.props.mobileButtonTextColor,
    buttonBackgroundColor: node.data.props.buttonBackgroundColor,
    mobileButtonBackgroundColor: node.data.props.mobileButtonBackgroundColor,
    buttonBorder: node.data.props.buttonBorder,
    mobileButtonBorder: node.data.props.mobileButtonBorder,
    action: node.data.props.action,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    padding: node.data.props.padding,
    mobilePadding: node.data.props.mobilePadding,
    boxShadow: node.data.props.boxShadow,
    mobileBoxShadow: node.data.props.mobileBoxShadow,
  }));

  const updateProp = <K extends keyof CouponProps>(key: K) => (value: CouponProps[K]) => {
    setProp((props: CouponProps) => {
      props[key] = value;
    });
  };

  return (
    <>
      {/* Field Settings */}
      <SettingsGroupLarge>
        <Label>Field</Label>
        
        {/* Placeholder */}
        <Label>Placeholder</Label>
        <InputWrapper>
          <Input
            type="text"
            value={placeholder || ""}
            onChange={(e) => updateProp("placeholder")(e.target.value)}
          />
        </InputWrapper>

        {/* Field Font Size */}
        <FontSizeSettings
          fontSize={{ mobile: mobileFieldFontSize, desktop: fieldFontSize }}
          setFontSize={(value) => {
            updateProp("fieldFontSize")(value.desktop);
            updateProp("mobileFieldFontSize")(value.mobile);
          }}
        />

        {/* Field Text Color */}
        <TextColorSettings
          color={{ mobile: mobileFieldTextColor, desktop: fieldTextColor }}
          setColor={(value) => {
            updateProp("fieldTextColor")(value.desktop);
            updateProp("mobileFieldTextColor")(value.mobile);
          }}
          label="Text color"
        />

        {/* Field Background Color */}
        <BackgroundColorSettings
          backgroundColor={{
            mobile: mobileFieldBackgroundColor,
            desktop: fieldBackgroundColor,
          }}
          setBackgroundColor={(value) => {
            updateProp("fieldBackgroundColor")(value.desktop);
            updateProp("mobileFieldBackgroundColor")(value.mobile);
          }}
        />
      </SettingsGroupLarge>

      {/* Field Border Settings */}
      <BorderSettings
        border={fieldBorder}
        mobileBorder={mobileFieldBorder}
        setBorder={updateProp("fieldBorder")}
        setMobileBorder={updateProp("mobileFieldBorder")}
      />

      {/* Button Settings */}
      <SettingsGroupLarge>
        <Label>Button</Label>
        
        {/* Button Text */}
        <Label>Text</Label>
        <InputWrapper>
          <Input
            type="text"
            value={buttonText || ""}
            onChange={(e) => updateProp("buttonText")(e.target.value)}
          />
        </InputWrapper>

        {/* Button Font Size */}
        <FontSizeSettings
          fontSize={{ mobile: mobileButtonFontSize, desktop: buttonFontSize }}
          setFontSize={(value) => {
            updateProp("buttonFontSize")(value.desktop);
            updateProp("mobileButtonFontSize")(value.mobile);
          }}
        />

        {/* Button Text Color */}
        <TextColorSettings
          color={{ mobile: mobileButtonTextColor, desktop: buttonTextColor }}
          setColor={(value) => {
            updateProp("buttonTextColor")(value.desktop);
            updateProp("mobileButtonTextColor")(value.mobile);
          }}
          label="Text color"
        />

        {/* Button Background Color */}
        <BackgroundColorSettings
          backgroundColor={{
            mobile: mobileButtonBackgroundColor,
            desktop: buttonBackgroundColor,
          }}
          setBackgroundColor={(value) => {
            updateProp("buttonBackgroundColor")(value.desktop);
            updateProp("mobileButtonBackgroundColor")(value.mobile);
          }}
        />
      </SettingsGroupLarge>

      {/* Button Border Settings */}
      <BorderSettings
        border={buttonBorder}
        mobileBorder={mobileButtonBorder}
        setBorder={updateProp("buttonBorder")}
        setMobileBorder={updateProp("mobileButtonBorder")}
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
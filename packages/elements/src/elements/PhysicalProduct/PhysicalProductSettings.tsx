import React from "react";
import { useNode } from "@craftjs/core";
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { DelaySettings } from "../../editor/toolbar/DelaySettings";
import { FontSizeSettings } from "../../editor/toolbar/FontSizeSettings";
import { LineHeightSettings } from "../../editor/toolbar/LineHeightSettings";
import { FontTypeSettings } from "../../editor/toolbar/FontTypeSettings";
import { TextColorSettings } from "../../editor/toolbar/TextColorSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings";
import { PhysicalProductProps } from "../ElementProps";
import { SettingsGroupLarge, Label } from "../../editor/common/SettingsUI";

export const PhysicalProductSettings: React.FC = () => {
  const {
    actions: { setProp },
    // Name
    nameFontSize, mobileNameFontSize,
    nameLineHeight, mobileNameLineHeight,
    nameColor, mobileNameColor,
    nameFontType, nameFontFamily, nameFontStyle,
    // Price
    priceFontSize, mobilePriceFontSize,
    priceLineHeight, mobilePriceLineHeight,
    priceColor, mobilePriceColor,
    priceFontType, priceFontFamily, priceFontStyle,
    // Description
    descriptionFontSize, mobileDescriptionFontSize,
    descriptionLineHeight, mobileDescriptionLineHeight,
    descriptionColor, mobileDescriptionColor,
    descriptionFontType, descriptionFontFamily, descriptionFontStyle,
    // Pill
    pillColor, pillSelectedColor,
    pillBorderColor, pillSelectedBorderColor,
    // Display
    showQuantity,
    // Layout
    backgroundColor, mobileBackgroundColor,
    margin, mobileMargin,
    appearance, delay,
  } = useNode<PhysicalProductProps>((node) => ({
    nameFontSize: node.data.props.nameFontSize,
    mobileNameFontSize: node.data.props.mobileNameFontSize,
    nameLineHeight: node.data.props.nameLineHeight,
    mobileNameLineHeight: node.data.props.mobileNameLineHeight,
    nameColor: node.data.props.nameColor,
    mobileNameColor: node.data.props.mobileNameColor,
    nameFontType: node.data.props.nameFontType,
    nameFontFamily: node.data.props.nameFontFamily,
    nameFontStyle: node.data.props.nameFontStyle,
    priceFontSize: node.data.props.priceFontSize,
    mobilePriceFontSize: node.data.props.mobilePriceFontSize,
    priceLineHeight: node.data.props.priceLineHeight,
    mobilePriceLineHeight: node.data.props.mobilePriceLineHeight,
    priceColor: node.data.props.priceColor,
    mobilePriceColor: node.data.props.mobilePriceColor,
    priceFontType: node.data.props.priceFontType,
    priceFontFamily: node.data.props.priceFontFamily,
    priceFontStyle: node.data.props.priceFontStyle,
    descriptionFontSize: node.data.props.descriptionFontSize,
    mobileDescriptionFontSize: node.data.props.mobileDescriptionFontSize,
    descriptionLineHeight: node.data.props.descriptionLineHeight,
    mobileDescriptionLineHeight: node.data.props.mobileDescriptionLineHeight,
    descriptionColor: node.data.props.descriptionColor,
    mobileDescriptionColor: node.data.props.mobileDescriptionColor,
    descriptionFontType: node.data.props.descriptionFontType,
    descriptionFontFamily: node.data.props.descriptionFontFamily,
    descriptionFontStyle: node.data.props.descriptionFontStyle,
    pillColor: node.data.props.pillColor,
    pillSelectedColor: node.data.props.pillSelectedColor,
    pillBorderColor: node.data.props.pillBorderColor,
    pillSelectedBorderColor: node.data.props.pillSelectedBorderColor,
    showQuantity: node.data.props.showQuantity,
    backgroundColor: node.data.props.backgroundColor,
    mobileBackgroundColor: node.data.props.mobileBackgroundColor,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
  }));

  const updateProp = <K extends keyof PhysicalProductProps>(key: K) =>
    (value: PhysicalProductProps[K]) => {
      setProp((props: PhysicalProductProps) => { props[key] = value; });
    };

  return (
    <>
      {/* Display options */}
      <SettingsGroupLarge>
        <Label>Display</Label>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
          <span style={{ fontSize: 13, color: "#555" }}>Show quantity selector</span>
          <input
            type="checkbox"
            checked={showQuantity ?? true}
            onChange={(e) => updateProp("showQuantity")(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
        </label>
      </SettingsGroupLarge>
      
      {/* Product name */}
      <SettingsGroupLarge>
        <Label>Product name</Label>
        <FontSizeSettings
          fontSize={{ mobile: mobileNameFontSize, desktop: nameFontSize }}
          setFontSize={(v) => { updateProp("nameFontSize")(v.desktop); updateProp("mobileNameFontSize")(v.mobile); }}
        />
        <LineHeightSettings
          lineHeight={{ mobile: mobileNameLineHeight, desktop: nameLineHeight }}
          setLineHeight={(v) => { updateProp("nameLineHeight")(v.desktop); updateProp("mobileNameLineHeight")(v.mobile); }}
        />
        <FontTypeSettings
          fontType={nameFontType}
          setFontType={updateProp("nameFontType")}
          fontFamily={nameFontFamily}
          setFontFamily={updateProp("nameFontFamily")}
          fontStyle={nameFontStyle}
          setFontStyle={updateProp("nameFontStyle")}
        />
        <TextColorSettings
          color={{ mobile: mobileNameColor, desktop: nameColor }}
          setColor={(v) => { updateProp("nameColor")(v.desktop); updateProp("mobileNameColor")(v.mobile); }}
          label="Text color"
        />
      </SettingsGroupLarge>

      {/* Price */}
      <SettingsGroupLarge>
        <Label>Price</Label>
        <FontSizeSettings
          fontSize={{ mobile: mobilePriceFontSize, desktop: priceFontSize }}
          setFontSize={(v) => { updateProp("priceFontSize")(v.desktop); updateProp("mobilePriceFontSize")(v.mobile); }}
        />
        <LineHeightSettings
          lineHeight={{ mobile: mobilePriceLineHeight, desktop: priceLineHeight }}
          setLineHeight={(v) => { updateProp("priceLineHeight")(v.desktop); updateProp("mobilePriceLineHeight")(v.mobile); }}
        />
        <FontTypeSettings
          fontType={priceFontType}
          setFontType={updateProp("priceFontType")}
          fontFamily={priceFontFamily}
          setFontFamily={updateProp("priceFontFamily")}
          fontStyle={priceFontStyle}
          setFontStyle={updateProp("priceFontStyle")}
        />
        <TextColorSettings
          color={{ mobile: mobilePriceColor, desktop: priceColor }}
          setColor={(v) => { updateProp("priceColor")(v.desktop); updateProp("mobilePriceColor")(v.mobile); }}
          label="Text color"
        />
      </SettingsGroupLarge>

      {/* Description */}
      <SettingsGroupLarge>
        <Label>Description</Label>
        <FontSizeSettings
          fontSize={{ mobile: mobileDescriptionFontSize, desktop: descriptionFontSize }}
          setFontSize={(v) => { updateProp("descriptionFontSize")(v.desktop); updateProp("mobileDescriptionFontSize")(v.mobile); }}
        />
        <LineHeightSettings
          lineHeight={{ mobile: mobileDescriptionLineHeight, desktop: descriptionLineHeight }}
          setLineHeight={(v) => { updateProp("descriptionLineHeight")(v.desktop); updateProp("mobileDescriptionLineHeight")(v.mobile); }}
        />
        <FontTypeSettings
          fontType={descriptionFontType}
          setFontType={updateProp("descriptionFontType")}
          fontFamily={descriptionFontFamily}
          setFontFamily={updateProp("descriptionFontFamily")}
          fontStyle={descriptionFontStyle}
          setFontStyle={updateProp("descriptionFontStyle")}
        />
        <TextColorSettings
          color={{ mobile: mobileDescriptionColor, desktop: descriptionColor }}
          setColor={(v) => { updateProp("descriptionColor")(v.desktop); updateProp("mobileDescriptionColor")(v.mobile); }}
          label="Text color"
        />
      </SettingsGroupLarge>

      

      {/* Option pills */}
      <SettingsGroupLarge>
        <Label>Option pills</Label>
        <TextColorSettings
          color={{ mobile: pillBorderColor, desktop: pillBorderColor }}
          setColor={(v) => { updateProp("pillBorderColor")(v.desktop); }}
          label="Border color"
        />
        <TextColorSettings
          color={{ mobile: pillSelectedBorderColor, desktop: pillSelectedBorderColor }}
          setColor={(v) => { updateProp("pillSelectedBorderColor")(v.desktop); updateProp("pillSelectedColor")(v.desktop); }}
          label="Selected color"
        />
      </SettingsGroupLarge>

      {/* Background */}
      <BackgroundColorSettings
        backgroundColor={{ mobile: mobileBackgroundColor, desktop: backgroundColor }}
        setBackgroundColor={(v) => { updateProp("backgroundColor")(v.desktop); updateProp("mobileBackgroundColor")(v.mobile); }}
      />

      {/* Margin */}
      <MarginSettings
        margin={margin}
        mobileMargin={mobileMargin}
        setMargin={updateProp("margin")}
        setMobileMargin={updateProp("mobileMargin")}
      />

      {/* Delay */}
      <DelaySettings delay={delay} setDelay={updateProp("delay")} />

      {/* Appearance */}
      <AppearanceSettings appearance={appearance} setAppearance={updateProp("appearance")} />

      {/* ID */}
      <IDAttributeSettings />
    </>
  );
};

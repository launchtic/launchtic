import React from "react";
import { useNode } from "@launchtic/editor-core";
import { DelaySettings } from "../../editor/toolbar/DelaySettings"; 
import { IDAttributeSettings } from "../../editor/toolbar/IDAttributeSettings"; 
import { AppearanceSettings } from "../../editor/toolbar/AppearanceSettings";
import { PaddingSettings } from "../../editor/toolbar/PaddingSettings";
import { MarginSettings } from "../../editor/toolbar/MarginSettings";
import { BackgroundColorSettings } from "../../editor/toolbar/BackgroundColorSettings";
import { BackgroundImageSettings } from "../../editor/toolbar/BackgroundImageSettings";
import { BoxShadowSettings } from "../../editor/toolbar/BoxShadowSettings";
import { BorderSettings } from "../../editor/toolbar/BorderSettings";
import { RowColumnSettings } from "../../editor/toolbar/RowColumnSettings";
import { SliderControl, SettingsGroup, Label, CheckboxWrapper, CheckboxInput, Select } from "../../editor/common/SettingsUI";
import { HelpTooltip } from "../../editor/common/settings/HelpTooltip";
import { ViewModeIcon } from "../../editor/common/settings/ViewModeIcon";
import { useAppContext } from "../../contexts/AppContext";

import { RowProps } from "../ElementProps"; // Import the canonical type
import { DEFAULT_STYLES } from "../DefaultStyles"; // Import default styles

export const RowSettings: React.FC = () => {
  const { viewMode } = useAppContext();

  const {
    actions: { setProp },
    appearance,
    delay,
    padding,
    mobilePadding,
    margin,
    mobileMargin,
    backgroundColor,
    mobileBackgroundColor,
    backgroundImage,
    mobileBackgroundImage,
    boxShadow,
    mobileBoxShadow,
    border,
    mobileBorder,
    disableStacking,
    reverseColumns,
    gap,
    mobileGap,
    verticalAlign,
    equalHeightCards,
  } = useNode<RowProps>((node) => ({
    appearance: node.data.props.appearance,
    delay: node.data.props.delay,
    padding: node.data.props.padding,
    mobilePadding: node.data.props.mobilePadding,
    margin: node.data.props.margin,
    mobileMargin: node.data.props.mobileMargin,
    backgroundColor: node.data.props.backgroundColor,
    mobileBackgroundColor: node.data.props.mobileBackgroundColor,
    backgroundImage: node.data.props.backgroundImage,
    mobileBackgroundImage: node.data.props.mobileBackgroundImage,
    boxShadow: node.data.props.boxShadow,
    mobileBoxShadow: node.data.props.mobileBoxShadow,
    border: node.data.props.border,
    mobileBorder: node.data.props.mobileBorder,
    disableStacking: node.data.props.disableStacking,
    reverseColumns: node.data.props.reverseColumns,
    gap: node.data.props.gap,
    mobileGap: node.data.props.mobileGap,
    verticalAlign: node.data.props.verticalAlign,
    equalHeightCards: node.data.props.equalHeightCards,
  }));

  // ✅ Helper function to update props dynamically
  const updateProp = <K extends keyof RowProps>(key: K) => (value: RowProps[K]) => {
    setProp((props: RowProps) => {
      props[key] = value;
    });
  };

  return (
    <>
      {/* ✅ Padding Settings */}
      <PaddingSettings
        padding={padding}
        mobilePadding={mobilePadding}
        setPadding={updateProp("padding")}
        setMobilePadding={updateProp("mobilePadding")}
      />

      {/* Column gap — desktop: horizontal between columns; mobile: vertical
          between stacked columns, inheriting the desktop value until set. */}
      <SettingsGroup>
        <Label>Spacing between columns <ViewModeIcon /></Label>
        <SliderControl
          value={viewMode === "mobile" ? (mobileGap ?? gap ?? 10) : (gap ?? 10)}
          min={0}
          max={100}
          onChange={updateProp(viewMode === "mobile" ? "mobileGap" : "gap")}
        />
      </SettingsGroup>

      <SettingsGroup>
        <Label>
          Vertical alignment
          <HelpTooltip text="Aligns the columns vertically, e.g. an icon centered next to a headline. Applies while columns sit side by side." />
        </Label>
        <Select
          value={verticalAlign ?? "top"}
          onChange={(e) => updateProp("verticalAlign")(e.target.value as RowProps["verticalAlign"])}
        >
          <option value="top">Top</option>
          <option value="center">Center</option>
          <option value="bottom">Bottom</option>
        </Select>
      </SettingsGroup>

      <SettingsGroup>
        <CheckboxWrapper>
          <Label>
            Equal height cards
            <HelpTooltip text="Rows placed inside this row's columns (cards) stretch to the tallest column, so cards line up even when their text length differs." />
          </Label>
          <CheckboxInput
            type="checkbox"
            checked={!!equalHeightCards}
            onChange={() => updateProp("equalHeightCards")(!equalHeightCards)}
          />
        </CheckboxWrapper>
      </SettingsGroup>

      {/* ✅ Margin Settings */}
      <MarginSettings
        margin={margin}
        mobileMargin={mobileMargin}
        setMargin={updateProp("margin")}
        setMobileMargin={updateProp("mobileMargin")}
      />

      {/* ✅ Background Color Settings */}
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

      {/* ✅ Background Image Settings */}
      <BackgroundImageSettings
        backgroundImage={{
          mobile: mobileBackgroundImage ?? DEFAULT_STYLES.row.mobileBackgroundImage,
          desktop: backgroundImage ?? DEFAULT_STYLES.row.backgroundImage,
        }}
        setBackgroundImage={(value) => {
          updateProp("backgroundImage")(value.desktop);
          updateProp("mobileBackgroundImage")(value.mobile);
        }}
      />

      {/* ✅ Box Shadow Settings */}
      <BoxShadowSettings
        boxShadow={{
          mobile: mobileBoxShadow ?? DEFAULT_STYLES.row.mobileBoxShadow,
          desktop: boxShadow ?? DEFAULT_STYLES.row.boxShadow,
        }}
        setBoxShadow={(value) => {
          updateProp("boxShadow")(value.desktop as RowProps["boxShadow"]);
          updateProp("mobileBoxShadow")(value.mobile as RowProps["mobileBoxShadow"]);
        }}
      />

      {/* ✅ Border Settings */}
      <BorderSettings
        border={border}
        mobileBorder={mobileBorder}
        setBorder={updateProp("border")}
        setMobileBorder={updateProp("mobileBorder")}
      />

      <DelaySettings
        delay={delay}
        setDelay={updateProp("delay")}
      />
      <RowColumnSettings
        disableStacking={disableStacking}
        reverseColumns={reverseColumns}
        setSettings={(value) => {
          updateProp("disableStacking")(value.disableStacking);
          updateProp("reverseColumns")(value.reverseColumns);
        }}
      />

      <AppearanceSettings
        appearance={appearance}
        setAppearance={updateProp("appearance")}
      />  
      <IDAttributeSettings/>
    </>
  );
};

import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { SettingsGroup, Label, SliderControl } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";

type FontSizeSettingsProps = {
  fontSize: { mobile?: number; desktop?: number };
  setFontSize: (value: { mobile?: number; desktop?: number }) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
};

export const FontSizeSettings: React.FC<FontSizeSettingsProps> = ({ 
  fontSize, 
  setFontSize, 
  label = "Font Size",
  min = 1,
  max = 100,
  step = 1
}) => {
  const { viewMode } = useAppContext();
  const currentSize = fontSize[viewMode] ?? 16;

  return (
    <SettingsGroup>
      <Label>
        {label} <ViewModeIcon />
      </Label>
      <SliderControl
        value={currentSize}
        min={min}
        max={max}
        step={step}
        onChange={(value) => setFontSize({ ...fontSize, [viewMode]: value })}
      />
    </SettingsGroup>
  );
};
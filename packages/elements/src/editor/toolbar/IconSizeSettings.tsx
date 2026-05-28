import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { SettingsGroup, Label, SliderControl } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";

type IconSizeSettingsProps = {
  iconSize: { mobile?: number; desktop?: number };
  setIconSize: (value: { mobile?: number; desktop?: number }) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
};

// Viewport-aware: single slider, reads/writes the active viewMode's value
// (matches FontSizeSettings + IconColorSettings convention).
export const IconSizeSettings: React.FC<IconSizeSettingsProps> = ({
  iconSize,
  setIconSize,
  label = "Icon Size",
  min = 8,
  max = 100,
  step = 2,
}) => {
  const { viewMode } = useAppContext();
  // Mobile falls back to desktop value when unset so the slider reflects
  // what's actually rendered.
  const currentSize = iconSize[viewMode] ?? iconSize.desktop ?? 0;

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
        onChange={(value) => setIconSize({ ...iconSize, [viewMode]: value })}
      />
    </SettingsGroup>
  );
};

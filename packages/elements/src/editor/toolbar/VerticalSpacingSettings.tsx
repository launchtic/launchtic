import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { SettingsGroup, Label, SliderControl } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";

type VerticalSpacingSettingsProps = {
  verticalSpacing: { mobile?: number; desktop?: number };
  setVerticalSpacing: (value: { mobile?: number; desktop?: number }) => void;
};

export const VerticalSpacingSettings: React.FC<VerticalSpacingSettingsProps> = ({ 
  verticalSpacing, 
  setVerticalSpacing 
}) => {
  const { viewMode } = useAppContext();
  const currentVerticalSpacing = verticalSpacing[viewMode] ?? 0;

  return (
    <SettingsGroup>
      <Label>
        Vertical Spacing <ViewModeIcon />
      </Label>
      <SliderControl
        value={currentVerticalSpacing}
        min={0}
        max={100}
        step={2}
        onChange={(value) => setVerticalSpacing({ ...verticalSpacing, [viewMode]: value })}
      />
    </SettingsGroup>
  );
};
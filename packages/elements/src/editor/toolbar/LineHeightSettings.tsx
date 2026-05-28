import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { SettingsGroup, Label, SliderControl } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";

type LineHeightSettingsProps = {
  lineHeight: { mobile?: number; desktop?: number };
  setLineHeight: (value: { mobile?: number; desktop?: number }) => void;
};

export const LineHeightSettings: React.FC<LineHeightSettingsProps> = ({ lineHeight, setLineHeight }) => {
  const { viewMode } = useAppContext();
  const currentLineHeight = lineHeight[viewMode] ?? 24;

  return (
    <SettingsGroup>
      <Label>
        Line Height <ViewModeIcon />
      </Label>
      <SliderControl
        value={currentLineHeight}
        min={1}
        max={100}
        step={2}
        onChange={(value) => setLineHeight({ ...lineHeight, [viewMode]: value })}
      />
    </SettingsGroup>
  );
};

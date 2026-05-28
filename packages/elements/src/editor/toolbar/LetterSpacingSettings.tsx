import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { SettingsGroup, Label, SliderControl } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";

type LetterSpacingSettingsProps = {
  letterSpacing: { mobile?: number; desktop?: number };
  setLetterSpacing: (value: { mobile?: number; desktop?: number }) => void;
};

export const LetterSpacingSettings: React.FC<LetterSpacingSettingsProps> = ({ letterSpacing, setLetterSpacing }) => {
  const { viewMode } = useAppContext();
  const currentLetterSpacing = letterSpacing[viewMode] ?? 0;

  return (
    <SettingsGroup>
      <Label>
        Letter Spacing <ViewModeIcon />
      </Label>
      <SliderControl
        value={currentLetterSpacing}
        min={0}
        max={10}
        step={1}
        onChange={(value) => setLetterSpacing({ ...letterSpacing, [viewMode]: value })}
      />
    </SettingsGroup>
  );
};

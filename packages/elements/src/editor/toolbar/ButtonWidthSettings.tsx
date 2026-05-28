import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { SettingsGroup, Label, Select } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";
import { ButtonWidthType } from "../../elements/ElementProps";

type ButtonWidthSettingsProps = {
  width: { mobile?: ButtonWidthType; desktop?: ButtonWidthType };
  setWidth: (value: { mobile?: ButtonWidthType; desktop?: ButtonWidthType }) => void;
};

export const ButtonWidthSettings: React.FC<ButtonWidthSettingsProps> = ({
  width,
  setWidth
}) => {
  const { viewMode } = useAppContext();
  const currentWidth = width[viewMode] ?? 'auto';

  const handleWidthChange = (newWidth: ButtonWidthType) => {
    setWidth({ ...width, [viewMode]: newWidth });
  };

  return (
    <SettingsGroup>
      <Label>
        Button width <ViewModeIcon />
      </Label>
      <Select
        value={currentWidth}
        onChange={(e) => handleWidthChange(e.target.value as ButtonWidthType)}
      >
        <option value="auto">Fluid</option>
        <option value="full">Fill Width</option>
      </Select>
    </SettingsGroup>
  );
};
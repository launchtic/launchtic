import React, { useState, useRef } from "react";
import { useAppContext } from "../../contexts/AppContext";
import { SettingsGroup, Label, ColorPickerWrapper, ColorCircle, ResetIconLarge } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";
import { ColorPickerPopup } from "../common/settings/ColorPickerPopup";
import { rgbaToString } from "../../utils/helpers";

type IconColorSettingsProps = {
  iconColor: { mobile?: string; desktop?: string };
  setIconColor: (value: { mobile?: string; desktop?: string }) => void;
};

export const IconColorSettings: React.FC<IconColorSettingsProps> = ({ iconColor, setIconColor }) => {
  const { viewMode } = useAppContext();
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const colorCircleRef = useRef<HTMLDivElement>(null);
  const currentColor = iconColor[viewMode] ?? "rgba(0, 0, 0, 1)";

  const handleColorChange = (newColor: { rgba: { r: number; g: number; b: number; a?: number } }) => {
    setIconColor({ ...iconColor, [viewMode]: rgbaToString(newColor.rgba) });
  };

  const handleReset = () => {
    setIconColor({ ...iconColor, [viewMode]: "rgba(0, 0, 0, 1)" });
  };

  return (
    <SettingsGroup>
      <Label>
        Icon Color <ViewModeIcon />
      </Label>
      <ColorPickerWrapper>
        <div ref={colorCircleRef}>
          <ColorCircle color={currentColor} onClick={() => setDisplayColorPicker(true)} />
        </div>
        <ResetIconLarge onClick={handleReset} title="Reset color">
          <i className="fas fa-ban"></i>
        </ResetIconLarge>
        {displayColorPicker && (
          <ColorPickerPopup 
            color={currentColor} 
            onChange={handleColorChange} 
            onClose={() => setDisplayColorPicker(false)}
            anchorEl={colorCircleRef.current}
          />
        )}
      </ColorPickerWrapper>
    </SettingsGroup>
  );
};
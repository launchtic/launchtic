import React, { useState, useRef } from "react";
import { useAppContext } from "../../contexts/AppContext";
import { SettingsGroup, Label, ColorPickerWrapper, ColorCircle, ResetIconLarge } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";
import { ColorPickerPopup } from "../common/settings/ColorPickerPopup";
import { rgbaToString } from "../../utils/helpers";

type TextColorSettingsProps = {
  color: { mobile?: string; desktop?: string };
  setColor: (value: { mobile?: string; desktop?: string }) => void;
  label?: string; // Added label prop
  defaultColor?: string; // Optional default color
};

export const TextColorSettings: React.FC<TextColorSettingsProps> = ({ 
  color, 
  setColor, 
  label = "Text Color", // Default label
  defaultColor = "rgba(0, 0, 0, 1)" // Default color value
}) => {
  const { viewMode } = useAppContext();
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const colorCircleRef = useRef<HTMLDivElement>(null);
  const currentColor = color[viewMode] ?? (viewMode === 'mobile' ? color.desktop ?? defaultColor : defaultColor);

  const handleColorChange = (newColor: { rgba: { r: number; g: number; b: number; a?: number } }) => {
    setColor({ ...color, [viewMode]: rgbaToString(newColor.rgba) });
  };

  const handleReset = () => {
    setColor({ ...color, [viewMode]: defaultColor });
  };

  return (
    <SettingsGroup>
      <Label>
        {label} <ViewModeIcon />
      </Label>
      <ColorPickerWrapper>
        <div ref={colorCircleRef}>
          <ColorCircle 
            color={currentColor} 
            onClick={() => setDisplayColorPicker(true)} 
          />
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
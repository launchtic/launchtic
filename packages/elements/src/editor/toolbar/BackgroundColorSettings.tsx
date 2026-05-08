import React, { useState, useRef } from "react";
import { useAppContext } from "../../contexts/AppContext";
import { Label, SettingsGroup, ColorPickerWrapper, ColorCircle, ResetIconLarge } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";
import { rgbaToString } from "../../utils/helpers";
import { ColorPickerPopup } from "../common/settings/ColorPickerPopup";

type BackgroundColorSettingsProps = {
  backgroundColor: { mobile?: string; desktop?: string };
  setBackgroundColor: (updatedColor: { mobile?: string; desktop?: string }) => void;
  label?: string;
  defaultColor?: string; // Added defaultColor prop
};

export const BackgroundColorSettings: React.FC<BackgroundColorSettingsProps> = ({
  backgroundColor,
  setBackgroundColor,
  label = "Background Color",
  defaultColor = "rgba(255, 255, 255, 1)", // Default color value
}) => {
  const { viewMode } = useAppContext();
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const colorCircleRef = useRef<HTMLDivElement>(null);

  const currentColor = backgroundColor[viewMode] ?? (viewMode === 'mobile' ? backgroundColor.desktop ?? defaultColor : defaultColor);

  const handleColorChange = (color: { rgba: { r: number; g: number; b: number; a?: number } }) => {
    setBackgroundColor({ ...backgroundColor, [viewMode]: rgbaToString(color.rgba) });
  };

  const handleReset = () => {
    setBackgroundColor({ ...backgroundColor, [viewMode]: defaultColor });
  };

  return (
    <SettingsGroup>
      <Label>
        {label} <ViewModeIcon />
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
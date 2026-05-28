import React, { useState, useRef } from "react";
import { useAppContext } from "../../contexts/AppContext";
import { Label, SettingsGroup, ColorPickerWrapper, ColorCircle, ResetIconLarge } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";
import { rgbaToString } from "../../utils/helpers"; 
import { ColorPickerPopup } from "../common/settings/ColorPickerPopup";

type InnerBackgroundSettingsProps = {
  innerBackground: { mobile?: string; desktop?: string };
  setInnerBackground: (updatedColor: { mobile?: string; desktop?: string }) => void;
};

export const InnerBackgroundSettings: React.FC<InnerBackgroundSettingsProps> = ({
  innerBackground,
  setInnerBackground,
}) => {
  const { viewMode } = useAppContext();
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const colorCircleRef = useRef<HTMLDivElement>(null);

  const currentColor = innerBackground[viewMode] ?? "rgba(255, 255, 255, 1)";

  const handleColorChange = (color: { rgba: { r: number; g: number; b: number; a?: number } }) => {
    setInnerBackground({ ...innerBackground, [viewMode]: rgbaToString(color.rgba) });
  };

  const handleReset = () => {
    setInnerBackground({ ...innerBackground, [viewMode]: undefined });
  };

  return (
    <SettingsGroup>
      <Label>
        Inner Background <ViewModeIcon />
      </Label>
      <ColorPickerWrapper>
        <div ref={colorCircleRef}>
          <ColorCircle color={currentColor} onClick={() => setDisplayColorPicker(true)} />
        </div>
        <ResetIconLarge onClick={handleReset} title="Remove color">
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
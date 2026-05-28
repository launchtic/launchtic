import React, { useState, useRef } from "react";
import { useAppContext } from "../../contexts/AppContext";
import { 
  SettingsGroup, 
  Label, 
  Select, 
  SliderControl, 
  ColorPickerWrapper, 
  ColorCircle, 
  Divider,
  ResetIconLarge
} from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";
import { ColorPickerPopup } from "../common/settings/ColorPickerPopup";
import { rgbaToString } from "../../utils/helpers";
import { BorderProps } from "../../elements/ElementProps";

type BorderSettingsProps = {
  border?: BorderProps['border'];
  mobileBorder?: BorderProps['mobileBorder'];
  setBorder: (value: any) => void;
  setMobileBorder: (value: any) => void;
};

export const BorderSettings: React.FC<BorderSettingsProps> = ({
  border = {
    color: "rgba(0, 0, 0, 1)",
    radius: 0,
    width: 1,
    style: "none",
    type: "fullBorder"
  },
  mobileBorder = {
    color: "rgba(0, 0, 0, 1)",
    radius: 0,
    width: 1,
    style: "none",
    type: "fullBorder"
  },
  setBorder,
  setMobileBorder
}) => {
  const { viewMode } = useAppContext();
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const colorCircleRef = useRef<HTMLDivElement>(null);
  
  // Determine current values based on viewMode
  const currentValues = viewMode === "desktop" ? border : {
    ...border,
    ...mobileBorder
  };
  
  const currentRadius = currentValues.radius ?? 0;
  const currentStyle = currentValues.style ?? 'none';
  const currentColor = currentValues.color ?? "rgba(0, 0, 0, 1)";
  const currentWidth = currentValues.width ?? 1;
  const currentType = currentValues.type ?? "fullBorder";

  // Update functions
  const updateBorderProperty = (property: string, value: any) => {
    if (viewMode === "desktop") {
      setBorder({
        ...border,
        [property]: value
      });
    } else {
      setMobileBorder({
        ...mobileBorder,
        [property]: value
      });
    }
  };

  const handleBorderColorChange = (color: { rgba: { r: number; g: number; b: number; a?: number } }) => {
    updateBorderProperty("color", rgbaToString(color.rgba));
  };

  const handleBorderColorReset = () => {
    updateBorderProperty("color", "rgba(0, 0, 0, 1)");
  };

  return (
    <SettingsGroup>
      <Label>
        Border <ViewModeIcon />
      </Label>
      <Divider/>
      <Label $small>Border radius</Label>
      <SliderControl
        value={currentRadius}
        min={0}
        step={2}
        max={200}
        onChange={(value) => updateBorderProperty("radius", value)}
      />
      <Label $small>Style</Label>
      <Select
        value={currentStyle}
        onChange={(e) => {
          const newStyle = e.target.value;
          updateBorderProperty("style", newStyle);
        }}
      >
        <option value="none">None</option>
        <option value="solid">Solid</option>
        <option value="dotted">Dotted</option>
        <option value="dashed">Dashed</option>
      </Select>

      {currentStyle !== "none" && (
      <>
        <Label $small>Color</Label>
        <ColorPickerWrapper>
          <div ref={colorCircleRef}>
            <ColorCircle color={currentColor} onClick={() => setDisplayColorPicker(true)} />
          </div>
          <ResetIconLarge onClick={handleBorderColorReset} title="Remove color">
            <i className="fas fa-ban"></i>
          </ResetIconLarge>
          {displayColorPicker && (
            <ColorPickerPopup
              color={currentColor}
              onChange={handleBorderColorChange}
              onClose={() => setDisplayColorPicker(false)}
              anchorEl={colorCircleRef.current}
            />
          )}
        </ColorPickerWrapper>

        <Label $small>Width</Label>
        <SliderControl
          value={currentWidth}
          min={0}
          max={10}
          onChange={(value) => updateBorderProperty("width", value)}
        />

        <Label $small>Type</Label>
        <Select
          value={currentType}
          onChange={(e) => updateBorderProperty("type", e.target.value)}
        >
          <option value="fullBorder">Full Border</option>
          <option value="bottomOnly">Bottom Only</option>
          <option value="topOnly">Top Only</option>
          <option value="topAndBottom">Top and Bottom</option>
        </Select>
      </>
    )}

    </SettingsGroup>
  );
};
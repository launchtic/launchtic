import React, { useState, useEffect, useRef } from "react";
import { SettingsGroup, SettingsGroupLarge, Label, ColorPickerWrapper, ColorCircle, ResetIconLarge, SliderControl, Select } from "../common/SettingsUI";
import { ColorPickerPopup } from "../common/settings/ColorPickerPopup";
import { ButtonHoverProps, ButtonHoverEffectStyle } from "../../elements/ElementProps";
import { rgbaToString } from "../../utils/helpers";

type ButtonHoverSettingsProps = {
  hover?: ButtonHoverProps;
  setHover: (value: ButtonHoverProps) => void;
};

export const ButtonHoverSettings: React.FC<ButtonHoverSettingsProps> = ({
  hover = {},
  setHover
}) => {
  const [displayBgColorPicker, setDisplayBgColorPicker] = useState(false);
  const [displayTextColorPicker, setDisplayTextColorPicker] = useState(false);
  const [displaySubTextColorPicker, setDisplaySubTextColorPicker] = useState(false);
  
  // Refs for color circles
  const bgColorRef = useRef<HTMLDivElement>(null);
  const textColorRef = useRef<HTMLDivElement>(null);
  const subTextColorRef = useRef<HTMLDivElement>(null);

  // Default values
  const backgroundColor = hover.backgroundColor ?? 'rgb(25, 118, 210, 1)';
  const textColor = hover.textColor ?? 'rgba(255, 255, 255, 1)';
  const subTextColor = hover.subTextColor ?? 'rgba(255, 255, 255, 1)';
  const [effectStyle, setEffectStyle] = useState<ButtonHoverEffectStyle>(hover.effectStyle ?? "none");
  const [offset, setOffset] = useState(hover.offset ?? 1);

  // Effect to update hover prop when effectStyle or offset changes
  useEffect(() => {
    let transform: string | undefined;

    // Automatically generate transform based on style and offset
    switch (effectStyle) {
      case "none":
        transform = undefined;
        break;
      case "zoom":
        // Calculate scale factor dynamically
        const scaleFactor = 1 + (offset / 100);
        transform = `scale(${scaleFactor})`;
        break;
      case "slide":
        transform = `translateX(${offset}px)`;
        break;
      case "float":
        transform = `translateY(${offset}px)`;
        break;
    }

    setHover({
      ...hover, 
      effectStyle, 
      transform, 
      offset: effectStyle === "none" ? undefined : offset
    });
  }, [effectStyle, offset]);

  const handleBackgroundColorChange = (color: { rgba: { r: number; g: number; b: number; a?: number } }) => {
    setHover({ ...hover, backgroundColor: rgbaToString(color.rgba) });
  };

  const handleTextColorChange = (color: { rgba: { r: number; g: number; b: number; a?: number } }) => {
    setHover({ ...hover, textColor: rgbaToString(color.rgba) });
  };

  const handleSubTextColorChange = (color: { rgba: { r: number; g: number; b: number; a?: number } }) => {
    setHover({ ...hover, subTextColor: rgbaToString(color.rgba) });
  };

  const handleResetBgColor = () => {
    setHover({ ...hover, backgroundColor: undefined });
  };

  const handleResetTextColor = () => {
    setHover({ ...hover, textColor: undefined });
  };

  const handleResetSubTextColor = () => {
    setHover({ ...hover, subTextColor: undefined });
  };

  // Improved:
  const handleEffectStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStyle = e.target.value as ButtonHoverEffectStyle;
    // Reset offset based on the new style
    const newOffset = getInitialOffset(newStyle);
    // Update both effect style and offset
    setEffectStyle(newStyle);
    setOffset(newOffset);
  };

  // Added helper method to intelligently set initial offset
  const getInitialOffset = (style: ButtonHoverEffectStyle): number => {
    switch (style) {
      case "zoom": return 10; // Default to moderate growth
      case "slide":
      case "float": return 0; // Default to no movement
      default: return 1;
    }
  };

  const handleOffsetChange = (value: number) => {
    setOffset(value);
  };

  return (
    <>
      <SettingsGroupLarge>
        <Label>Hover effect</Label>
        <SettingsGroup>
          <Label>Text color</Label>
          <ColorPickerWrapper>
            <div ref={textColorRef}>
              <ColorCircle color={textColor} onClick={() => setDisplayTextColorPicker(true)} />
            </div>
            <ResetIconLarge onClick={handleResetTextColor} title="Remove color">
              <i className="fas fa-ban"></i>
            </ResetIconLarge>
            {displayTextColorPicker && (
              <ColorPickerPopup
                color={textColor}
                onChange={handleTextColorChange}
                onClose={() => setDisplayTextColorPicker(false)}
                anchorEl={textColorRef.current}
              />
            )}
          </ColorPickerWrapper>
        </SettingsGroup>

        <SettingsGroup>
          <Label>Background color</Label>
          <ColorPickerWrapper>
            <div ref={bgColorRef}>
              <ColorCircle color={backgroundColor} onClick={() => setDisplayBgColorPicker(true)} />
            </div>
            <ResetIconLarge onClick={handleResetBgColor} title="Remove color">
              <i className="fas fa-ban"></i>
            </ResetIconLarge>
            {displayBgColorPicker && (
              <ColorPickerPopup
                color={backgroundColor}
                onChange={handleBackgroundColorChange}
                onClose={() => setDisplayBgColorPicker(false)}
                anchorEl={bgColorRef.current}
              />
            )}
          </ColorPickerWrapper>
        </SettingsGroup>

        <SettingsGroup>
          <Label>Subtext color</Label>
          <ColorPickerWrapper>
            <div ref={subTextColorRef}>
              <ColorCircle color={subTextColor} onClick={() => setDisplaySubTextColorPicker(true)} />
            </div>
            <ResetIconLarge onClick={handleResetSubTextColor} title="Remove color">
              <i className="fas fa-ban"></i>
            </ResetIconLarge>
            {displaySubTextColorPicker && (
              <ColorPickerPopup
                color={subTextColor}
                onChange={handleSubTextColorChange}
                onClose={() => setDisplaySubTextColorPicker(false)}
                anchorEl={subTextColorRef.current}
              />
            )}
          </ColorPickerWrapper>
        </SettingsGroup>

        <SettingsGroup>
          <Label>Style</Label>
          <Select
            value={effectStyle}
            onChange={handleEffectStyleChange}
          >
            <option value="none">None</option>
            <option value="zoom">Zoom</option>
            <option value="slide">Slide</option>
            <option value="float">Float</option>
          </Select>
        </SettingsGroup>

        {effectStyle !== 'none' && (
          <SettingsGroup>
            <Label>
              {effectStyle === 'zoom' ? 'Growth' : 'Movement'} on hover
            </Label>
            <SliderControl
              value={offset}
              min={effectStyle === 'zoom' ? 0 : -20}  // Different min for zoom
              max={effectStyle === 'zoom' ? 20 : 20}
              step={1}
              onChange={handleOffsetChange}
            />
          </SettingsGroup>
        )}
      </SettingsGroupLarge>
    </>
  );
};
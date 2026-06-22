import React, { useState, useRef } from "react";
import {
  Label,
  SettingsGroup,
  InputWrapper,
  Input,
  CheckboxWrapper,
  CheckboxInput,
  Select,
  Divider,
  ColorPickerWrapper,
  ColorCircle,
  ResetIconLarge
} from "../common/SettingsUI";
import { ColorPickerPopup } from "../common/settings/ColorPickerPopup";
import { rgbaToString } from "../../utils/helpers";
import { FieldDetailProps } from "../../elements/ElementProps";
import { getInputTypeOptions } from '../../utils/formHelpers';

type FieldDetailSettingsProps = {
  inputDetail?: FieldDetailProps;
  setInputDetail: (updatedInput: any) => void;
};

export const FieldDetailSettings: React.FC<FieldDetailSettingsProps> = ({
  inputDetail = {},
  setInputDetail,
}) => {
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const colorCircleRef = useRef<HTMLDivElement>(null);

  // Set default values if properties are undefined
  const inputType = inputDetail?.type || "email";
  // Use ?? not || so an explicitly-cleared placeholder ("") stays empty — with
  // || the controlled input snapped back to "Email" the moment you deleted it.
  const placeholder = inputDetail?.placeholder ?? "Email";
  const placeholderColor = inputDetail?.placeholderColor || "rgba(170, 170, 170, 1)";
  const isOptional = inputType === "email" ? false : (inputDetail?.isOptional || false);

  // Input type options with default placeholders
  const inputTypeOptions = getInputTypeOptions();

  // Update input properties
  const updateInputProperty = (property: keyof FieldDetailProps, value: any) => {
    setInputDetail({
      ...inputDetail,
      [property]: value,
    });
  };

  // Handle type change with auto placeholder
  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    
    // Find the selected option to get its default placeholder
    const selectedOption = inputTypeOptions.find(option => option.value === newType);
    const defaultPlaceholder = selectedOption?.placeholder || "";
    const defaultName = selectedOption?.name || newType;

    // For email type, always set isOptional to false
    // For other types, preserve the current isOptional value
    const newIsOptional = newType === "email" ? false : (inputDetail?.isOptional || false);
    
    // Update type, placeholder and isOptional
    setInputDetail({
      ...inputDetail,
      type: newType,    
      name: defaultName,
      placeholder: defaultPlaceholder,
      isOptional: newIsOptional
    });
  };

  // Handle color change
  const handleColorChange = (color: { rgba: { r: number; g: number; b: number; a?: number } }) => {
    updateInputProperty("placeholderColor", rgbaToString(color.rgba));
  };

  // Handle color reset
  const handleColorReset = () => {
    updateInputProperty("placeholderColor", "rgba(170, 170, 170, 1)");
  };

  return (
    <SettingsGroup>
      <Label>Input type</Label>
      <Select
        value={inputType}
        onChange={handleTypeChange}
      >
        {inputTypeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      
      <Divider />
      
      <Label>Placeholder</Label>
      <InputWrapper>
        <Input
          type="text"
          placeholder="Enter placeholder text"
          value={placeholder}
          onChange={(e) => updateInputProperty("placeholder", e.target.value)}
        />
      </InputWrapper>
      
      <Divider />
      
      <Label>Placeholder color</Label>
      <ColorPickerWrapper>
        <div ref={colorCircleRef}>
          <ColorCircle 
            color={placeholderColor} 
            onClick={() => setDisplayColorPicker(true)} 
          />
        </div>
        <ResetIconLarge onClick={handleColorReset} title="Reset color">
          <i className="fas fa-ban"></i>
        </ResetIconLarge>
        {displayColorPicker && (
          <ColorPickerPopup
            color={placeholderColor}
            onChange={handleColorChange}
            onClose={() => setDisplayColorPicker(false)}
            anchorEl={colorCircleRef.current}
          />
        )}
      </ColorPickerWrapper>
      
      <Divider />
      
      {/* Only show the Optional checkbox when the type is not email */}
      {inputType !== "email" && (
        <CheckboxWrapper>
          <Label>Optional <span className="info-icon">?</span></Label>
          <CheckboxInput
            type="checkbox"
            checked={isOptional}
            onChange={(e) => updateInputProperty("isOptional", e.target.checked)}
          />
        </CheckboxWrapper>
      )}
    </SettingsGroup>
  );
};
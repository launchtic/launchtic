import React, { useState } from "react";
import { StyledInput, ErrorMessage } from "../FieldStyles";

interface StandardInputProps {
  inputType: string;
  placeholder: string;
  placeholderColor: string;
  isOptional: boolean;
  enabled: boolean;
  elementId: string;
  htmlAttrId?: string;
  resolvedProps: any;
  error?: string;
  hasError?: boolean;
}

const StandardInput: React.FC<StandardInputProps> = ({
  inputType,
  placeholder,
  placeholderColor,
  isOptional,
  enabled,
  elementId,
  htmlAttrId,
  resolvedProps,
  error,
  hasError
}) => {
  const [inputValue, setInputValue] = useState("");

  const getInputType = () => {
    switch (inputType) {
      case "email":
        return "email";
      case "password":
        return "password";
      case "number":
        return "number";
      case "date":
        return "date";
      case "datetime-local":
        return "datetime-local";
      case "time":
        return "time";
      case "url":
        return "url";
      case "search":
        return "search";
      default:
        return "text";
    }
  };

  // Build a config object instead of passing each prop individually
  const inputConfig = {
    styles: {
      padding: resolvedProps.padding,
      mobilePadding: resolvedProps.mobilePadding,
      fontSize: resolvedProps.fontSize,
      mobileFontSize: resolvedProps.mobileFontSize,
      backgroundColor: resolvedProps.backgroundColor,
      mobileBackgroundColor: resolvedProps.mobileBackgroundColor,
      color: resolvedProps.color,
      mobileColor: resolvedProps.mobileColor,
      textAlign: resolvedProps.textAlign,
      mobileTextAlign: resolvedProps.mobileTextAlign,
      lineHeight: resolvedProps.lineHeight,
      mobileLineHeight: resolvedProps.mobileLineHeight,
      letterSpacing: resolvedProps.letterSpacing,
      mobileLetterSpacing: resolvedProps.mobileLetterSpacing,
      border: resolvedProps.border,
      mobileBorder: resolvedProps.mobileBorder,
    },
    placeholderColor
  };

  return (
    <>
      <StyledInput 
        id={htmlAttrId || elementId}
        name={resolvedProps.inputDetail?.name || elementId}
        type={getInputType()}
        placeholder={placeholder}
        value={enabled ? "" : inputValue}
        onChange={(e) => {
          if (!enabled) {
            setInputValue(e.target.value);
          }
        }}
        readOnly={enabled}
        required={!isOptional}
        $config={inputConfig}
        $hasError={hasError}
      />
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </>
  );
};

export default StandardInput;
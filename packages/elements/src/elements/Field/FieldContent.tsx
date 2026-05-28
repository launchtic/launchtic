import React from "react";
import StandardInput from "./inputs/StandardInput";
import PhoneInput from "./inputs/PhoneInput";
import CountrySelect from "./inputs/CountrySelect";

interface FieldContentProps {
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

const FieldContent: React.FC<FieldContentProps> = ({
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
  // Shared props for all input components
  const commonProps = {
    placeholder,
    placeholderColor,
    isOptional,
    enabled,
    elementId,
    htmlAttrId,
    resolvedProps,
    error,
    hasError
  };

  // Factory pattern for input types
  switch (inputType) {
    case "phone_number":
    case "tel":
      return <PhoneInput {...commonProps} />;
      
    case "country":
      return <CountrySelect {...commonProps} />;
      
    default:
      return <StandardInput inputType={inputType} {...commonProps} />;
  }
};

export default FieldContent;
import React, { useState, useEffect } from "react";
import { StyledSelect, ErrorMessage } from "../FieldStyles";
import countries from '../countries.json';

interface CountrySelectProps {
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

const CountrySelect: React.FC<CountrySelectProps> = ({
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
  const [selectedCountry, setSelectedCountry] = useState<any>(countries[0] || { flag: "🌐", code: "", dial_code: "" });

  const customerCountry = "US";

  useEffect(() => {
    if (!enabled) {
      const countryCode = customerCountry;
      const foundCountry = countries.find(c => c.code === countryCode);
      if (foundCountry) {
        setSelectedCountry(foundCountry);
      } else {
        const defaultCountry = countries.find(c => c.code === "US") || 
                              { code: "US", dial_code: "+1", name: "United States" };
        setSelectedCountry(defaultCountry);
      }
    } else {
      setSelectedCountry(countries[0] || { code: "", dial_code: "", name: "Select a country" });
    }
  }, [enabled, customerCountry]);

  // Build a config object for styled components
  const selectConfig = {
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
    placeholderColor,
    editorEnabled: enabled
  };

  if (enabled) {
    // Editor mode: render as a select but readonly
    return (
      <>
        <StyledSelect
          id={htmlAttrId || elementId}
          name={resolvedProps.inputDetail?.name || elementId}
          value=""
          onChange={() => {}}
          $config={selectConfig}
          $hasError={hasError}
        >
          <option value="">Choose a country</option>
        </StyledSelect>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </>
    );
  }

  // Preview mode: regular select that the user can choose from
  return (
    <>
      <StyledSelect
        id={htmlAttrId || elementId}
        name={resolvedProps.inputDetail?.name || elementId}
        value={selectedCountry.code || ""}
        onChange={(e) => {
          const selectedCode = e.target.value;
          const foundCountry = countries.find(c => c.code === selectedCode);
          if (foundCountry) {
            setSelectedCountry(foundCountry);
          }
        }}
        required={!isOptional}
        $config={selectConfig}
        $hasError={hasError}
      >
        <option value="">Select a country</option>
        {countries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </StyledSelect>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </>
  );
};

export default CountrySelect;
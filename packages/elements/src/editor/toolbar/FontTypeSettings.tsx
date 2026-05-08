import React from "react";
import Select from "react-select";
import { SettingsGroup, Label, Divider } from "../common/SettingsUI";
import { ViewModeIcon } from "../common/settings/ViewModeIcon";

type FontTypeSettingsProps = {
  fontType?: string;
  setFontType: (value: string) => void;
  fontFamily?: string;
  setFontFamily: (value: string | undefined) => void;
  fontStyle?: string;
  setFontStyle: (value: string | undefined) => void;
};
// Available font type categories
const fontTypeOptions = [
  { label: "Same font as the page", value: "default" },
  { label: "Web Safe Fonts", value: "web-safe" },
  { label: "Google Fonts", value: "google" },
//  { label: "Custom Fonts", value: "custom" },
];

// Web Safe Fonts list
const webSafeFonts = [
  { label: "Georgia, serif", value: "Georgia, serif" },
  { label: '"Times New Roman", Times, serif', value: '"Times New Roman", Times, serif' },
  { label: "Arial, Helvetica, sans-serif", value: "Arial, Helvetica, sans-serif" },
  { label: '"Arial Black", Gadget, sans-serif', value: '"Arial Black", Gadget, sans-serif' },
  { label: '"Comic Sans MS", Chalkboard, sans-serif, cursive', value: '"Comic Sans MS", Chalkboard, sans-serif, cursive' },
  { label: '"Lucida Sans Unicode", "Lucida Grande", sans-serif', value: '"Lucida Sans Unicode", "Lucida Grande", sans-serif' },
  { label: "Tahoma, Geneva, sans-serif", value: "Tahoma, Geneva, sans-serif" },
  { label: '"Trebuchet MS", Helvetica, sans-serif', value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: "Verdana, Geneva, sans-serif", value: "Verdana, Geneva, sans-serif" },
  { label: '"Courier New", Courier, monospace', value: '"Courier New", Courier, monospace' },
  { label: '"Lucida Console", Monaco, monospace', value: '"Lucida Console", Monaco, monospace' },
];

// Google Fonts list
const googleFonts = [
  { label: "Roboto", value: "Roboto" },
  { label: "Open Sans", value: "Open Sans" },
  { label: "Montserrat", value: "Montserrat" },
  { label: "Lato", value: "Lato" },
  { label: "Poppins", value: "Poppins" },
  { label: "Source Sans Pro", value: "Source Sans Pro" },
  { label: "Roboto Condensed", value: "Roboto Condensed" },
  { label: "Oswald", value: "Oswald" },
];

// Font style options
const fontStyleOptions = [
  { label: "Light 300", value: "300" },
  { label: "Light 300 italic", value: "300italic" },
  { label: "Regular", value: "400" },
  { label: "Regular 400 italic", value: "400italic" },
  { label: "Semi-bold 600", value: "600" },
  { label: "Semi-bold 600 italic", value: "600italic" },
  { label: "Bold 700", value: "700" },
  { label: "Bold 700 italic", value: "700italic" },
  { label: "Extra-bold 800", value: "800" },
  { label: "Extra-bold 800 italic", value: "800italic" },
];

// Custom CSS for react-select
const customStyles = {
  control: (base: any) => ({
    ...base,
    fontSize: "13px",
  }),
  menu: (base: any) => ({
    ...base,
    fontSize: "13px",
  }),
  option: (base: any) => ({
    ...base,
    fontSize: "13px",
    padding: "6px 10px",
  }),
};

export const FontTypeSettings: React.FC<FontTypeSettingsProps> = ({
  fontType,
  setFontType,
  fontFamily,
  setFontFamily,
  fontStyle,
  setFontStyle
}) => {
  return (
    <SettingsGroup>
      <Label>
        Font type <ViewModeIcon />
      </Label>
      <Select
        value={fontTypeOptions.find((option) => option.value === fontType) || null}
        onChange={(selectedOption) => {
            setFontType(selectedOption?.value || "default");
            // Switching to "default" clears the family (we inherit page font)
            // but KEEPS fontStyle — weight is a CSS property independent of
            // font-family and works against the inherited page font too.
            if (selectedOption?.value === "default") {
              setFontFamily(undefined);
            }
        }}
        options={fontTypeOptions}
        isSearchable={false}
        styles={customStyles}
        />


      {fontType === "web-safe" && (
        <>
          <Divider/>
          <Select
            value={webSafeFonts.find((font) => font.value === fontFamily) || null}
            onChange={(selectedFont) => setFontFamily(selectedFont?.value || "")}
            options={webSafeFonts}
            isSearchable
            placeholder="Search..."
            styles={customStyles} // Apply custom styles
          />
        </>
      )}

      {fontType === "google" && (
          <>
            <Divider/>
            <Select
              value={googleFonts.find((font) => font.value === fontFamily) || null}
              onChange={(selectedFont) => {
                setFontFamily(selectedFont?.value || undefined);
                if (!fontStyle) {
                  setFontStyle("400");
                }
              }}
              options={googleFonts}
              isSearchable
              placeholder="Search..."
              getOptionLabel={(e) => `${e.label}`}
              styles={{
                ...customStyles,
                option: (base, { data }) => ({
                  ...base,
                  fontFamily: `'${data.value}', sans-serif`,
                  fontSize: "14px",
                }),
              }}
            />
          </>
      )}


      {/*
        Font weight (style) is independent of font-family — works for
        default (inherited page font), web-safe stacks, and Google fonts
        alike. Browsers will faux-bold if the chosen weight isn't loaded
        for that family. Showing this control unconditionally lets the
        user bold a Button/Text without forcing a font swap.
      */}
      <Divider/>
      <Select
        value={fontStyleOptions.find(style => style.value === fontStyle) || null}
        onChange={(selectedStyle) => setFontStyle(selectedStyle?.value || "400")}
        options={fontStyleOptions}
        isSearchable={false}
        placeholder="Weight (Regular, Bold, ...)"
        styles={customStyles}
      />
    </SettingsGroup>
  );
};

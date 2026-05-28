import React, { useState, useEffect, useRef } from "react";
import {
  InputMain,
  StyledInput,
  CountryDropdown,
  CountrySearchInput,
  CountryItem,
  SelectedCountry,
  ErrorMessage
} from "../FieldStyles";
import countries from '../countries.json';

interface PhoneInputProps {
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

const PhoneInput: React.FC<PhoneInputProps> = ({
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const customerCountry = "US";

  // Country selection logic
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
      const usaCountry = countries.find(c => c.code === "US") || 
                        { code: "US", dial_code: "+1", name: "United States" };
      setSelectedCountry(usaCountry);
    }
  }, [enabled, customerCountry]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredCountries = searchText
    ? countries.filter(country => 
        country.name.toLowerCase().includes(searchText.toLowerCase()) ||
        country.dial_code.includes(searchText) ||
        country.code.toLowerCase().includes(searchText.toLowerCase())
      )
    : countries;

  const getFlagClass = (countryCode: string) => {
    if (!countryCode) return "fi fi-xx";
    return `fi fi-${countryCode.toLowerCase()}`;
  };

  const handleSelectCountry = (country: any) => {
    setSelectedCountry(country);
    if (!enabled) {
      setPhoneNumber(`${country.dial_code} `);
    }
    setIsDropdownOpen(false);
  };

  // Build a config object for styled components
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

  const countryConfig = {
    styles: {
      border: resolvedProps.border,
      // Use the SAME backgroundColor as the input — keeps flag area visually
      // unified with the input. (Previous `${color}ee` alpha hack only worked
      // for hex colors and produced invalid CSS for the rgba values stored
      // by ColorPickerPopup → silently fell through to no-background.)
      backgroundColor: resolvedProps.backgroundColor,
      fontSize: resolvedProps.fontSize,
    }
  };

  if (enabled) {
    // Editor mode
    return (
      <InputMain>
        <div style={{ display: 'flex' }}>
          <SelectedCountry 
            $config={countryConfig}
            $hasError={hasError}
            data-dial-code={selectedCountry.dial_code}
          >
            <span className="flag fi fi-us"></span>
          </SelectedCountry>
          
          <StyledInput 
            id={htmlAttrId || elementId}
            name={resolvedProps.inputDetail?.name || elementId}
            type="tel"
            placeholder={placeholder}
            value=""
            readOnly={true}
            $config={{...inputConfig, withCountryCode: true}}
            $hasError={hasError}
          />
        </div>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </InputMain>
    );
  }

  // Preview mode
  return (
    <InputMain>
    <div style={{ display: 'flex' }}>
      <div ref={dropdownRef} style={{ position: 'relative', display: 'flex' }}>
          <SelectedCountry 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            $config={countryConfig}
            $hasError={hasError}
            data-dial-code={selectedCountry.dial_code}
          >
            <span className={`flag ${getFlagClass(selectedCountry.code)}`}></span>
          </SelectedCountry>
          
          <CountryDropdown 
            $isOpen={isDropdownOpen}
            $config={{
              borderRadius: resolvedProps.border?.radius,
              borderColor: resolvedProps.border?.color,
              backgroundColor: resolvedProps.backgroundColor,
            }}
          >
            <CountrySearchInput 
              placeholder="Search country..." 
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            
            {filteredCountries.map((country, index) => (
              <CountryItem 
                key={index} 
                onClick={() => handleSelectCountry(country)}
              >
                <span className={`flag ${getFlagClass(country.code)}`}></span>
                <span className="country-name">{country.name}</span>
                <span className="dial-code">{country.dial_code}</span>
              </CountryItem>
            ))}
          </CountryDropdown>
        </div>
        
        <StyledInput 
          id={htmlAttrId || elementId}
          name={resolvedProps.inputDetail?.name || elementId}
          type="tel"
          placeholder={placeholder}
          value={phoneNumber}
          onFocus={() => {
            if (!phoneNumber) {
              setPhoneNumber(`${selectedCountry.dial_code} `);
            }
          }}
          onChange={(e) => {
            let newValue = e.target.value;
            const dialCodeWithSpace = `${selectedCountry.dial_code} `;
            
            if (!newValue.startsWith(dialCodeWithSpace)) {
              if (newValue.length < dialCodeWithSpace.length) {
                setPhoneNumber(dialCodeWithSpace);
                return;
              }
            }
            
            const afterDialCode = newValue.substring(dialCodeWithSpace.length);
            const numbersOnly = afterDialCode.replace(/\D/g, '');
            
            setPhoneNumber(dialCodeWithSpace + numbersOnly);
          }}
          onKeyDown={(e) => {
            const dialCodeWithSpace = `${selectedCountry.dial_code} `;
            
            if (e.key === 'Backspace') {
              const cursorPosition = e.currentTarget.selectionStart || 0;
              if (cursorPosition <= dialCodeWithSpace.length) {
                e.preventDefault();
              }
            }
          }}
          required={!isOptional}
          $config={{...inputConfig, withCountryCode: true}}
          $hasError={hasError}
        />
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </InputMain>
  );
};

export default PhoneInput;
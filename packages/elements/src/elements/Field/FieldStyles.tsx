import styled, { css } from "styled-components";

// Type definitions for config objects
interface StyleConfig {
  padding?: any;
  mobilePadding?: any;
  fontSize?: number;
  mobileFontSize?: number;
  backgroundColor?: string;
  mobileBackgroundColor?: string;
  color?: string;
  mobileColor?: string;
  textAlign?: string;
  mobileTextAlign?: string;
  lineHeight?: number;
  mobileLineHeight?: number;
  letterSpacing?: number;
  mobileLetterSpacing?: number;
  border?: any;
  mobileBorder?: any;
}

interface InputConfig {
  styles: StyleConfig;
  placeholderColor?: string;
  withCountryCode?: boolean;
}

interface SelectConfig extends InputConfig {
  editorEnabled?: boolean;
}

interface CountryConfig {
  styles: StyleConfig;
}

// Main container for input components
export const InputMain = styled.div`
  position: relative;
  width: 100%;
`;

// Optimized StyledInput with config object
export const StyledInput = styled.input<{
  $config: InputConfig;
  $hasError?: boolean;
}>`
  width: 100%;
  outline: none;
  text-indent: 10px;
  appearance: none;
  
  ${props => props.$config.withCountryCode && `
    border-top-left-radius: unset !important;
    border-bottom-left-radius: unset !important;
    height: unset !important;
  `}

  ${({ $config }) => {
    const { styles, placeholderColor } = $config;
    
    return css`
      ${styles.padding && `padding: ${styles.padding.paddingTop}px ${styles.padding.paddingRight}px ${styles.padding.paddingBottom}px ${styles.padding.paddingLeft}px;`}

      ${styles.fontSize && `font-size: ${styles.fontSize}px;`}
      ${styles.backgroundColor && `background-color: ${styles.backgroundColor};`}
      ${styles.color && `color: ${styles.color};`}
      ${styles.textAlign && `text-align: ${styles.textAlign};`}
      ${styles.lineHeight && `line-height: ${styles.lineHeight}px;`}
      ${styles.letterSpacing !== undefined && `letter-spacing: ${styles.letterSpacing}px;`}

      ${styles.border && css`
        ${styles.border.radius !== undefined && `border-radius: ${styles.border.radius}px;`}
        ${styles.border.style && `border-style: ${styles.border.style};`}
        ${styles.border.color && `border-color: ${styles.border.color};`}
        ${styles.border.width !== undefined && styles.border.type === "fullBorder" && `border-width: ${styles.border.width}px;`}
        ${styles.border.width !== undefined && styles.border.type === "topOnly" && `border-width: ${styles.border.width}px 0px 0px;`}
        ${styles.border.width !== undefined && styles.border.type === "bottomOnly" && `border-width: 0px 0px ${styles.border.width}px;`}
        ${styles.border.width !== undefined && styles.border.type === "topAndBottom" && `border-width: ${styles.border.width}px 0px;`}
      `}

      ${styles.border && css`
        ${styles.border.style && `border-style: ${styles.border.style};`}
        ${styles.border.color && `border-color: ${styles.border.color};`}
        ${styles.border.radius !== undefined && `border-radius: ${styles.border.radius}px;`}

        ${styles.border.type === "fullBorder" && styles.border.width && `border-width: ${styles.border.width}px;`}
        ${styles.border.type === "bottomOnly" && styles.border.width && `border-width: 0px 0px ${styles.border.width}px;`}
        ${styles.border.type === "topOnly" && styles.border.width && `border-width: ${styles.border.width}px 0px 0px;`}
        ${styles.border.type === "topAndBottom" && styles.border.width && `border-width: ${styles.border.width}px 0px;`}
      `}
      &::placeholder {
        ${placeholderColor && `color: ${placeholderColor};`}
        opacity: 1;
      }
      
      &::-webkit-input-placeholder {
        ${placeholderColor && `color: ${placeholderColor};`}
        opacity: 1;
      }
      
      &::-moz-placeholder {
        ${placeholderColor && `color: ${placeholderColor};`}
        opacity: 1;
      }
      
      &:-ms-input-placeholder {
        ${placeholderColor && `color: ${placeholderColor};`}
        opacity: 1;
      }
    `;
  }}

  ${({ $hasError, $config }) => $hasError && css`
    border-color: #e53e3e !important;
    box-shadow: 0 0 0 1px #e53e3e !important;
    
    ${$config.withCountryCode && css`
      border-left: 1px solid #e53e3e !important;
    `}
  `}

  @media (max-width: 800px) {
    ${({ $config }) => {
      const { styles } = $config;
      
      return css`

        ${styles.mobilePadding && `padding: ${styles.mobilePadding.paddingTop}px ${styles.mobilePadding.paddingRight}px ${styles.mobilePadding.paddingBottom}px ${styles.mobilePadding.paddingLeft}px;`}

        ${styles.mobileFontSize && `font-size: ${styles.mobileFontSize}px;`}
        ${styles.mobileBackgroundColor && `background-color: ${styles.mobileBackgroundColor};`}
        ${styles.mobileColor && `color: ${styles.mobileColor};`}
        ${styles.mobileTextAlign && `text-align: ${styles.mobileTextAlign};`}
        ${styles.mobileLineHeight && `line-height: ${styles.mobileLineHeight}px;`}
        ${styles.mobileLetterSpacing !== undefined && `letter-spacing: ${styles.mobileLetterSpacing}px;`}

        ${styles.mobileBorder && css`
          ${styles.mobileBorder.radius !== undefined && `border-radius: ${styles.mobileBorder.radius}px;`}
          ${styles.mobileBorder.style && `border-style: ${styles.mobileBorder.style};`}
          ${styles.mobileBorder.color && `border-color: ${styles.mobileBorder.color};`}
          ${styles.mobileBorder.width !== undefined && styles.mobileBorder.type === "fullBorder" && `border-width: ${styles.mobileBorder.width}px;`}
          ${styles.mobileBorder.width !== undefined && styles.mobileBorder.type === "topOnly" && `border-width: ${styles.mobileBorder.width}px 0px 0px;`}
          ${styles.mobileBorder.width !== undefined && styles.mobileBorder.type === "bottomOnly" && `border-width: 0px 0px ${styles.mobileBorder.width}px;`}
          ${styles.mobileBorder.width !== undefined && styles.mobileBorder.type === "topAndBottom" && `border-width: ${styles.mobileBorder.width}px 0px;`}
        `}
      `;
    }}
  }
`;

// Optimized StyledSelect with config object
export const StyledSelect = styled.select<{
  $config: SelectConfig;
  $hasError?: boolean;
}>`
  width: 100%;
  outline: none;
  text-indent: 10px;

  /* Force option items to readable colors regardless of the select's text
     color. Native <option> inherits color from <select>, but the dropdown
     popup uses the OS theme (usually light) — a white "color" on the
     select makes options invisible. Lock options to black-on-white. */
  & > option {
    color: #000;
    background-color: #fff;
  }

  ${props => props.$config.withCountryCode && `
    padding-left: 80px;
  `}

  ${props => props.$config.editorEnabled && `
    pointer-events: none;
  `}

  ${({ $config }) => {
    const { styles } = $config;
    
    return css`
      ${styles.padding && `padding: ${styles.padding.paddingTop}px ${styles.padding.paddingRight}px ${styles.padding.paddingBottom}px ${styles.padding.paddingLeft}px;`}

      ${styles.fontSize && `font-size: ${styles.fontSize}px;`}
      ${styles.backgroundColor && `background-color: ${styles.backgroundColor};`}
      ${styles.color && `color: ${styles.color};`}
      ${styles.textAlign && `text-align: ${styles.textAlign};`}
      ${styles.lineHeight && `line-height: ${styles.lineHeight}px;`}
      ${styles.letterSpacing !== undefined && `letter-spacing: ${styles.letterSpacing}px;`}

      ${styles.border && css`
        ${styles.border.radius !== undefined && `border-radius: ${styles.border.radius}px;`}
        ${styles.border.style && `border-style: ${styles.border.style};`}
        ${styles.border.color && `border-color: ${styles.border.color};`}
        ${styles.border.width !== undefined && styles.border.type === "fullBorder" && `border-width: ${styles.border.width}px;`}
        ${styles.border.width !== undefined && styles.border.type === "topOnly" && `border-width: ${styles.border.width}px 0px 0px;`}
        ${styles.border.width !== undefined && styles.border.type === "bottomOnly" && `border-width: 0px 0px ${styles.border.width}px;`}
        ${styles.border.width !== undefined && styles.border.type === "topAndBottom" && `border-width: ${styles.border.width}px 0px;`}
      `}
    `;
  }}

  ${({ $hasError }) => $hasError && css`
    border-color: #e53e3e !important;
    box-shadow: 0 0 0 1px #e53e3e !important;

    &:focus {
      border-color: #e53e3e !important;
      box-shadow: 0 0 0 2px rgba(229, 62, 62, 0.2) !important;
    }
  `}

  @media (max-width: 800px) {
    ${({ $config }) => {
      const { styles } = $config;
      
      return css`

        ${styles.mobilePadding && `padding: ${styles.mobilePadding.paddingTop}px ${styles.mobilePadding.paddingRight}px ${styles.mobilePadding.paddingBottom}px ${styles.mobilePadding.paddingLeft}px;`}

        ${styles.mobileFontSize && `font-size: ${styles.mobileFontSize}px;`}
        ${styles.mobileBackgroundColor && `background-color: ${styles.mobileBackgroundColor};`}
        ${styles.mobileColor && `color: ${styles.mobileColor};`}
        ${styles.mobileTextAlign && `text-align: ${styles.mobileTextAlign};`}
        ${styles.mobileLineHeight && `line-height: ${styles.mobileLineHeight}px;`}
        ${styles.mobileLetterSpacing !== undefined && `letter-spacing: ${styles.mobileLetterSpacing}px;`}

        ${styles.mobileBorder && css`
          ${styles.mobileBorder.radius !== undefined && `border-radius: ${styles.mobileBorder.radius}px;`}
          ${styles.mobileBorder.style && `border-style: ${styles.mobileBorder.style};`}
          ${styles.mobileBorder.color && `border-color: ${styles.mobileBorder.color};`}
          ${styles.mobileBorder.width !== undefined && styles.mobileBorder.type === "fullBorder" && `border-width: ${styles.mobileBorder.width}px;`}
          ${styles.mobileBorder.width !== undefined && styles.mobileBorder.type === "topOnly" && `border-width: ${styles.mobileBorder.width}px 0px 0px;`}
          ${styles.mobileBorder.width !== undefined && styles.mobileBorder.type === "bottomOnly" && `border-width: 0px 0px ${styles.mobileBorder.width}px;`}
          ${styles.mobileBorder.width !== undefined && styles.mobileBorder.type === "topAndBottom" && `border-width: ${styles.mobileBorder.width}px 0px;`}
        `}
      `;
    }}
  }
`;

// Country dropdown components with config
export const CountryDropdown = styled.div<{
  $isOpen: boolean;
  $config?: {
    borderRadius?: number;
    borderColor?: string;
    backgroundColor?: string;
  };
}>`
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  min-width: 250px;
  max-height: 300px;
  overflow-y: auto;
  background-color: ${props => props.$config?.backgroundColor || "#fff"};
  border: 1px solid ${props => props.$config?.borderColor || "#ccc"};
  border-radius: ${props => props.$config?.borderRadius ? `${props.$config.borderRadius}px` : "4px"};
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  display: ${props => props.$isOpen ? "block" : "none"};
`;

export const CountrySearchInput = styled.input`
  width: 100%;
  padding: 10px;
  border: none;
  border-bottom: 1px solid #eee;
  outline: none;
`;

export const CountryItem = styled.div`
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  
  &:hover {
    background-color: #f5f5f5;
  }
  
  .flag {
    margin-right: 8px;
  }
  
  .country-name {
    flex-grow: 1;
  }
  
  .dial-code {
    color: #666;
  }
`;

export const SelectedCountry = styled.div<{
  $config: CountryConfig;
  $hasError?: boolean;
}>`
  outline: none;
  text-indent: 10px;
  appearance: none;

  ${({ $config }) => {
    const { styles } = $config;
    return css`
      ${styles.fontSize && `font-size: ${styles.fontSize}px;`}
      /* Default white so the flag area matches the <input>'s UA default white
         when user hasn't set a backgroundColor. Without this fallback the
         div stays transparent (no preflight rule for div in either env)
         while the input shows white → visual mismatch. */
      background-color: ${styles.backgroundColor || "#ffffff"};

      ${styles.border && css`
        border: 1px solid ${styles.border.color || "#ccc"};
        ${styles.border.radius !== undefined && `border-radius: ${styles.border.radius}px;`}
        ${styles.border.radius !== undefined && `border-top-left-radius: ${styles.border.radius}px;`}
        ${styles.border.radius !== undefined && `border-bottom-left-radius: ${styles.border.radius}px;`}
        ${styles.border.style && `border-style: ${styles.border.style};`}
        
        ${styles.border.width !== undefined && styles.border.type === "fullBorder" && `border-width: ${styles.border.width}px;`}
        ${styles.border.width !== undefined && styles.border.type === "topOnly" && `border-width: ${styles.border.width}px 0px 0px;`}
        ${styles.border.width !== undefined && styles.border.type === "bottomOnly" && `border-width: 0px 0px ${styles.border.width}px;`}
        ${styles.border.width !== undefined && styles.border.type === "topAndBottom" && `border-width: ${styles.border.width}px 0px;`}
        ${styles.border.width !== undefined && !styles.border.type && `border-width: ${styles.border.width}px;`}
      `}
    `;
  }}

  display: flex !important;
  width: unset !important;
  border-top-right-radius: unset !important;
  border-bottom-right-radius: unset !important;
  border-right: none !important;
  padding: 0 9px 0 9px !important;

  ${({ $hasError }) => $hasError && css`
    border-color: #e53e3e !important;
    box-shadow: 0 0 0 1px #e53e3e !important;
  `}
`;

export const ErrorMessage = styled.div`
  color: #e53e3e;
  font-size: 14px;
  margin-top: 5px;
  line-height: 1.2;
  font-weight: 500;
`;
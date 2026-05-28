// Get the CSRF token
export const getCsrfToken = (): string => {
  return window.data?.csrfToken || '';
};

// Convert editor state to JSON
export const getValidCraftContent = (content: string) => {
  if (!content || content.trim() === '' || content === '{}') {
    return undefined; // Let CraftJS initialize with an empty Page component
  }

  try {
    const parsed = JSON.parse(content);
    // Check whether it's an empty object
    if (Object.keys(parsed).length === 0) {
      return undefined;
    }
    return parsed;
  } catch (error) {
    console.error('Invalid JSON content:', error);
    return undefined;
  }
};


// ========== ASSET HELPERS ==========

/**
 * Get correct asset path based on environment
 * Development: /assets/...
 * Production: /editor_react/assets/...
 */
export const getAssetPath = (path: string): string => {
  const publicUrl = process.env.PUBLIC_URL || '';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${publicUrl}/${cleanPath}`;
};

/**
 * Get icon path from assets/icons folder
 * @param iconName - Icon filename without extension (e.g., 'text', 'section')
 * @returns Full path to icon
 */
export const getIconPath = (iconName: string): string => {
  return getAssetPath(`assets/icons/${iconName}.svg`);
};

/**
 * Get image path from assets/images folder
 * @param imageName - Image filename with extension (e.g., 'image_placeholder.png')
 * @returns Full path to image
 */
export const getImagePath = (imageName: string): string => {
  return getAssetPath(`assets/images/${imageName}`);
};

/**
 * Get any asset path - generic helper
 * @param assetPath - Full path from assets folder (e.g., 'images/photo.jpg', 'icons/text.svg')
 * @returns Full path to asset
 */
export const getFullAssetPath = (assetPath: string): string => {
  return getAssetPath(`assets/${assetPath}`);
};

export const getValueByViewMode = (
  viewMode: string,
  desktopValue: any,
  mobileValue?: any
): any => {
  return viewMode === "mobile" && mobileValue !== undefined ? mobileValue : desktopValue;
};

export const getAppearanceByViewMode = (
  viewMode: string,
  appearance: { desktop: boolean; mobile: boolean }
): { desktop: boolean; mobile: boolean } => {
  return viewMode === "mobile"
    ? { desktop: appearance.mobile, mobile: appearance.mobile }
    : { desktop: appearance.desktop, mobile: appearance.mobile };
};


export const rgbaToString = ({ r, g, b, a = 1 }: { r: number; g: number; b: number; a?: number }) =>
  `rgba(${r}, ${g}, ${b}, ${parseFloat(a.toFixed(2))})`;

export const rgbaToHex = (rgba: string): string => {
  // Accept both rgb and rgba, with flexible whitespace
  const match = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\s*\)/);
  if (!match) {
    console.warn("Invalid RGBA format:", rgba);
    return "#000000";
  }
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
  const toHex = (num: number) => num.toString(16).padStart(2, "0").toUpperCase();
  const alphaHex = a < 1 ? toHex(Math.round(a * 255)) : "";
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${alphaHex}`;
};

export const resetAlphaToZero = (rgba?: string): string | null => {
  if (!rgba) return null; // If no color value is provided, skip
  const rgbaRegex = /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*(\d?.?\d*)?\)/;
  const match = rgba.match(rgbaRegex);
  if (match) {
    const [_, r, g, b] = match; // Extract r, g, b values from the color string
    return `rgba(${r}, ${g}, ${b}, 0)`;
  }
  return null; // Return null if the input is invalid
};


type BackgroundImageLike = {
  url?: string;
  displayMode?: string;
  position?: string;
};

export const getBackgroundImageCss = (bg?: BackgroundImageLike): string => {
  if (!bg?.url) return "";

  const sizeMap: Record<string, string> = {
    default: "auto",
    fullCenterFixed: "cover",
    repeat: "auto",
    fillWidth: "100% auto",
    fillWidthHeight: "100% 100%",
    contain: "contain",
  };
  const repeatMap: Record<string, string> = {
    default: "no-repeat",
    fullCenterFixed: "no-repeat",
    repeat: "repeat",
    fillWidth: "no-repeat",
    fillWidthHeight: "no-repeat",
    contain: "no-repeat",
  };
  const positionMap: Record<string, string> = {
    "top-left": "top left",
    "top-center": "top center",
    "top-right": "top right",
    "center-left": "center left",
    "center-center": "center center",
    "center-right": "center right",
    "bottom-left": "bottom left",
    "bottom-center": "bottom center",
    "bottom-right": "bottom right",
  };

  const mode = bg.displayMode ?? "default";
  const pos = positionMap[bg.position ?? "center-center"] ?? "center center";
  const attachment = mode === "fullCenterFixed" ? "background-attachment: fixed;" : "";

  return `
    background-image: url("${bg.url}");
    background-size: ${sizeMap[mode] ?? "auto"};
    background-repeat: ${repeatMap[mode] ?? "no-repeat"};
    background-position: ${pos};
    ${attachment}
  `;
};

export const getBoxShadowValue = (shadowName: string): string => {
  const shadowMap: Record<string, string> = {
    noShadow: "none",
    softShadow: "rgba(0, 0, 0, 0.2) 0px 1px 5px 0px",
    midShadow: "rgba(0, 0, 0, 0.4) 0px 1px 5px",
    hardShadow: "rgba(0, 0, 0, 0.7) 0px 1px 5px",
    farShadow: "rgba(0, 0, 0, 0.1) 0px 8px 1px",
    blurryShadow:
      "rgba(0, 0, 0, 0.2) 0px 0px 25px, rgba(0, 0, 0, 0.2) 0px 0px 15px, rgba(0, 0, 0, 0.4) 0px 0px 3px",
    darkWithHighlight:
      "rgba(0, 0, 0, 0.4) 0px 0px 25px, rgba(255, 255, 255, 0.2) 0px 0px 15px, rgba(255, 255, 255, 0.4) 0px 0px 3px",
    softShadowInset: "rgba(0, 0, 0, 0.2) 0px 1px 5px inset",
    midShadowInset: "rgba(0, 0, 0, 0.4) 0px 1px 5px inset",
    hardShadowInset: "rgba(0, 0, 0, 0.7) 0px 1px 5px inset",
  };
  return shadowMap[shadowName] || "none";
};

// Helper function to format price using Intl.NumberFormat
export const formatPrice = (
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string => {
  // Currencies that don't use decimal places
  const noDecimalCurrencies = ['JPY', 'KRW', 'VND', 'CLP', 'PYG', 'UGX', 'VUV', 'IRR', 'IDR', 'LAK'];
  const currencyUpper = currency.toUpperCase();

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyUpper,
      minimumFractionDigits: noDecimalCurrencies.includes(currencyUpper) ? 0 : 2,
      maximumFractionDigits: noDecimalCurrencies.includes(currencyUpper) ? 0 : 2,
    });

    return formatter.format(amount / 100);
  } catch (error) {
    // Fallback for unsupported currencies or locales
    const decimals = noDecimalCurrencies.includes(currencyUpper) ? 0 : 2;
    const price = (amount / 100).toFixed(decimals);
    return `${price} ${currencyUpper}`;
  }
};

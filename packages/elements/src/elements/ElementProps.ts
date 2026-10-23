import { ReactNode } from "react";

export type htmlIdProps = {
  htmlAttrId?: string;
};

export type FontSizeProps = {
  fontSize?: number;
  mobileFontSize?: number;
};

export type PaddingProps = {
  padding: {
    paddingTop: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
  };
  mobilePadding: {
    paddingTop: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
  };
};

export type MarginProps = {
  margin: {
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
  };
  mobileMargin: {
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
  };
};

export type BackgroundColorProps = {
  backgroundColor?: string;
  mobileBackgroundColor?: string;
};

export type BackgroundImageDisplayMode =
  | "default"
  | "fullCenterFixed"
  | "repeat"
  | "fillWidth"
  | "fillWidthHeight"
  | "contain";

export type BackgroundImagePosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center-center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type BackgroundImageValue = {
  url?: string;
  /** Tracked Asset id when uploaded via media library. Migration/clone/import
   * flows use this to know which asset row backs the URL. Optional for
   * backward compat with external URLs and legacy content. */
  assetId?: string | null;
  displayMode?: BackgroundImageDisplayMode;
  position?: BackgroundImagePosition;
  overlay?: string;
};

export type BackgroundImageProps = {
  backgroundImage?: BackgroundImageValue;
  mobileBackgroundImage?: BackgroundImageValue;
};

export type InnerBackgroundProps = {
  innerBackground?: string;
  mobileInnerBackground?: string;
};

export type ContentWidthProps = {
  contentWidth: string;
};

export type BoxShadowProps = {
  boxShadow?: string;
  mobileBoxShadow?: string;
};

export type BorderProps = {
  border?: {
    color?: string;
    radius?: number;
    width?: number;
    style?: string;
    type?: string;
  };
  mobileBorder?: {
    color?: string;
    radius?: number;
    width?: number;
    style?: string;
    type?: string;
  };
};


export type AppearanceProps = {
  appearance: {
    mobile: boolean;
    desktop: boolean;
  };
};

export type DelayProps = {
  delay?: number;
};

export type FontProps = {
  fontType?: string; // Web Safe, Google Fonts, Custom Fonts, etc.
  fontFamily?: string; // e.g. "Roboto", "Arial", "Montserrat"
  fontStyle?: string;
};

export type TextAlignProps = {
  textAlign?: string;
  mobileTextAlign?: string;
};

export type LineHeightProps = {
  lineHeight?: number;
  mobileLineHeight?: number;
};

export type LetterSpacingProps = {
  letterSpacing?: number;
  mobileLetterSpacing?: number;
};

export type ColorProps = {
  color?: string;
  mobileColor?: string;
};

// Add new types
export type IconColorProps = {
  iconColor?: string;
  mobileIconColor?: string;
};

export type IconSizeProps = {
  iconSize: number;
  mobileIconSize?: number;
};

export type VerticalSpacingProps = {
  verticalSpacing?: number;
  mobileVerticalSpacing?: number;
};

export type TextProps = {
  rawContentState?: string;
  disableActions?: boolean;
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  FontSizeProps &
  FontProps &
  PaddingProps &
  MarginProps &
  BackgroundColorProps &
  BackgroundImageProps &
  TextAlignProps &
  LineHeightProps &
  LetterSpacingProps;

export type HeadlineProps = {
  rawContentState?: string;
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  FontSizeProps &
  FontProps &
  PaddingProps &
  MarginProps &
  BackgroundColorProps &
  BackgroundImageProps &
  TextAlignProps &
  LineHeightProps &
  LetterSpacingProps;

export type BulletedListProps = {
  rawContentState?: string;
  verticalAlign?: "top" | "center" | "bottom";
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  FontSizeProps &
  FontProps &
  PaddingProps &
  MarginProps &
  BackgroundColorProps &
  BackgroundImageProps &
  TextAlignProps &
  LineHeightProps &
  LetterSpacingProps &
  IconColorProps &    // Added IconColorProps
  IconSizeProps &     // Added IconSizeProps
  VerticalSpacingProps; // Added VerticalSpacingProps

export type AlignSelfProps = {
  alignSelf?: string;
  mobileAlignSelf?: string;
};

export type ImageAction = "none" | "link" | "popup";

export type ImageDetailProps = {
  url?: string;
  /** Tracked Asset id when uploaded via media library. Migration/clone/import
   * flows use this to know which asset row backs the URL. Optional for
   * backward compat with external URLs and legacy content. */
  assetId?: string | null;
  action?: string;
  link?: string;
  openNewTab?: boolean;
  alt?: string;
  width?: number;        // desktop width (px). undefined → fill 100%.
  mobileWidth?: number;  // mobile override. undefined → fall back to `width`.
  /** Crop to a fixed ratio ("4/3", "16/9"…) with object-fit: cover, so images
   * of different sizes line up. undefined → original ratio. */
  aspectRatio?: string;
  /** Mobile override. undefined → fall back to `aspectRatio`; "auto" →
   * explicit original ratio on mobile. */
  mobileAspectRatio?: string;
};

export type ImageProps = {
  imageDetail?: ImageDetailProps;
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  PaddingProps &
  MarginProps &
  BoxShadowProps &
  BorderProps &
  AlignSelfProps; 



export type VideoDetailProps = {
  url?: string;
  videoType?: string;
  autoPlay?: boolean;
  controls?: boolean;
  aspectRatio?: "16:9" | "4:3" | "1:1" | "9:16";
};

export type VideoProps = {
  videoDetail?: VideoDetailProps;
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  MarginProps &
  BoxShadowProps &
  BorderProps;

// Embed / Raw HTML element — the user's HTML/CSS/JS runs inside a sandboxed
// <iframe srcdoc>, isolated from the page. Accepts a full `<!DOCTYPE html>…`
// document. Height is either measured from content ("auto") or pinned ("fixed").
export type EmbedProps = {
  html?: string;
  // Height mode is per-device: desktop can auto-fit while mobile is fixed, etc.
  heightMode?: "auto" | "fixed";
  mobileHeightMode?: "auto" | "fixed";
  height?: number;
  mobileHeight?: number;
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  MarginProps;

// Icon element — single FontAwesome / Bootstrap Icon glyph rendered via
// className (e.g. "fas fa-check"). Vector, scales without loss; color
// inherits via `color` CSS property.
export type IconElementProps = {
  iconClass?: string;        // e.g. "fas fa-check" or "bi bi-star-fill"
  size?: number;             // px — desktop
  mobileSize?: number;       // px — mobile override
  color?: string;
  mobileColor?: string;
  hoverColor?: string;
  // Click action — same vocabulary as Image.
  action?: "none" | "link";
  link?: string;
  openNewTab?: boolean;
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  PaddingProps &
  MarginProps &
  AlignSelfProps;

// Element Props
export type SectionProps = 
  htmlIdProps &
  AppearanceProps & 
  DelayProps &
  PaddingProps &
  MarginProps &
  BackgroundColorProps &
  BackgroundImageProps &
  InnerBackgroundProps &
  ContentWidthProps &
  BoxShadowProps & 
  BorderProps &
  {
    children?: ReactNode;
  };

export type RowProps =
  htmlIdProps &
  AppearanceProps &
  DelayProps &
  PaddingProps &
  MarginProps &
  BackgroundColorProps &
  BackgroundImageProps &
  BoxShadowProps &
  BorderProps &
  {
    disableStacking?: boolean;
    reverseColumns?: boolean;
    // Gap between columns: desktop grid (horizontal spacing). Also used on
    // mobile (vertical spacing between stacked columns) unless mobileGap is set.
    gap?: number;
    mobileGap?: number;
    // Vertical alignment of the columns side by side (desktop, or mobile with
    // stacking disabled). Unset/"top" = columns stretch to the tallest one.
    verticalAlign?: "top" | "center" | "bottom";
    // Stretch Rows placed directly inside this Row's columns (cards) to the
    // tallest column, so a grid of cards lines up regardless of text length.
    equalHeightCards?: boolean;
    children?: ReactNode;
  };

export interface ColumnProps {
  size: number; // 1-12
}


export type FieldDetailProps = {
  type?: string;
  name?: string;
  placeholder?: string;
  placeholderColor?: string;
  isOptional?: boolean;
};


export type FieldProps = {
  inputDetail?: FieldDetailProps;
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  FontSizeProps &
  MarginProps &
  PaddingProps &
  BackgroundColorProps &
  ColorProps &
  BorderProps &
  TextAlignProps &
  LineHeightProps &
  LetterSpacingProps;


// Enhanced ButtonProps interface
// Note: in-page section scrolling is just an `open_url` with `#section-id`
// in the linkUrl field. The browser handles smooth scroll natively
// (renderer globals.css sets `html { scroll-behavior: smooth }`).
export type ButtonActionType =
  | 'submit_form'
  | 'open_url'
  | 'show_popup'
  | 'next_step_url'
  | 'download_file'
  | 'none';

export type ButtonRedirectionType =
  // submit_form
  | 'nextStep'
  | 'customUrl'
  | 'noRedirection'
  // open_url
  | 'sameWindow'
  | 'newWindow';
export type ButtonWidthType = 'auto' | 'full';
export type ButtonHoverEffectStyle = 'none' | 'zoom' | 'slide' | 'float';

export type ButtonHoverProps = {
  backgroundColor?: string;
  textColor?: string;
  subTextColor?: string;
  transform?: string;
  offset?: number;
  effectStyle?: ButtonHoverEffectStyle;
};


export type SubTextColorProps = {
  subTextColor?: string;
  mobileSubTextColor?: string;
};

export type SubTextFontSizeProps = {
  subTextFontSize?: number;
  mobileSubTextFontSize?: number;
};

export type SubTextFontProps = {
  subTextFontType?: string; // Web Safe, Google Fonts, Custom Fonts, etc.
  subTextFontFamily?: string; // e.g. "Roboto", "Arial", "Montserrat"
  subTextFontStyle?: string;
};


export type ButtonProps = htmlIdProps &
  AppearanceProps &
  DelayProps &
  PaddingProps &
  MarginProps &
  BackgroundColorProps &
  BackgroundImageProps &
  TextAlignProps &
  LineHeightProps &
  LetterSpacingProps &
  AlignSelfProps &
  BoxShadowProps &
  BorderProps &
  FontSizeProps &
  SubTextFontSizeProps &
  ColorProps &
  SubTextColorProps &
  SubTextFontProps &
  FontProps & {
    text?: string;
    subText?: string;
    // Icons
    iconClassNameBefore?: string;
    iconClassNameAfter?: string;
    width?: ButtonWidthType;
    mobileWidth?: ButtonWidthType;
    // Action settings
    action: ButtonActionType;
    redirectionType?: ButtonRedirectionType;
    doubleOptIn?: boolean;
    linkUrl?: string;
    nofollow?: boolean;
    popup?: string; // Popup ID or content
    // Hover effects
    hover?: ButtonHoverProps;
};

// Added to ElementProps.ts
export type FAQItemProps = {
  id: string;
  questionHtml: string;      // rich HTML — supports bold/italic/links/color
  answerHtml: string;
  isOpen?: boolean;          // open by default on rendered page
};

export type FAQProps = {
  items: FAQItemProps[];
  spaceBetweenItems?: number;
  borderRadius?: number;             // legacy — kept so existing data still renders
  itemBorder?: BorderProps["border"];
  mobileItemBorder?: BorderProps["mobileBorder"];
  displayDropdownIcons?: boolean;
  // FAQ Item padding
  itemPadding: PaddingProps["padding"];
  mobileItemPadding: PaddingProps["mobilePadding"];

  iconOpenState?: string;
  iconClosedState?: string;

  // Font and styling for question
  questionFontSize?: number;
  mobileQuestionFontSize?: number;
  questionColor?: string;
  mobileQuestionColor?: string;
  questionFontType?: string;
  questionFontFamily?: string;
  questionFontStyle?: string;

  // Font and styling for answer
  answerFontSize?: number;
  mobileAnswerFontSize?: number;
  answerColor?: string;
  mobileAnswerColor?: string;
  answerFontFamily?: string;
  answerFontStyle?: string;

  // Background and icon colors
  questionBackgroundColor?: string;
  mobileQuestionBackgroundColor?: string;
  iconColor?: string;
  mobileIconColor?: string;
  answerBackgroundColor?: string;
  mobileAnswerBackgroundColor?: string;

} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  PaddingProps &
  MarginProps &
  BoxShadowProps;

  export type MenuItemProps = {
    id: string;
    text: string;
    link?: string;
    hasSubmenu?: boolean;
    submenuItems?: MenuSubmenuItemProps[];
    openInNewWindow?: boolean;
  };
  
  export type MenuSubmenuItemProps = {
    id: string;
    text: string;
    link?: string;
    openInNewWindow?: boolean;
  };
  
  export type MenuType = 'dropdown' | 'side';
  export type MenuState = 'open' | 'closed';
  export type MenuAlignment = 'flex-start' | 'center' | 'flex-end';
  
  export type MenuProps = {
    items: MenuItemProps[];
    
    // Hamburger menu settings (mobile only)
    showBurgerMenu?: boolean;
    burgerIconColor?: string;
    mobileBurgerIconColor?: string;
    menuType?: MenuType;
    menuState?: MenuState;
    mobileSideMenuBackgroundColor?: string;
    
    // Alignment
    alignment?: MenuAlignment;
    mobileAlignment?: MenuAlignment;
    
    // Spacing
    spaceBetweenItems?: number;
    mobileSpaceBetweenItems?: number;
    spaceBetweenSubmenuItems?: number;
    mobileSpaceBetweenSubmenuItems?: number;
    
    // Typography
    fontSize?: number;
    mobileFontSize?: number;
    lineHeight?: number;
    mobileLineHeight?: number;
    fontType?: string;
    fontFamily?: string;
    fontStyle?: string;
    
    // Colors
    textColor?: string;
    mobileTextColor?: string;
    submenuTextColor?: string;
    mobileSubmenuTextColor?: string;
    activeSubmenuTextColor?: string;
    mobileActiveSubmenuTextColor?: string;
    submenuBackgroundColor?: string;
    mobileSubmenuBackgroundColor?: string;
    underlineColor?: string;
    mobileUnderlineColor?: string;
    
    // Submenu styling
    submenuFontSize?: number;
    mobileSubmenuFontSize?: number;
    submenuLineHeight?: number;
    mobileSubmenuLineHeight?: number;
    
  } & htmlIdProps &
    AppearanceProps &
    DelayProps &
    PaddingProps &
    MarginProps;

// Countdown element
export type CountdownType = 'fixed' | 'delay' | 'daily';
export type CountdownAction = 'nothing' | 'redirect';

export type CountdownProps = {
  // Countdown configuration
  countdownType: CountdownType;
  
  // Fixed date settings
  targetDate?: string;
  targetTime?: string;
  
  // Delay settings  
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  
  // Daily settings
  dailyTime?: string;
  
  // Action when expires
  actionWhenExpires: CountdownAction;
  redirectionUrl?: string;
  
  // Spacing
  spacing?: number;
  mobileSpacing?: number;
  
  // Labels
  daysLabel?: string;
  hoursLabel?: string; 
  minutesLabel?: string;
  secondsLabel?: string;
  
  // Typography
  timeFontSize?: number;
  mobileTimeFontSize?: number;
  textFontSize?: number;
  mobileTextFontSize?: number;
  fontType?: string;
  fontFamily?: string;
  fontStyle?: string;
  
  // Colors
  timeColor?: string;
  mobileTimeColor?: string;
  labelColor?: string;
  mobileLabelColor?: string;

} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  MarginProps &
  AlignSelfProps;


export type CheckboxProps = {
  rawContentState?: string;
  disableActions?: boolean;
  validationMessage?: string;
  isOptional?: boolean;
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  FontSizeProps &
  FontProps &
  PaddingProps &
  MarginProps &
  BackgroundColorProps &
  BackgroundImageProps &
  TextAlignProps &
  LineHeightProps &
  LetterSpacingProps;


// Payment form
export type CouponProps = {
  // Field properties
  placeholder?: string;
  fieldFontSize?: number;
  mobileFieldFontSize?: number;
  fieldTextColor?: string;
  mobileFieldTextColor?: string;
  fieldBackgroundColor?: string;
  mobileFieldBackgroundColor?: string;
  fieldBorder?: {
    color?: string;
    radius?: number;
    width?: number;
    style?: string;
    type?: string;
  };
  mobileFieldBorder?: {
    color?: string;
    radius?: number;
    width?: number;
    style?: string;
    type?: string;
  };
  
  // Apply button properties
  buttonText?: string;
  buttonFontSize?: number;
  mobileButtonFontSize?: number;
  buttonTextColor?: string;
  mobileButtonTextColor?: string;
  buttonBackgroundColor?: string;
  mobileButtonBackgroundColor?: string;
  buttonBorder?: {
    color?: string;
    radius?: number;
    width?: number;
    style?: string;
    type?: string;
  };
  mobileButtonBorder?: {
    color?: string;
    radius?: number;
    width?: number;
    style?: string;
    type?: string;
  };
  
  // Button action
  action?: string; // 'calculate_price' — extensible in the future
  
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  PaddingProps &
  MarginProps &
  BoxShadowProps &
  BorderProps;

  export type OfferPriceProps = {
    // Price plan description
    pricePlanDescription?: string;
    
    // Price plan name styling
    pricePlanNameFontSize?: number;
    mobilePricePlanNameFontSize?: number;
    pricePlanNameLineHeight?: number;        
    mobilePricePlanNameLineHeight?: number;  
    pricePlanNameColor?: string;
    mobilePricePlanNameColor?: string;
    pricePlanNameFontType?: string;
    pricePlanNameFontFamily?: string;
    pricePlanNameFontStyle?: string;
    
    // Amount styling
    amountFontSize?: number;
    mobileAmountFontSize?: number;
    amountLineHeight?: number;        
    mobileAmountLineHeight?: number;  
    amountColor?: string;
    mobileAmountColor?: string;
    amountFontType?: string;
    amountFontFamily?: string;
    amountFontStyle?: string;
    
    // Price description styling
    priceDescriptionFontSize?: number;
    mobilePriceDescriptionFontSize?: number;
    priceDescriptionLineHeight?: number;
    mobilePriceDescriptionLineHeight?: number;
    priceDescriptionColor?: string;
    mobilePriceDescriptionColor?: string;
    priceDescriptionFontType?: string;
    priceDescriptionFontFamily?: string;
    priceDescriptionFontStyle?: string;


  } & htmlIdProps &
    AppearanceProps &
    DelayProps &
    MarginProps &
    BackgroundColorProps;

export type PaymentButtonProps = htmlIdProps &
  AppearanceProps &
  DelayProps &
  PaddingProps &
  MarginProps &
  BackgroundColorProps &
  BackgroundImageProps &
  TextAlignProps &
  LineHeightProps &
  LetterSpacingProps &
  AlignSelfProps &
  BoxShadowProps &
  BorderProps &
  FontSizeProps &
  SubTextFontSizeProps &
  ColorProps &
  SubTextColorProps &
  SubTextFontProps &
  FontProps & {
    // Text content
    text?: string;
    subText?: string;
    loadingText?: string;
    validationText?: string;
    
    // Icons
    iconClassNameBefore?: string;
    iconClassNameAfter?: string;
    
    // Width and alignment
    width?: ButtonWidthType;
    mobileWidth?: ButtonWidthType;
    
    // Hover effects
    hover?: ButtonHoverProps;
};


export type PaymentMethodProps = {
  // Text styling
  textFontSize?: number;
  mobileTextFontSize?: number;
  textLineHeight?: number;        
  mobileTextLineHeight?: number;  
  textColor?: string;
  mobileTextColor?: string;
  textFontType?: string;
  textFontFamily?: string;
  textFontStyle?: string;
  
  // Item styling
  spaceBetweenItems?: number;
  itemPadding: PaddingProps["padding"];
  mobileItemPadding: PaddingProps["mobilePadding"];
  itemBorder: BorderProps["border"];
  mobileItemBorder: BorderProps["mobileBorder"];
  activeBackgroundColor?: string;
  mobileActiveBackgroundColor?: string;
  
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  MarginProps &
  BackgroundColorProps;


export type OrderBumpProps = {
  // Order bump content
  orderBumpName?: string;
  
  // Visual settings
  showIcon?: boolean;
  iconClass?: string;
  iconColor?: string;
  iconSize?: number;
  
  // Text styling
  fontSize?: number;
  mobileFontSize?: number;
  color?: string;
  mobileColor?: string;
  fontType?: string;
  fontFamily?: string;
  fontStyle?: string;
  
  // Layout
  textAlign?: string;
  mobileTextAlign?: string;
  
  // Background colors
  backgroundColor?: string;
  mobileBackgroundColor?: string;
  
} & htmlIdProps &
  AppearanceProps &
  DelayProps &
  PaddingProps &
  MarginProps &
  BorderProps &
  BoxShadowProps;
export type PhysicalProductProps = {
  // Name
  nameFontSize?: number;
  mobileNameFontSize?: number;
  nameLineHeight?: number;
  mobileNameLineHeight?: number;
  nameColor?: string;
  mobileNameColor?: string;
  nameFontType?: string;
  nameFontFamily?: string;
  nameFontStyle?: string;
  // Price
  priceFontSize?: number;
  mobilePriceFontSize?: number;
  priceLineHeight?: number;
  mobilePriceLineHeight?: number;
  priceColor?: string;
  mobilePriceColor?: string;
  priceFontType?: string;
  priceFontFamily?: string;
  priceFontStyle?: string;
  // Description
  descriptionFontSize?: number;
  mobileDescriptionFontSize?: number;
  descriptionLineHeight?: number;
  mobileDescriptionLineHeight?: number;
  descriptionColor?: string;
  mobileDescriptionColor?: string;
  descriptionFontType?: string;
  descriptionFontFamily?: string;
  descriptionFontStyle?: string;
  // Pill options
  pillColor?: string;
  pillSelectedColor?: string;
  pillBorderColor?: string;
  pillSelectedBorderColor?: string;
  // Display
  showQuantity?: boolean;
} & htmlIdProps & AppearanceProps & DelayProps & MarginProps & BackgroundColorProps;

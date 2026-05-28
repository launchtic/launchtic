import { ButtonWidthType, ButtonActionType, ButtonRedirectionType, MenuType, MenuAlignment, MenuState, CountdownType, CountdownAction } from "./ElementProps";

const DEFAULT_COMMON_PROPS = {
  htmlAttrId: undefined,
  appearance: { mobile: true, desktop: true },
  delay: undefined,
};

// Default styles for elements
export const DEFAULT_STYLES = {
  text: {
    rawContentState: "",
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 15, marginBottom: 15, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 10, marginBottom: 10, marginLeft: 0, marginRight: 0 },
    backgroundColor: undefined,
    mobileBackgroundColor: undefined,
    textAlign: "left", // Default text alignment
    mobileTextAlign: undefined,
    fontSize: 20,
    mobileFontSize: 16,
    lineHeight: 24, // Default line height
    mobileLineHeight: 21,
    letterSpacing: undefined, // Default letter spacing
    mobileLetterSpacing: undefined,
    fontType: "default",
    ...DEFAULT_COMMON_PROPS, // Add appearance & delay
  },
  button: {
    text: "Click here",
    subText: "Subtext here",

    // Font and line size
    fontSize: 20,
    mobileFontSize: 20,
    lineHeight: 24,
    mobileLineHeight: 21,

    // Colors
    color: "rgba(255, 255, 255, 1)",
    mobileColor: undefined,
    backgroundColor: "rgb(25, 118, 210, 1)",
    mobileBackgroundColor: undefined,
    subTextColor: "rgba(255, 255, 255, 0.8)",

    // Typography
    fontType: "default",
    fontFamily: undefined,
    fontStyle: undefined,
    subTextFontType: "default",
    subTextFontFamily: undefined,
    subTextFontStyle: undefined,

    // Leading and trailing icons
    iconClassNameBefore: undefined,
    iconClassNameAfter: undefined,

    // Size and position
    width: "auto" as ButtonWidthType,
    mobileWidth: "full" as ButtonWidthType,
    alignSelf: "flex-start",
    mobileAlignSelf: undefined,
    textAlign: "center",
    mobileTextAlign: undefined,

    // Shadow and border
    boxShadow: "blurryShadow",
    mobileBoxShadow: undefined,
    border: undefined,
    mobileBorder: undefined,

    // Spacing (padding & margin)
    padding: { paddingTop: 15, paddingBottom: 15, paddingLeft: 90, paddingRight: 90 },
    mobilePadding: { paddingTop: 10, paddingBottom: 10, paddingLeft: 20, paddingRight: 20 },
    margin: { marginTop: 15, marginBottom: 15, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 10, marginBottom: 10, marginLeft: 0, marginRight: 0 },

    // Letter spacing
    letterSpacing: undefined,
    mobileLetterSpacing: undefined,

    // Button actions
    action: "submit_form" as ButtonActionType,
    redirectionType: "nextStep" as ButtonRedirectionType,
    linkUrl: "",
    nofollow: false,
    popup: "",
    doubleOptIn: false,

    // Hover properties
    hover: undefined,
    // Add shared common props
    ...DEFAULT_COMMON_PROPS
  },
  field: {
    inputDetail: {
      type: "email",
      name: "email",
      placeholder: "Email",
      placeholderColor: undefined,
      isOptional: false,
    },
    padding: { paddingTop: 12, paddingBottom: 12, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 10, paddingBottom: 10, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 25, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 25, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    backgroundColor: undefined,
    mobileBackgroundColor: undefined,
    fontSize: 18,
    mobileFontSize: 16,
    lineHeight: 24,
    mobileLineHeight: 20,
    letterSpacing: undefined,
    mobileLetterSpacing: undefined,
    textAlign: "left",
    mobileTextAlign: undefined,
    border: {
      radius: 5,
      style: "solid",
      color: "rgb(176, 186, 202)",
      width: 1,
      type: "fullBorder"
    },
    mobileBorder: undefined,
    ...DEFAULT_COMMON_PROPS, // Add appearance & delay
  },
  image: {
    imageDetail: {
      url: undefined,
      action: "none",
      link: undefined,
      openNewTab: false,
      alt: "",
      width: undefined,
    },
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    boxShadow: undefined,
    mobileBoxShadow: undefined,
    border: undefined,
    mobileBorder: undefined,
    alignSelf: "center",
    mobileAlignSelf: undefined,
    ...DEFAULT_COMMON_PROPS, // Add appearance & delay
  },
  icon: {
    iconClass: "fas fa-circle-check",
    size: 48,
    mobileSize: 32,
    color: "#0d6efd",
    mobileColor: undefined,
    hoverColor: undefined,
    action: "none" as const,
    link: undefined,
    openNewTab: false,
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    alignSelf: "center",
    mobileAlignSelf: undefined,
    ...DEFAULT_COMMON_PROPS,
  },
  video: {
    videoDetail: {
      url: undefined,
      videoType: "direct",
      autoPlay: false,
      controls: false,
    },
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    boxShadow: undefined,
    mobileBoxShadow: undefined,
    border: undefined,
    mobileBorder: undefined,
    
    ...DEFAULT_COMMON_PROPS,
  },
  headline: {
    rawContentState: "",
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 20, marginBottom: 20, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 10, marginBottom: 10, marginLeft: 0, marginRight: 0 },
    backgroundColor: undefined,
    mobileBackgroundColor: undefined,
    textAlign: "left", // Default text alignment
    mobileTextAlign: undefined,
    fontSize: 32,
    mobileFontSize: 24,
    lineHeight: 38, // Default line height
    mobileLineHeight: 28,
    letterSpacing: undefined, // Default letter spacing
    mobileLetterSpacing: undefined,
    fontType: "default",
    ...DEFAULT_COMMON_PROPS, // Add appearance & delay
  },
  bulletedList: {
    rawContentState: "",
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 15, marginBottom: 15, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    backgroundColor: undefined,
    mobileBackgroundColor: undefined,
    iconColor: "rgba(0, 0, 0, 1)",
    mobileIconColor: undefined,
    iconSize: 20,
    mobileIconSize: undefined,
    verticalSpacing: undefined,
    mobileVerticalSpacing: undefined,
    textAlign: "left",
    mobileTextAlign: undefined,
    fontSize: 20, 
    mobileFontSize: 16,
    lineHeight: 34,
    mobileLineHeight: 24,
    letterSpacing: undefined,
    mobileLetterSpacing: undefined,
    fontType: "default",
    ...DEFAULT_COMMON_PROPS,
  },
  section: {
    padding: { paddingTop: 40, paddingBottom: 40, paddingLeft: 40, paddingRight: 40 },
    mobilePadding: { paddingTop: 5, paddingBottom: 5, paddingLeft: 5, paddingRight: 5 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    backgroundColor: undefined,
    mobileBackgroundColor: undefined,
    innerBackground: undefined,
    mobileInnerBackground: undefined,
    backgroundImage: undefined,
    mobileBackgroundImage: undefined,
    contentWidth: "1120px",
    boxShadow: undefined,
    mobileBoxShadow: undefined,
    ...DEFAULT_COMMON_PROPS, // Add appearance & delay
  },
  row: {
    padding: { paddingTop: 10, paddingBottom: 10, paddingLeft: 10, paddingRight: 10 },
    mobilePadding: { paddingTop: 5, paddingBottom: 5, paddingLeft: 5, paddingRight: 5 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    backgroundColor: undefined,
    mobileBackgroundColor: undefined,
    innerBackground: undefined,
    mobileInnerBackground: undefined,
    backgroundImage: undefined,
    mobileBackgroundImage: undefined,
    boxShadow: undefined,
    mobileBoxShadow: undefined,
    border: undefined,
    mobileBorder: undefined,
    disableStacking: false,
    reverseColumns: false,
    gap: 10,
    ...DEFAULT_COMMON_PROPS,
  },
  faq: {
    items: [
      {
        id: "faq-1",
        questionHtml: "<p>How do I get started?</p>",
        answerHtml: "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>",
        isOpen: false
      },
      {
        id: "faq-2",
        questionHtml: "<p>What are the pricing options?</p>",
        answerHtml: "<p>We offer flexible pricing plans to suit every need. Contact us to learn more about our available options.</p>",
        isOpen: false
      }
    ],
    spaceBetweenItems: 10,
    borderRadius: 5,
    displayDropdownIcons: true,
    iconOpenState: "fas fa-chevron-up",
    iconClosedState: "fas fa-angle-down",
    itemPadding: { paddingTop: 15, paddingBottom: 15, paddingLeft: 15, paddingRight: 15 },
    mobileItemPadding: { paddingTop: 10, paddingBottom: 10, paddingLeft: 10, paddingRight: 10 },

    // Question styling
    questionFontSize: 24,
    mobileQuestionFontSize: 20,
    questionColor: "#000000",
    mobileQuestionColor: undefined,
    questionFontType: "default",
    questionFontFamily: undefined,
    questionFontStyle: undefined,

    // Answer styling
    answerFontSize: 16,
    mobileAnswerFontSize: 15,
    answerColor: "#444444",
    mobileAnswerColor: undefined,
    answerFontFamily: undefined,
    answerFontStyle: undefined,

    // Background colors
    questionBackgroundColor: "#f8f9fa",
    mobileQuestionBackgroundColor: undefined,
    answerBackgroundColor: "#ffffff",
    mobileAnswerBackgroundColor: undefined,
    iconColor: "#000000",
    mobileIconColor: undefined,
    
    // Standard props
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    border: undefined,
    mobileBorder: undefined,
    boxShadow: undefined,
    mobileBoxShadow: undefined,
    
    ...DEFAULT_COMMON_PROPS,
  },
  menu: {
    items: [
      {
        id: "menu-1",
        text: "Home",
        link: "/",
        hasSubmenu: false,
        submenuItems: [],
        openInNewWindow: false
      },
      {
        id: "menu-2", 
        text: "Contacts",
        link: "/contacts",
        hasSubmenu: false,
        submenuItems: [],
        openInNewWindow: false
      },
    ],
    // Hamburger menu settings
    showBurgerMenu: true,
    burgerIconColor: "#000000",
    mobileBurgerIconColor: undefined,
    menuType: "side" as MenuType,
    menuState: "closed" as MenuState,
    mobileSideMenuBackgroundColor: undefined,
    
    // Alignment
    alignment: "flex-start" as MenuAlignment,
    mobileAlignment: undefined,
    
    // Spacing
    spaceBetweenItems: 20,
    mobileSpaceBetweenItems: 5,
    spaceBetweenSubmenuItems: 5,
    mobileSpaceBetweenSubmenuItems: 5,
    
    // Typography
    fontSize: 22,
    mobileFontSize: 18,
    lineHeight: 30,
    mobileLineHeight: 24,
    fontType: "default",
    fontFamily: undefined,
    fontStyle: undefined,
    
    // Colors
    textColor: "#000000",
    mobileTextColor: undefined,
    submenuTextColor: undefined,
    mobileSubmenuTextColor: undefined,
    activeSubmenuTextColor: undefined,
    mobileActiveSubmenuTextColor: undefined,
    submenuBackgroundColor: undefined,
    mobileSubmenuBackgroundColor: undefined,
    underlineColor: undefined,
    mobileUnderlineColor: undefined,
    
    // Submenu styling
    submenuFontSize: 16,
    mobileSubmenuFontSize: undefined,
    submenuLineHeight: 22,
    mobileSubmenuLineHeight: undefined,

    // Standard props
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    ...DEFAULT_COMMON_PROPS,
  },
  countdown: {
    // Countdown configuration
    countdownType: "fixed" as CountdownType,
    
    // Fixed date settings (default to 10 days from now)
    targetDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    targetTime: "23:59",
    
    // Delay settings
    days: 0,
    hours: 1,
    minutes: 0,
    seconds: 0,
    
    // Daily settings
    dailyTime: "18:00",
    
    // Action when expires
    actionWhenExpires: "nothing" as CountdownAction,
    redirectionUrl: "",
    
    // Labels
    daysLabel: "DAYS",
    hoursLabel: "HOURS",
    minutesLabel: "MINUTES", 
    secondsLabel: "SECONDS",
    
    // Typography
    timeFontSize: 32,
    mobileTimeFontSize: 24,
    textFontSize: 18,
    mobileTextFontSize: 16,
    fontType: "default",
    fontFamily: undefined,
    fontStyle: undefined,
    spacing: 10,
    mobileSpacing: 5,
    // Colors
    timeColor: "#dc3545",
    mobileTimeColor: undefined,
    labelColor: "#6c757d", 
    mobileLabelColor: undefined,
    
    // Standard props
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    alignSelf: "center",
    mobileAlignSelf: undefined,

    ...DEFAULT_COMMON_PROPS,
  },
  checkbox: {
    rawContentState: "",
    validationMessage: "Please check this box to continue",
    isOptional: false,
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 15, marginBottom: 15, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 10, marginBottom: 10, marginLeft: 0, marginRight: 0 },
    backgroundColor: undefined,
    mobileBackgroundColor: undefined,
    textAlign: "left",
    mobileTextAlign: undefined,
    fontSize: 18,
    mobileFontSize: 16,
    lineHeight: 24,
    mobileLineHeight: 20,
    letterSpacing: undefined,
    mobileLetterSpacing: undefined,
    fontType: "default",
    ...DEFAULT_COMMON_PROPS,
  },
  coupon: {
    // Field properties
    placeholder: "Enter promo code",
    fieldFontSize: 18,
    mobileFieldFontSize: 16,
    fieldTextColor: "rgba(0, 0, 0, 1)",
    mobileFieldTextColor: undefined,
    fieldBackgroundColor: "rgba(255, 255, 255, 1)",
    mobileFieldBackgroundColor: undefined,
    fieldBorder: {
      radius: 5,
      style: "solid",
      color: "rgb(176, 186, 202)",
      width: 1,
      type: "fullBorder"
    },
    mobileFieldBorder: undefined,
    
    // Apply button properties
    buttonText: "Apply",
    buttonFontSize: 18,
    mobileButtonFontSize: 16,
    buttonTextColor: "rgba(255, 255, 255, 1)",
    mobileButtonTextColor: undefined,
    buttonBackgroundColor: "rgb(25, 118, 210)",
    mobileButtonBackgroundColor: undefined,
    buttonBorder: {
      radius: 5,
      style: "solid",
      color: "rgb(25, 118, 210)",
      width: 1,
      type: "fullBorder"
    },
    mobileButtonBorder: undefined,
    
    // Button action
    action: "calculate_price",
    
    // Standard props
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 10, marginBottom: 10, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 5, marginBottom: 5, marginLeft: 0, marginRight: 0 },
    boxShadow: undefined,
    mobileBoxShadow: undefined,
    border: undefined,
    mobileBorder: undefined,
    
    ...DEFAULT_COMMON_PROPS,
  },
  offerPrice: {
    // Price plan description
    pricePlanDescription: undefined,
    
    // Price plan name styling
    pricePlanNameFontSize: 16,
    mobilePricePlanNameFontSize: 14,
    pricePlanNameLineHeight: 22,
    mobilePricePlanNameLineHeight: 18,
    pricePlanNameColor: "rgba(0, 0, 0, 1)",
    mobilePricePlanNameColor: undefined,
    pricePlanNameFontType: "default",
    pricePlanNameFontFamily: undefined,
    pricePlanNameFontStyle: undefined,
    
    // Amount styling
    amountFontSize: 16,
    mobileAmountFontSize: 14,
    amountLineHeight: 20,
    mobileAmountLineHeight: 18,
    amountColor: "rgba(0, 0, 0, 1)",
    mobileAmountColor: undefined,
    amountFontType: "default",
    amountFontFamily: undefined,
    amountFontStyle: undefined,
    
    // Price description styling
    priceDescriptionFontSize: 13,
    mobilePriceDescriptionFontSize: 12,
    priceDescriptionLineHeight: 18,
    mobilePriceDescriptionLineHeight: 16,
    priceDescriptionColor: "#666666",
    mobilePriceDescriptionColor: undefined,
    priceDescriptionFontType: "default",
    priceDescriptionFontFamily: undefined,
    priceDescriptionFontStyle: undefined,


    // Standard props
    padding: { paddingTop: 10, paddingBottom: 10, paddingLeft: 15, paddingRight: 15 },
    mobilePadding: { paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 12 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    backgroundColor: "#f5f5f5",
    mobileBackgroundColor: undefined,
    
    ...DEFAULT_COMMON_PROPS, // appearance & delay
  },
  paymentButton: {

    text: "Pay now",
    subText: "Secure payment",
    loadingText: "Processing...",
    validationText: "Please complete all required fields",
  
    // Font and line size
    fontSize: 20,
    mobileFontSize: 20,
    lineHeight: 24,
    mobileLineHeight: 21,

    // Colors
    color: "rgba(255, 255, 255, 1)",
    mobileColor: undefined,
    backgroundColor: "rgb(22, 163, 74, 1)",
    mobileBackgroundColor: undefined,
    subTextColor: "rgba(255, 255, 255, 0.8)",

    // Typography
    fontType: "default",
    fontFamily: undefined,
    fontStyle: undefined,
    subTextFontType: "default",
    subTextFontFamily: undefined,
    subTextFontStyle: undefined,

    // Leading and trailing icons
    iconClassNameBefore: undefined,
    iconClassNameAfter: undefined,

    // Size and position
    width: "auto" as ButtonWidthType,
    mobileWidth: "full" as ButtonWidthType,
    alignSelf: "flex-start",
    mobileAlignSelf: undefined,
    textAlign: "center",
    mobileTextAlign: undefined,

    // Shadow and border
    boxShadow: "blurryShadow",
    mobileBoxShadow: undefined,
    border: undefined,
    mobileBorder: undefined,

    // Spacing (padding & margin)
    padding: { paddingTop: 15, paddingBottom: 15, paddingLeft: 90, paddingRight: 90 },
    mobilePadding: { paddingTop: 12, paddingBottom: 12, paddingLeft: 30, paddingRight: 30 },
    margin: { marginTop: 15, marginBottom: 15, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 10, marginBottom: 10, marginLeft: 0, marginRight: 0 },

    // Letter spacing
    letterSpacing: undefined,
    mobileLetterSpacing: undefined,
  
    // Hover properties
    hover: {
      backgroundColor: "rgb(21, 128, 61)",
      transform: "translateY(-1px)",
      boxShadow: "0 8px 25px rgba(22, 163, 74, 0.3)"
    },
    
    ...DEFAULT_COMMON_PROPS
  },
  paymentMethod: {
    // Text styling
    textFontSize: 16,
    mobileTextFontSize: 14,
    textLineHeight: 20,
    mobileTextLineHeight: 18,
    textColor: "rgba(0, 0, 0, 1)",
    mobileTextColor: undefined,
    textFontType: "default",
    textFontFamily: undefined,
    textFontStyle: undefined,
    
    // Item styling
    spaceBetweenItems: 10,
    itemPadding: { paddingTop: 15, paddingBottom: 15, paddingLeft: 15, paddingRight: 15 },
    mobileItemPadding: { paddingTop: 12, paddingBottom: 12, paddingLeft: 12, paddingRight: 12 },
    itemBorder: {
      radius: 8,
      style: "solid",
      color: "#e0e0e0",
      width: 1,
      type: "fullBorder"
    },
    mobileItemBorder: undefined,
    activeBackgroundColor: "rgba(25, 118, 210, 0.1)",
    mobileActiveBackgroundColor: undefined,
    
    // Standard props
    margin: { marginTop: 10, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 5, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    
    ...DEFAULT_COMMON_PROPS, // appearance & delay
  },
  orderBump: {
    // Order bump content
    orderBumpName: "Yes, I'll take it!",
    
    // Visual settings
    showIcon: true,
    iconClass: 'fas fa-right-long',
    iconColor: '#E50031',
    iconSize: 30,
    
    // Text styling
    fontSize: 26,
    mobileFontSize: 22,
    color: "rgb(0, 0, 0)",
    mobileColor: undefined,
    fontType: "default",
    fontFamily: undefined,
    fontStyle: "bold",
    
    // Layout
    textAlign: "left",
    mobileTextAlign: undefined,
    
    // Background colors
    backgroundColor: "#D7F6E4",
    mobileBackgroundColor: undefined,
    
    // Standard props
    padding: { paddingTop: 15, paddingBottom: 15, paddingLeft: 15, paddingRight: 15 },
    mobilePadding: { paddingTop: 12, paddingBottom: 12, paddingLeft: 12, paddingRight: 12 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    border: {
      radius: 8,
      style: "solid",
      color: "#51DF8A",
      width: 2,
      type: "fullBorder"
    },
    mobileBorder: undefined,
    boxShadow: undefined,
    mobileBoxShadow: undefined,
    
    ...DEFAULT_COMMON_PROPS,
  },

  physicalProduct: {
    margin: { marginTop: 0, marginBottom: 20, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 20, marginLeft: 0, marginRight: 0 },
    backgroundColor: undefined,
    mobileBackgroundColor: undefined,
    // Name
    nameFontSize: 20,
    mobileNameFontSize: undefined,
    nameLineHeight: undefined,
    mobileNameLineHeight: undefined,
    nameColor: "rgba(0, 0, 0, 1)",
    mobileNameColor: undefined,
    nameFontType: undefined,
    nameFontFamily: undefined,
    nameFontStyle: undefined,
    // Price
    priceFontSize: 18,
    mobilePriceFontSize: undefined,
    priceLineHeight: undefined,
    mobilePriceLineHeight: undefined,
    priceColor: "rgba(0, 0, 0, 1)",
    mobilePriceColor: undefined,
    priceFontType: undefined,
    priceFontFamily: undefined,
    priceFontStyle: undefined,
    // Description
    descriptionFontSize: 14,
    mobileDescriptionFontSize: undefined,
    descriptionLineHeight: undefined,
    mobileDescriptionLineHeight: undefined,
    descriptionColor: "rgba(80, 80, 80, 1)",
    mobileDescriptionColor: undefined,
    descriptionFontType: undefined,
    descriptionFontFamily: undefined,
    descriptionFontStyle: undefined,
    // Pill
    pillColor: "rgba(255,255,255,1)",
    pillSelectedColor: "rgba(25,118,210,1)",
    pillBorderColor: "rgba(208,208,208,1)",
    pillSelectedBorderColor: "rgba(25,118,210,1)",
    showQuantity: true,
    ...DEFAULT_COMMON_PROPS,
  },

};
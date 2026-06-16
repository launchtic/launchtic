// Browser-safe entry point. Only pure-JS code (no Node built-ins).
// For server-only code (mailer), import from "@launchtic/email/server".
export {
  render,
  sampleVars,
  EMPTY_EMAIL_DOC,
  WELCOME_EMAIL_DOC,
  isEmptyEmailDoc,
  STANDARD_VARIABLES,
  type RenderVars,
} from "./render";

export { EMAIL_FONTS, DEFAULT_EMAIL_FONT, emailFontCss } from "./fonts";

// Pure serializer — used by the editor preview (compiled with mjml-browser).
export { craftToMjml, isCraftDoc, unsubscribeSectionMjml, craftContainsUnsubscribe } from "./craft-mjml";

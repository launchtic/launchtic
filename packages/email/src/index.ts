// Browser-safe entry point. Only includes pure-JS code (no Node built-ins).
// For server-only code (mailer, crypto), import from "@launchtic/email/server".
export {
  render,
  sampleVars,
  EMPTY_EMAIL_DOC,
  WELCOME_EMAIL_DOC,
  isEmptyEmailDoc,
  STANDARD_VARIABLES,
  type RenderVars,
} from "./render";
export { shouldShowLaunchticBadge } from "./badge-gate";

// Server-only entry point. Pulls in nodemailer + node:crypto.
// Do NOT import from this file in a client component or browser bundle.
export {
  render,
  sampleVars,
  EMPTY_EMAIL_DOC,
  WELCOME_EMAIL_DOC,
  isEmptyEmailDoc,
  STANDARD_VARIABLES,
  type RenderVars,
} from "./render";
export { renderEmailContent } from "./render-email";
export {
  createTransporter,
  sendEmail,
  type SmtpConfig,
  type SendEmailInput,
  type SendEmailResult,
} from "./mailer";
export {
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
} from "./unsubscribe";
export {
  injectTracking,
  type ExtractedLink,
  type TrackingResult,
} from "./tracking";

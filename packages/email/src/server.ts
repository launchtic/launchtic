// Server-only entry point. Pulls in nodemailer + node:crypto.
// Do NOT import from this file in a client component or browser bundle.
export { encrypt, decrypt } from "./crypto";
export {
  render,
  renderEmailContent,
  sampleVars,
  EMPTY_EMAIL_DOC,
  WELCOME_EMAIL_DOC,
  isEmptyEmailDoc,
  STANDARD_VARIABLES,
  type RenderVars,
  type RenderOptions,
} from "./render";
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
export { shouldShowLaunchticBadge } from "./badge-gate";
